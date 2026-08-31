import {
  assessOfferAffiliateLink,
  isPlatformAffiliateTagged,
  isResolvedProductOfferUrl,
  storeHasAffiliateProgram,
} from './assessOfferAffiliateLink';
import { applyPlatformAffiliateTags } from './applyPlatformAffiliateTags';
import { offerUrlsAreSameProduct } from '@/lib/offers/offerUrlFingerprint';

export type AffiliatePasteValidation = {
  valid: boolean;
  store: string | null;
  reason: string | null;
  productMatched: boolean;
  affiliateTagged: boolean;
  normalizedUrl: string | null;
};

function parseHttpsUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'https:') return null;
    return u;
  } catch {
    return null;
  }
}

function hostFamily(hostname: string): 'amazon' | 'mercadolibre' | 'aliexpress' | 'walmart' | 'shein' | 'temu' | 'other' {
  const h = hostname.replace(/^www\./i, '').toLowerCase();
  if (h.includes('amazon.') || h === 'amzn.to' || h === 'a.co') return 'amazon';
  if (h.includes('mercadolibre.') || h.includes('meli.la')) return 'mercadolibre';
  if (h.includes('aliexpress.')) return 'aliexpress';
  if (h.includes('walmart.')) return 'walmart';
  if (h.includes('shein.')) return 'shein';
  if (h.includes('temu.')) return 'temu';
  return 'other';
}

export function detectAffiliateStoreLabel(url: string): string | null {
  const parsed = parseHttpsUrl(url);
  if (!parsed) return null;
  switch (hostFamily(parsed.hostname)) {
    case 'amazon':
      return 'Amazon';
    case 'mercadolibre':
      return 'Mercado Libre';
    case 'aliexpress':
      return 'AliExpress';
    case 'walmart':
      return 'Walmart';
    case 'shein':
      return 'SHEIN';
    case 'temu':
      return 'Temu';
    default:
      return parsed.hostname.replace(/^www\./i, '') || null;
  }
}

function sameStoreFamily(originalUrl: string, pastedUrl: string): boolean {
  const a = parseHttpsUrl(originalUrl);
  const b = parseHttpsUrl(pastedUrl);
  if (!a || !b) return false;
  const fa = hostFamily(a.hostname);
  const fb = hostFamily(b.hostname);
  if (fa === 'other' || fb === 'other') return fa === fb;
  return fa === fb;
}

function invalid(
  reason: string,
  partial: Partial<AffiliatePasteValidation> = {}
): AffiliatePasteValidation {
  return {
    valid: false,
    store: null,
    reason,
    productMatched: false,
    affiliateTagged: false,
    normalizedUrl: null,
    ...partial,
  };
}

/**
 * Compara la URL original de la oferta con el enlace afiliado pegado por el moderador.
 * Síncrono — la autoridad final en guardado/aprobación sigue en el servidor.
 */
export function validateAffiliatePaste(
  originalUrl: string,
  pastedAffiliateUrl: string
): AffiliatePasteValidation {
  const original = originalUrl.trim();
  const pasted = pastedAffiliateUrl.trim();

  if (!original) {
    return invalid('La oferta no tiene enlace original');
  }
  if (!pasted) {
    return invalid('Pega el enlace afiliado');
  }

  if (!parseHttpsUrl(original)) {
    return invalid('La URL original no es válida');
  }
  const pastedParsed = parseHttpsUrl(pasted);
  if (!pastedParsed) {
    return invalid('El enlace debe usar HTTPS y ser una URL válida');
  }

  if (!sameStoreFamily(original, pasted)) {
    return invalid('El enlace no corresponde al producto', {
      store: detectAffiliateStoreLabel(pasted),
    });
  }

  const productMatched = offerUrlsAreSameProduct(original, pasted);
  if (!productMatched) {
    return invalid('El enlace no corresponde al producto', {
      store: detectAffiliateStoreLabel(pasted),
      productMatched: false,
    });
  }

  const assessment = assessOfferAffiliateLink(pasted);
  if (!isResolvedProductOfferUrl(pasted) && !assessment.isProduct) {
    return invalid('El enlace no corresponde al producto', {
      store: detectAffiliateStoreLabel(pasted),
      productMatched: false,
    });
  }

  const needsAffiliate = storeHasAffiliateProgram(pasted);
  const affiliateTagged = needsAffiliate ? isPlatformAffiliateTagged(pasted) : true;
  if (needsAffiliate && !affiliateTagged) {
    return invalid('El enlace no corresponde al producto', {
      store: detectAffiliateStoreLabel(pasted),
      productMatched: true,
      affiliateTagged: false,
    });
  }

  let normalizedUrl: string;
  try {
    normalizedUrl = applyPlatformAffiliateTags(pasted);
  } catch {
    normalizedUrl = pasted;
  }

  return {
    valid: true,
    store: detectAffiliateStoreLabel(pasted),
    reason: null,
    productMatched: true,
    affiliateTagged: true,
    normalizedUrl,
  };
}
