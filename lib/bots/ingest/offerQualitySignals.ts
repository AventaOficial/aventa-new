/**
 * Señales opcionales para filtrado y scoring (ML API, HTML Amazon, etc.).
 */
export type OfferQualitySignals = {
  ratingAverage?: number | null;
  ratingCount?: number | null;
  soldQuantity?: number | null;
  condition?: string | null;
  categoryId?: string | null;
  listingTypeId?: string | null;
  /** Intel histórica opcional (Keepa u otros proveedores). */
  priceLowest30d?: number | null;
  priceLowest90d?: number | null;
  priceVsLowest90dPct?: number | null;
  habitual30d?: number | null;
  savingsVsHabitualPct?: number | null;
  effectiveDiscountPercent?: number | null;
  suspectedArtificialListPrice?: boolean | null;
  /** True cuando Price Memory tiene días suficientes (mlPriceEngine). */
  historyReady?: boolean | null;
  /** Días distintos en ventana 90d (incl. observación de hoy fusionada). */
  samples90d?: number | null;
  priceIntelSource?: 'keepa' | 'aventa_ml' | 'other' | null;
  currentPriceProvenance?:
    | 'source_explicit'
    | 'trusted_enrichment'
    | 'price_intel_derivation'
    | 'user_declared'
    | 'listing_card'
    | 'unknown';
  originalPriceProvenance?:
    | 'source_explicit'
    | 'trusted_enrichment'
    | 'price_intel_derivation'
    | 'user_declared'
    | 'listing_card'
    | 'unknown';
  discountPercentProvenance?:
    | 'source_explicit'
    | 'derived'
    | 'price_intel_derivation'
    | 'user_declared'
    | 'unknown';
  explicitDiscountPercent?: number | null;
  explicitSavings?: number | null;
  promotionType?: string | null;
  promotionBoundToProduct?: boolean | null;
  unboundPromotionMention?: boolean | null;
  /** Origen del precio original en cards del ml_worker (V2 quality gate). */
  cardDiscountSource?: 'badge_reconstructed' | 'card_strikethrough' | 'pdp' | 'unknown' | null;
  /** Badge % de la card: señal de discovery, no prueba de deal. */
  cardBadgePercent?: number | null;
  /** Canonical discount engine (P0) — observation + truth wiring. */
  discountCalculationStatus?: string | null;
  discountTruthSource?: string | null;
  discountTruthConfidence?: string | null;
  discountFalseZeroCorrected?: boolean | null;
  discountConflict?: {
    supplied: number | null;
    computed: number | null;
    delta: number | null;
    reason: string | null;
  } | null;
  /**
   * Provenance of the product image URL (≠ originalPriceProvenance).
   * listing_card = captured from search/listing card DOM.
   */
  imageProvenance?: 'listing_card' | 'pdp' | 'unknown' | null;
};
