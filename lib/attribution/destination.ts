/**
 * Separación conceptual ORIGINAL destination vs AFFILIATE destination.
 * Nunca sobrescribe URL original con tags afiliados.
 */

export type DestinationPair = {
  /** URL publicada / afiliada (offers.offer_url). */
  affiliateDestination: string | null;
  /** URL producto pre-tag si existe (offers.original_offer_url). */
  originalDestination: string | null;
  /** Merchant network derivado de destination afiliada. */
  merchantNetwork: string | null;
};

export function buildDestinationPair(input: {
  offerUrl?: string | null;
  originalOfferUrl?: string | null;
  detectNetwork: (url: string) => string;
}): DestinationPair {
  const affiliate = (input.offerUrl ?? '').trim() || null;
  const originalRaw = (input.originalOfferUrl ?? '').trim() || null;
  // Si original === affiliate, aún así preservar original como dato; no inventar.
  const original = originalRaw && originalRaw !== affiliate ? originalRaw : originalRaw;
  const merchantNetwork = affiliate ? input.detectNetwork(affiliate) : null;
  return {
    affiliateDestination: affiliate,
    originalDestination: original,
    merchantNetwork,
  };
}
