import {
  resolveAmazonShortlinks,
  resolveMercadoLibreShortlinks,
} from '@/lib/offerUrl';
import { applyPlatformAffiliateTags } from './applyPlatformAffiliateTags';

/** Resuelve acortadores (meli.la, amzn.to / a.co) y aplica tags de afiliado de plataforma. */
export async function resolveAndNormalizeAffiliateOfferUrl(url: string): Promise<string> {
  let expanded = await resolveMercadoLibreShortlinks(url.trim());
  expanded = await resolveAmazonShortlinks(expanded);
  return applyPlatformAffiliateTags(expanded);
}
