/**
 * product_price_snapshots (Price Memory) → PriceObservation (read-only map).
 */

import { ML_PRICE_MARKETPLACE } from '@/lib/bots/ingest/mlPriceEngine';
import { DEAL_INTELLIGENCE_SCHEMA_VERSION } from '../constants';
import { buildExactIdentity, hashStable } from '../identity';
import { buildPriceObservationIdempotencyKey } from '../priceObservation';
import type { EvidenceReference, PriceObservation } from '../types';
import type { ProductPriceSnapshotRow } from './rawRows';

export type PriceMemoryMapResult =
  | { ok: true; observation: PriceObservation }
  | { ok: false; reason: string };

export function mapPriceMemorySnapshotToObservation(
  row: ProductPriceSnapshotRow,
  opts?: { now?: Date },
): PriceMemoryMapResult {
  if (row.marketplace !== ML_PRICE_MARKETPLACE) {
    return { ok: false, reason: 'unsupported_marketplace' };
  }
  const sale = Number(row.last_price);
  if (!Number.isFinite(sale) || sale < 0) {
    return { ok: false, reason: 'invalid_price' };
  }
  const currency = (row.currency ?? '').trim().toUpperCase();
  if (!currency || currency.length !== 3) {
    return { ok: false, reason: 'currency_unknown' };
  }

  const productId = String(row.product_id ?? '').trim().toUpperCase();
  if (!productId || productId.length < 8) {
    return { ok: false, reason: 'unknown_identity' };
  }

  const identity = buildExactIdentity({
    merchant: 'mercadolibre',
    mlItemId: productId,
    productFingerprint: `ml:${productId}`,
  });

  const listPrice =
    row.list_price != null && Number.isFinite(Number(row.list_price))
      ? Number(row.list_price)
      : null;

  const evidence: EvidenceReference[] = [
    { kind: 'sot', ref: 'product_price_snapshots' },
    { kind: 'ml_product_id', ref: productId },
    { kind: 'recorded_on', ref: row.recorded_on },
  ];
  if (row.id) evidence.push({ kind: 'snapshot_id', ref: row.id });
  if (row.regular_price != null && Number.isFinite(Number(row.regular_price))) {
    evidence.push({ kind: 'regular_price', ref: String(row.regular_price) });
  }
  // min_price is day ratchet — evidence only, never historical_low claim here.
  if (row.min_price != null && Number.isFinite(Number(row.min_price))) {
    evidence.push({ kind: 'day_min_price', ref: String(row.min_price) });
  }

  const observedAt =
    row.recorded_at && Date.parse(row.recorded_at)
      ? row.recorded_at
      : `${row.recorded_on}T12:00:00.000Z`;

  const now = opts?.now ?? new Date();
  const observedMs = Date.parse(observedAt);
  const freshnessSeconds = Number.isFinite(observedMs)
    ? Math.max(0, Math.floor((now.getTime() - observedMs) / 1000))
    : null;

  const idempotencyKey = buildPriceObservationIdempotencyKey({
    sourceId: 'price_memory_ml',
    identity,
    currency,
    salePrice: sale,
    listPrice,
    observedAt,
  });

  const observationId = row.id
    ? `obs_pm_${row.id.replace(/-/g, '').slice(0, 24)}`
    : `obs_${hashStable([idempotencyKey])}`;

  const observation: PriceObservation = {
    observationId,
    schemaVersion: DEAL_INTELLIGENCE_SCHEMA_VERSION,
    identity,
    merchant: 'mercadolibre',
    seller: null,
    variantKey: null,
    currency,
    listPrice,
    salePrice: sale,
    effectivePrice: null,
    observedAt,
    sourceId: 'price_memory_ml',
    url: null,
    captureMethod: 'official_api',
    extractionConfidence: 0.9,
    freshnessSeconds,
    evidence,
    idempotencyKey,
    backendHint: 'product_price_snapshots',
  };

  return { ok: true, observation };
}
