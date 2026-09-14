import {
  normalizePastedOfferUrl,
  resolveAmazonShortlinks,
  resolveMercadoLibreShortlinks,
} from '@/lib/offerUrl';
import { offerUrlFingerprint } from '@/lib/offers/offerUrlFingerprint';
import {
  isMercadoLibreBareItemPathUrl,
  isMercadoLibreHost,
  isMercadoLibreNavigableProductUrl,
  resolveMercadoLibreItem,
} from '@/lib/offers/resolveMercadoLibreItem';
import { applyPlatformAffiliateTags } from './applyPlatformAffiliateTags';

function isResolvedProductUrl(url: string): boolean {
  const fp = offerUrlFingerprint(url);
  return Boolean(fp && (fp.startsWith('amz:') || fp.startsWith('ml:')));
}

function isMercadoLibreUrl(url: string): boolean {
  try {
    return isMercadoLibreHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Elige la mejor source URL navegable antes de afiliar.
 * Nunca sustituye un permalink válido por bare-ID.
 */
function pickMercadoLibreSourceUrl(expanded: string, original: string): string {
  const ml = resolveMercadoLibreItem(expanded);
  const candidate = ml?.canonicalUrl?.trim() || '';

  // Solo adoptar canonical si es navegable (contrato: no bare-ID).
  if (candidate && isMercadoLibreNavigableProductUrl(candidate) && ml && ml.confidence !== 'low') {
    return candidate;
  }
  if (candidate && isMercadoLibreNavigableProductUrl(candidate)) {
    return candidate;
  }

  // Preferir expanded/original si ya son permalinks reales.
  if (isMercadoLibreNavigableProductUrl(expanded)) return expanded;
  if (isMercadoLibreNavigableProductUrl(original)) return original;

  // Fail-closed: no inventar. Devolver expanded (puede ser bare) sin reescritura.
  return expanded;
}

/**
 * Resuelve acortadores (meli.la, amzn.to / a.co), canonicaliza item ML cuando hay
 * permalink navegable, y aplica tags de afiliado de plataforma.
 * El caller debe guardar original_offer_url por separado.
 *
 * ML: nunca produce `origin/{ITEM_ID}`. Tags solo sobre source navegable cuando exista.
 */
export async function resolveAndNormalizeAffiliateOfferUrl(url: string): Promise<string> {
  const original = normalizePastedOfferUrl(url);
  if (!original) return original;
  let expanded = await resolveMercadoLibreShortlinks(original);
  expanded = await resolveAmazonShortlinks(expanded);

  if (isMercadoLibreUrl(expanded) || isMercadoLibreUrl(original)) {
    const source = pickMercadoLibreSourceUrl(expanded, original);
    // No afiliar una bare-ID sabiendo que 404: conservar source; tags no la arreglan.
    if (isMercadoLibreBareItemPathUrl(source)) {
      return source;
    }
    const tagged = applyPlatformAffiliateTags(source);
    if (isMercadoLibreNavigableProductUrl(tagged)) return tagged;
    if (isMercadoLibreNavigableProductUrl(source)) return source;
    return original;
  }

  const tagged = applyPlatformAffiliateTags(expanded);
  if (isResolvedProductUrl(tagged)) return tagged;
  if (isResolvedProductUrl(original)) return applyPlatformAffiliateTags(original);
  // Home/captcha: guardar el enlace pegado, no un destino genérico que choca con otras ofertas.
  return original;
}
