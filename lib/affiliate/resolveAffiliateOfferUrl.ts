import { resolveMercadoLibreShortlinks } from '@/lib/offerUrl';
import { applyPlatformAffiliateTags } from './applyPlatformAffiliateTags';

/** Resuelve acortadores (meli.la) y aplica todos los tags de afiliado de plataforma configurados. */
export async function resolveAndNormalizeAffiliateOfferUrl(url: string): Promise<string> {
  const expanded = await resolveMercadoLibreShortlinks(url.trim());
  return applyPlatformAffiliateTags(expanded);
}
