import { applyPlatformAffiliateTags } from './applyPlatformAffiliateTags';
import { offerUrlFingerprint } from '@/lib/offers/offerUrlFingerprint';

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

/** ¿Esta tienda tiene algún programa de afiliado configurado en env? */
export function storeHasAffiliateProgram(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;

  if (hostIncludes(trimmed, 'mercadolibre.') || hostIncludes(trimmed, 'meli.la')) {
    return Boolean(
      getEnv('ML_AFFILIATE_TAG', 'NEXT_PUBLIC_ML_AFFILIATE_TAG') ||
        getEnv('ML_MATT_TOOL', 'NEXT_PUBLIC_ML_MATT_TOOL')
    );
  }
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

/** URL que apunta a un producto concreto (MLM-/ASIN), no a home ni captcha. */
export function isResolvedProductOfferUrl(url: string): boolean {
  const fp = offerUrlFingerprint(url.trim());
  return Boolean(fp && (fp.startsWith('amz:') || fp.startsWith('ml:')));
}

/**
 * ¿La URL ya lleva el tag de afiliado de Aventa que correspondería aplicar hoy?
 * Compara el resultado de `applyPlatformAffiliateTags` con lo guardado.
 */
export function isPlatformAffiliateTagged(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (!storeHasAffiliateProgram(trimmed)) return true;

  const expected = applyPlatformAffiliateTags(trimmed);
  try {
    const current = new URL(trimmed);
    const target = new URL(expected);

    const mlTag = getEnv('ML_AFFILIATE_TAG', 'NEXT_PUBLIC_ML_AFFILIATE_TAG');
    if (mlTag && (hostIncludes(trimmed, 'mercadolibre.') || hostIncludes(trimmed, 'meli.la'))) {
      if (current.searchParams.get('tag') !== mlTag) return false;
    }

    const mattTool = getEnv('ML_MATT_TOOL', 'NEXT_PUBLIC_ML_MATT_TOOL');
    const mattWord = getEnv('ML_MATT_WORD', 'NEXT_PUBLIC_ML_MATT_WORD');
    if (mattTool && (hostIncludes(trimmed, 'mercadolibre.') || hostIncludes(trimmed, 'meli.la'))) {
      if (current.searchParams.get('matt_tool') !== mattTool) return false;
      if (mattWord && current.searchParams.get('matt_word') !== mattWord) return false;
    }

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
