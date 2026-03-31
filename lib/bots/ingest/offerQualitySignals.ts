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
};
