import { applyPlatformAffiliateTags } from './applyPlatformAffiliateTags';
import { isSupportedRetailerProductUrl } from '@/lib/offers/retailerProductUrl';

function getEnv(...keys: string[]): string | null {
  for (const k of keys) {
    const v = process.env[k]?.trim();
    if (v) return v;
  }
  return null;
}

function hostIncludes(url: string, fragment: string): boolean {
  try {
    return new URL(url.trim()).hostname.toLowerCase().includes(fragment);
  } catch {
    return false;
  }
}

function isMercadoLibreUrl(url: string): boolean {
  return hostIncludes(url, 'mercadolibre.') || hostIncludes(url, 'meli.la');
}

/**
 * ¿Esta tienda tiene programa de afiliado activo?
 * Mercado Libre siempre: su afiliado llega por el meli.la que pega el moderador, no por env.
 * El resto depende de env.
 */
export function storeHasAffiliateProgram(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;

  if (isMercadoLibreUrl(trimmed)) return true;
  if (hostIncludes(trimmed, 'amazon.') || hostIncludes(trimmed, 'amzn.to') || hostIncludes(trimmed, 'a.co')) {
    return Boolean(getEnv('AMAZON_ASSOCIATE_TAG', 'NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG'));
  }
  if (hostIncludes(trimmed, 'aliexpress.')) {
    return Boolean(getEnv('ALIEXPRESS_AFF_FCID', 'NEXT_PUBLIC_ALIEXPRESS_AFF_FCID'));
  }
  if (hostIncludes(trimmed, 'walmart.')) {
    return Boolean(getEnv('WALMART_AFFILIATE_QUERY', 'NEXT_PUBLIC_WALMART_AFFILIATE_QUERY'));
  }
  if (hostIncludes(trimmed, 'shein.')) {
    return Boolean(getEnv('SHEIN_AFF_ID', 'NEXT_PUBLIC_SHEIN_AFF_ID'));
  }
  if (hostIncludes(trimmed, 'temu.')) {
    return Boolean(getEnv('TEMU_AFFILIATE_RP_PID', 'NEXT_PUBLIC_TEMU_AFFILIATE_RP_PID'));
  }
  return false;
}

/** URL de producto de un retailer soportado. Home, búsqueda y captcha no pasan. */
export function isResolvedProductOfferUrl(url: string): boolean {
  return isSupportedRetailerProductUrl(url.trim());
}

/**
 * ¿La URL ya lleva el tag de afiliado de Aventa que correspondería aplicar hoy?
 * Compara el resultado de `applyPlatformAffiliateTags` con lo guardado.
 */
export function isPlatformAffiliateTagged(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (!storeHasAffiliateProgram(trimmed)) return true;
  // Ningún parámetro en la URL certifica un afiliado ML (tag/matt_* se escriben a mano y
  // un meli.la puede ser de otra cuenta). Solo el meli.la verificado en moderación (link_mod_ok).
  if (isMercadoLibreUrl(trimmed)) return false;

  const expected = applyPlatformAffiliateTags(trimmed);
  try {
    const current = new URL(trimmed);
    const target = new URL(expected);

    const amzTag = getEnv('AMAZON_ASSOCIATE_TAG', 'NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG');
    if (amzTag && hostIncludes(trimmed, 'amazon.')) {
      if (current.searchParams.get('tag') !== amzTag) return false;
    }

    const aliFcid = getEnv('ALIEXPRESS_AFF_FCID', 'NEXT_PUBLIC_ALIEXPRESS_AFF_FCID');
    if (aliFcid && hostIncludes(trimmed, 'aliexpress.')) {
      if (current.searchParams.get('aff_fcid') !== aliFcid) return false;
    }

    const sheinId = getEnv('SHEIN_AFF_ID', 'NEXT_PUBLIC_SHEIN_AFF_ID');
    if (sheinId && hostIncludes(trimmed, 'shein.')) {
      if (current.searchParams.get('aff_id') !== sheinId) return false;
    }

    const temuPid = getEnv('TEMU_AFFILIATE_RP_PID', 'NEXT_PUBLIC_TEMU_AFFILIATE_RP_PID');
    if (temuPid && hostIncludes(trimmed, 'temu.')) {
      if (current.searchParams.get('rp_pid') !== temuPid) return false;
    }

    // Walmart: compara que los params del env estén presentes
    const walmartQuery = getEnv('WALMART_AFFILIATE_QUERY', 'NEXT_PUBLIC_WALMART_AFFILIATE_QUERY');
    if (walmartQuery && hostIncludes(trimmed, 'walmart.')) {
      const params = new URLSearchParams(walmartQuery);
      for (const [key, val] of params.entries()) {
        if (key && current.searchParams.get(key) !== val) return false;
      }
    }

    // Si llegamos aquí y expected cambió algo no cubierto arriba, comparar strings normalizados
    if (expected !== trimmed && target.href !== current.href) {
      return false;
    }

    return true;
  } catch {
    return expected === trimmed;
  }
}

export type AffiliateLinkAssessment = {
  isProduct: boolean;
  needsAffiliate: boolean;
  isTagged: boolean;
};

export function assessOfferAffiliateLink(url: string | null | undefined): AffiliateLinkAssessment {
  const trimmed = (url ?? '').trim();
  if (!trimmed) {
    return { isProduct: false, needsAffiliate: false, isTagged: false };
  }
  const isProduct = isResolvedProductOfferUrl(trimmed);
  const needsAffiliate = storeHasAffiliateProgram(trimmed);
  const isTagged = isPlatformAffiliateTagged(trimmed);
  return { isProduct, needsAffiliate, isTagged };
}
