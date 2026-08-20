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
  priceIntelSource?: 'keepa' | 'aventa_ml' | 'other' | null;
};
