/**
 * PriceObservation builders — logical layer; backends remain existing snapshots.
 */

import { DEAL_INTELLIGENCE_SCHEMA_VERSION } from './constants';
import { hashStable, identitiesCompatibleForObservation } from './identity';
import type {
  CaptureMethod,
  DealIdentity,
  EvidenceReference,
  PriceObservation,
} from './types';

export function buildPriceObservationIdempotencyKey(input: {
  sourceId: string;
  identity: DealIdentity;
  currency: string;
  salePrice: number | null;
  listPrice: number | null;
  observedAt: string;
  variantKey?: string | null;
}): string {
  const fp =
    input.identity.productFingerprint ??
    input.identity.asin ??
    input.identity.mlItemId ??
    input.identity.canonicalUrl ??
    'unknown';
  // Bucket observedAt to minute for replay stability within same minute.
  const bucket = input.observedAt.slice(0, 16);
  return `po:${hashStable([
    input.sourceId,
    fp,
    input.currency,
    String(input.salePrice ?? ''),
    String(input.listPrice ?? ''),
    input.variantKey ?? input.identity.variantKey ?? '',
    bucket,
  ])}`;
}

export function buildPriceObservation(input: {
  identity: DealIdentity;
  merchant?: string | null;
  seller?: string | null;
  currency: string;
  listPrice?: number | null;
  salePrice?: number | null;
  /** Must remain null unless stacking evidenced elsewhere. */
  effectivePrice?: number | null;
  observedAt: string;
  sourceId: string;
  url?: string | null;
  captureMethod: CaptureMethod;
  extractionConfidence: number;
  freshnessSeconds?: number | null;
  evidence?: EvidenceReference[];
  backendHint?: PriceObservation['backendHint'];
  now?: Date;
}): PriceObservation | { ok: false; reason: string } {
  const currency = input.currency.trim().toUpperCase();
  if (!currency || currency.length !== 3) {
    return { ok: false, reason: 'currency_invalid' };
  }
  if (input.salePrice != null && !Number.isFinite(input.salePrice)) {
    return { ok: false, reason: 'sale_price_invalid' };
  }
  if (input.listPrice != null && !Number.isFinite(input.listPrice)) {
    return { ok: false, reason: 'list_price_invalid' };
  }

  const idempotencyKey = buildPriceObservationIdempotencyKey({
    sourceId: input.sourceId,
    identity: input.identity,
    currency,
    salePrice: input.salePrice ?? null,
    listPrice: input.listPrice ?? null,
    observedAt: input.observedAt,
  });

  const observationId = `obs_${hashStable([idempotencyKey])}`;

  return {
    observationId,
    schemaVersion: DEAL_INTELLIGENCE_SCHEMA_VERSION,
    identity: input.identity,
    merchant: input.merchant ?? input.identity.merchant,
    seller: input.seller ?? input.identity.seller,
    variantKey: input.identity.variantKey,
    currency,
    listPrice: input.listPrice ?? null,
    salePrice: input.salePrice ?? null,
    effectivePrice: input.effectivePrice ?? null,
    observedAt: input.observedAt,
    sourceId: input.sourceId,
    url: input.url ?? input.identity.canonicalUrl,
    captureMethod: input.captureMethod,
    extractionConfidence: Math.max(0, Math.min(1, input.extractionConfidence)),
    freshnessSeconds: input.freshnessSeconds ?? null,
    evidence: input.evidence ?? [],
    idempotencyKey,
    backendHint: input.backendHint ?? 'logical_only',
  };
}

export function isObservationStale(input: {
  observedAt: string;
  now?: Date;
  maxAgeSeconds: number;
}): boolean {
  const t = Date.parse(input.observedAt);
  if (!Number.isFinite(t)) return true;
  const now = (input.now ?? new Date()).getTime();
  return now - t > input.maxAgeSeconds * 1000;
}

export function assertCurrencyMatch(
  a: string,
  b: string,
): { ok: boolean; reason: string | null } {
  if (a.trim().toUpperCase() !== b.trim().toUpperCase()) {
    return { ok: false, reason: 'currency_mismatch' };
  }
  return { ok: true, reason: null };
}

export function assertObservationCompatible(
  existing: PriceObservation,
  incoming: PriceObservation,
): { ok: boolean; reason: string | null } {
  const cur = assertCurrencyMatch(existing.currency, incoming.currency);
  if (!cur.ok) return cur;
  return identitiesCompatibleForObservation(existing.identity, incoming.identity);
}

/** Deduplicate by idempotency key — second insert is reuse. */
export function dedupeObservationsByIdempotency(
  rows: PriceObservation[],
): { unique: PriceObservation[]; duplicateKeys: string[] } {
  const seen = new Set<string>();
  const unique: PriceObservation[] = [];
  const duplicateKeys: string[] = [];
  for (const row of rows) {
    if (seen.has(row.idempotencyKey)) {
      duplicateKeys.push(row.idempotencyKey);
      continue;
    }
    seen.add(row.idempotencyKey);
    unique.push(row);
  }
  return { unique, duplicateKeys };
}

/**
 * Historical low claim gate — never invent.
 * historyReady must come from Price Memory / verified signals.
 */
export function mayClaimHistoricalLow(historyReady: boolean): boolean {
  return historyReady === true;
}
