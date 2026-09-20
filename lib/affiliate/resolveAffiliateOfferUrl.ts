import {
  normalizePastedOfferUrl,
  resolveAmazonShortlinks,
  resolveMercadoLibreShortlinks,
} from '@/lib/offerUrl';
import { offerUrlFingerprint } from '@/lib/offers/offerUrlFingerprint';
import {
  isMercadoLibreBareItemPathUrl,
  isMercadoLibreNavigableProductUrl,
} from '@/lib/offers/resolveMercadoLibreItem';
import { applyPlatformAffiliateTags } from './applyPlatformAffiliateTags';

function isResolvedProductUrl(url: string): boolean {
  const fp = offerUrlFingerprint(url);
  return Boolean(fp && (fp.startsWith('amz:') || fp.startsWith('ml:')));
}

/**
 * Resuelve acortadores (meli.la, amzn.to / a.co), canonicaliza identidad, aplica tags.
 * Delega a OfferUrlResolver; no inventa bare-ID ML.
 */
export async function resolveAndNormalizeAffiliateOfferUrl(url: string): Promise<string> {
  const original = normalizePastedOfferUrl(url);
  if (!original) return original;

  const { resolveOfferUrl } = await import('@/lib/offers/urlResolution');
  const resolved = await resolveOfferUrl(original);

  if (resolved.provider === 'mercado_libre') {
    const source = resolved.canonicalUrl || original;
    if (isMercadoLibreBareItemPathUrl(source)) {
      return source;
    }
    const tagged = applyPlatformAffiliateTags(source);
    if (isMercadoLibreNavigableProductUrl(tagged)) return tagged;
    if (isMercadoLibreNavigableProductUrl(source)) return source;
    return original;
  }

  if (resolved.provider === 'amazon') {
    const expanded = resolved.canonicalUrl || resolved.resolvedUrl || original;
    const tagged = applyPlatformAffiliateTags(expanded);
    if (isResolvedProductUrl(tagged)) return tagged;
    if (isResolvedProductUrl(expanded)) return applyPlatformAffiliateTags(expanded);
    if (isResolvedProductUrl(original)) return applyPlatformAffiliateTags(original);
    return original;
  }

  // Fallback legacy path for edge hosts
  let expanded = await resolveMercadoLibreShortlinks(original);
  expanded = await resolveAmazonShortlinks(expanded);
  const tagged = applyPlatformAffiliateTags(expanded);
  if (isResolvedProductUrl(tagged)) return tagged;
  return original;
}
