import {
  resolveAmazonShortlinks,
  resolveMercadoLibreShortlinks,
} from '@/lib/offerUrl';
import { offerUrlFingerprint } from '@/lib/offers/offerUrlFingerprint';
import { applyPlatformAffiliateTags } from './applyPlatformAffiliateTags';

function isResolvedProductUrl(url: string): boolean {
  const fp = offerUrlFingerprint(url);
  return Boolean(fp && (fp.startsWith('amz:') || fp.startsWith('ml:')));
}

/** Resuelve acortadores (meli.la, amzn.to / a.co) y aplica tags de afiliado de plataforma. */
export async function resolveAndNormalizeAffiliateOfferUrl(url: string): Promise<string> {
  const original = url.trim();
  let expanded = await resolveMercadoLibreShortlinks(original);
  expanded = await resolveAmazonShortlinks(expanded);
  const tagged = applyPlatformAffiliateTags(expanded);
  if (isResolvedProductUrl(tagged)) return tagged;
  if (isResolvedProductUrl(original)) return applyPlatformAffiliateTags(original);
  // Home/captcha: guardar el enlace pegado, no un destino genérico que choca con otras ofertas.
  return original;
}
