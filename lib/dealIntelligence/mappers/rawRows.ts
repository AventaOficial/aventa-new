/**
 * Raw SoT row shapes for DI read adapters (no writes).
 */

export type OfferPriceSnapshotRow = {
  id?: string;
  offer_id: string;
  price: number;
  original_price?: number | null;
  source?: string | null;
  recorded_at: string;
};

/** Optional enrichment from offers join — never invent if missing. */
export type OfferSnapshotIdentityHint = {
  productFingerprint?: string | null;
  store?: string | null;
  /** Host-only or path-redacted; full affiliate URLs discouraged. */
  urlHostPath?: string | null;
  currencyHint?: string | null;
};

export type ProductPriceSnapshotRow = {
  id?: string;
  marketplace: string;
  product_id: string;
  last_price: number;
  min_price?: number | null;
  list_price?: number | null;
  regular_price?: number | null;
  currency: string;
  recorded_on: string;
  recorded_at?: string | null;
};
