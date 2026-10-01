/**
 * Familias de evento de valor para adquisición.
 * No sustituyen DQE ni Price Memory. No definen publicación.
 */

export const OFFER_EVENT_FAMILIES = [
  'price_crush',
  'premium_crush',
  'stock_up',
  'absolute_saving',
  'brand_model',
  'stack',
  'freebie',
  'bundle',
  'anomaly',
  'utility',
  'unknown',
] as const;

export type OfferEventFamily = (typeof OFFER_EVENT_FAMILIES)[number];

/** Prioridad de evaluación (no de mint). Más alto = entra primero al presupuesto. */
export const FAMILY_ACQUISITION_BONUS: Record<OfferEventFamily, number> = {
  premium_crush: 28,
  brand_model: 22,
  stock_up: 18,
  utility: 16,
  price_crush: 14,
  absolute_saving: 12,
  stack: 10,
  freebie: 8,
  bundle: 8,
  anomaly: 6,
  unknown: 0,
};
