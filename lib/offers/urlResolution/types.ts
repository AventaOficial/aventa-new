/**
 * Offer URL resolution contract — single coordination layer.
 * Does not reimplement ML identity (resolveMercadoLibreItem) or SSRF (fetchUrlSafety).
 */

export type OfferUrlProvider =
  | 'amazon'
  | 'mercado_libre'
  | 'walmart'
  | 'liverpool'
  | 'coppel'
  | 'elektra'
  | 'unknown';


export type QueryParamClass =
  | 'identity-bearing'
  | 'variant-bearing'
  | 'tracking-only'
  | 'share-only'
  | 'unknown';

export type OfferUrlResolveResult = {
  provider: OfferUrlProvider;
  /** URL safe for fetch / display after strip of tracking/share. */
  canonicalUrl: string;
  /** Stable product id for dedupe: ml:MLM… | amz:ASIN | null if fail-closed. */
  productFingerprint: string | null;
  /**
   * Human/architecture identity label (does NOT replace DB fingerprint).
   * e.g. mercadolibre_mx:pid:MLM2936772026 | amazon_mx:asin:B0…
   */
  productIdentity: string | null;
  /** Variant-bearing query (e.g. ML attributes) when preserved. */
  variantIdentity: string | null;
  /** Final URL after shortlink redirects (before strip). */
  resolvedUrl: string | null;
  confidence: 'high' | 'medium' | 'low';
  provenance: string[];
  /** Raw input after paste normalize. */
  inputUrl: string;
};
