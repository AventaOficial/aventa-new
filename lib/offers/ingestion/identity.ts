/**
 * Stable server-side ingestion identity.
 * Precedence: Amazon ASIN → Mercado Libre item → Liverpool SKU → URL fingerprint.
 * Title / price / discount / seller are never identity.
 */

import {
  extractAmazonAsin,
  extractLiverpoolSkuForFingerprint,
  extractMercadoLibreItemId,
  offerUrlFingerprint,
} from '@/lib/offers/offerUrlFingerprint';

export type IngestionIdentityStrategy =
  | 'amazon_asin'
  | 'ml_item'
  | 'liverpool_sku'
  | 'url_fingerprint'
  | 'none';

export type IngestionIdentity = {
  /** Key persisted on offers.ingestion_identity_key when non-null. */
  key: string | null;
  strategy: IngestionIdentityStrategy;
  /** Strong amz|ml|liv fingerprint for existing product_fingerprint UNIQUE. */
  productFingerprint: string | null;
  reason: string | null;
};

/**
 * Resolve deterministic identity for idempotent ingest.
 * Weak shortlinks (meli.la:*) return strategy none — no UNIQUE claim.
 * Liverpool homepage/search (no PDP SKU) → none (never invent identity).
 */
export function resolveIngestionIdentity(rawUrl: string): IngestionIdentity {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { key: null, strategy: 'none', productFingerprint: null, reason: 'empty_url' };
  }

  const asin = extractAmazonAsin(trimmed);
  if (asin) {
    const key = `amz:${asin}`;
    return { key, strategy: 'amazon_asin', productFingerprint: key, reason: null };
  }

  const mlItem = extractMercadoLibreItemId(trimmed);
  if (mlItem) {
    const key = `ml:${mlItem}`;
    return { key, strategy: 'ml_item', productFingerprint: key, reason: null };
  }

  const livSku = extractLiverpoolSkuForFingerprint(trimmed);
  if (livSku) {
    const key = `liv:${livSku}`;
    return { key, strategy: 'liverpool_sku', productFingerprint: key, reason: null };
  }

  const fp = offerUrlFingerprint(trimmed);
  if (!fp) {
    return { key: null, strategy: 'none', productFingerprint: null, reason: 'unparseable_or_weak' };
  }

  if (fp.startsWith('amz:')) {
    return { key: fp, strategy: 'amazon_asin', productFingerprint: fp, reason: null };
  }
  if (fp.startsWith('ml:')) {
    return { key: fp, strategy: 'ml_item', productFingerprint: fp, reason: null };
  }
  if (fp.startsWith('liv:')) {
    return { key: fp, strategy: 'liverpool_sku', productFingerprint: fp, reason: null };
  }
  if (fp.startsWith('meli.la:')) {
    return {
      key: null,
      strategy: 'none',
      productFingerprint: null,
      reason: 'meli_la_shortlink_not_product_identity',
    };
  }
  if (fp.startsWith('url:')) {
    return { key: fp, strategy: 'url_fingerprint', productFingerprint: null, reason: null };
  }

  // offerUrlFingerprint catch-all without a typed prefix is not a durable identity.
  return {
    key: null,
    strategy: 'none',
    productFingerprint: null,
    reason: 'malformed_or_untyped_fingerprint',
  };
}
