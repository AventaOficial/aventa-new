/**
 * offer_price_snapshots → PriceObservation (read-only map).
 */

import { DEAL_INTELLIGENCE_SCHEMA_VERSION } from '../constants';
import {
  buildExactIdentity,
  buildUnknownIdentity,
  hashStable,
} from '../identity';
import { buildPriceObservationIdempotencyKey } from '../priceObservation';
import type { CaptureMethod, EvidenceReference, PriceObservation } from '../types';
import type { OfferPriceSnapshotRow, OfferSnapshotIdentityHint } from './rawRows';

function mapCaptureMethod(source: string | null | undefined): CaptureMethod {
  switch ((source ?? 'app').toLowerCase()) {
    case 'health':
      return 'derived';
    case 'create':
    case 'update':
    case 'manual':
    case 'app':
      return 'user_submission';
    default:
      return 'unknown';
  }
}

function identityFromHint(
  hint: OfferSnapshotIdentityHint | undefined,
): ReturnType<typeof buildUnknownIdentity> {
  const fp = hint?.productFingerprint?.trim() || null;
  if (fp?.startsWith('amz:')) {
    return buildExactIdentity({
      merchant: hint?.store ?? 'amazon',
      asin: fp.slice(4),
      productFingerprint: fp,
      canonicalUrl: hint?.urlHostPath ?? null,
    });
  }
  if (fp?.startsWith('ml:')) {
    return buildExactIdentity({
      merchant: hint?.store ?? 'mercadolibre',
      mlItemId: fp.slice(3),
      productFingerprint: fp,
      canonicalUrl: hint?.urlHostPath ?? null,
    });
  }
  return buildUnknownIdentity({
    merchant: hint?.store ?? null,
    canonicalUrl: hint?.urlHostPath ?? null,
    productFingerprint: fp,
  });
}

export type OfferSnapshotMapResult =
  | { ok: true; observation: PriceObservation }
  | { ok: false; reason: string };

/**
 * Map one offer snapshot row. Currency is UNKNOWN in schema —
 * pass currencyHint (e.g. MXN program default) or mapping fails.
 */
export function mapOfferPriceSnapshotToObservation(
  row: OfferPriceSnapshotRow,
  hint?: OfferSnapshotIdentityHint,
  opts?: { now?: Date; staleAfterSeconds?: number },
): OfferSnapshotMapResult {
  const price = Number(row.price);
  if (!Number.isFinite(price) || price < 0) {
    return { ok: false, reason: 'invalid_price' };
  }
  const listRaw = row.original_price;
  const listPrice =
    listRaw != null && Number.isFinite(Number(listRaw)) ? Number(listRaw) : null;

  const currency = (hint?.currencyHint ?? '').trim().toUpperCase();
  if (!currency || currency.length !== 3) {
    return { ok: false, reason: 'currency_unknown' };
  }

  const identity = identityFromHint(hint);
  const evidence: EvidenceReference[] = [
    { kind: 'offer_id', ref: row.offer_id },
    { kind: 'sot', ref: 'offer_price_snapshots' },
  ];
  if (row.id) evidence.push({ kind: 'snapshot_id', ref: row.id });
  if (row.source) evidence.push({ kind: 'snapshot_source', ref: String(row.source) });
  if (!hint?.currencyHint) {
    /* unreachable when currency valid from hint */
  } else {
    evidence.push({ kind: 'derived_program_currency', ref: currency });
  }

  const observedAt = row.recorded_at;
  const now = opts?.now ?? new Date();
  const observedMs = Date.parse(observedAt);
  const freshnessSeconds = Number.isFinite(observedMs)
    ? Math.max(0, Math.floor((now.getTime() - observedMs) / 1000))
    : null;

  const extractionConfidence =
    identity.identityStatus === 'exact' ? 0.85 : identity.identityStatus === 'probable' ? 0.55 : 0.4;

  const idempotencyKey = buildPriceObservationIdempotencyKey({
    sourceId: 'offer_price_snapshots',
    identity,
    currency,
    salePrice: price,
    listPrice,
    observedAt,
  });

  // Prefer stable id from snapshot uuid when present.
  const observationId = row.id
    ? `obs_offer_${row.id.replace(/-/g, '').slice(0, 24)}`
    : `obs_${hashStable([idempotencyKey])}`;

  const observation: PriceObservation = {
    observationId,
    schemaVersion: DEAL_INTELLIGENCE_SCHEMA_VERSION,
    identity,
    merchant: identity.merchant,
    seller: null,
    variantKey: null,
    currency,
    listPrice,
    salePrice: price,
    effectivePrice: null,
    observedAt,
    sourceId: 'offer_price_snapshots',
    url: hint?.urlHostPath ?? null,
    captureMethod: mapCaptureMethod(row.source),
    extractionConfidence,
    freshnessSeconds,
    evidence,
    idempotencyKey,
    backendHint: 'offer_price_snapshots',
  };

  return { ok: true, observation };
}
