import { storeHasAffiliateProgram } from '@/lib/affiliate/assessOfferAffiliateLink';

/**
 * Monetización de UNA oferta. Es independiente de la fuente que la descubrió.
 *
 * source = walmart_mx
 * monetizationStatus = non_affiliate
 * → la oferta sigue siendo válida para Aventa.
 *
 * No rechaza. No publica. Solo clasifica.
 */
export type OfferMonetizationStatus = 'affiliate' | 'non_affiliate' | 'unknown';

export function classifyOfferMonetization(url: string | null | undefined): OfferMonetizationStatus {
  const probe = (url ?? '').trim();
  if (!probe) return 'unknown';
  try {
    new URL(probe);
  } catch {
    return 'unknown';
  }
  return storeHasAffiliateProgram(probe) ? 'affiliate' : 'non_affiliate';
}
