import {
  normalizePastedOfferUrl,
  resolveAmazonShortlinks,
  resolveMercadoLibreShortlinks,
} from '@/lib/offerUrl';
import { offerUrlFingerprint } from '@/lib/offers/offerUrlFingerprint';
import { resolveMercadoLibreItem } from '@/lib/offers/resolveMercadoLibreItem';
import { applyPlatformAffiliateTags } from './applyPlatformAffiliateTags';

function isResolvedProductUrl(url: string): boolean {
  const fp = offerUrlFingerprint(url);
  return Boolean(fp && (fp.startsWith('amz:') || fp.startsWith('ml:')));
}

/**
 * Resuelve acortadores (meli.la, amzn.to / a.co), canonicaliza item ML cuando hay
 * señales confiables, y aplica tags de afiliado de plataforma.
 * El caller debe guardar original_offer_url por separado.
 */
export async function resolveAndNormalizeAffiliateOfferUrl(url: string): Promise<string> {
  const original = normalizePastedOfferUrl(url);
  if (!original) return original;
  let expanded = await resolveMercadoLibreShortlinks(original);
  expanded = await resolveAmazonShortlinks(expanded);

  const ml = resolveMercadoLibreItem(expanded);
  if (ml?.canonicalUrl && ml.confidence !== 'low') {
    expanded = ml.canonicalUrl;
  }

  const tagged = applyPlatformAffiliateTags(expanded);
  if (isResolvedProductUrl(tagged)) return tagged;
  if (isResolvedProductUrl(original)) return applyPlatformAffiliateTags(original);
  // Home/captcha: guardar el enlace pegado, no un destino genérico que choca con otras ofertas.
  return original;
}
