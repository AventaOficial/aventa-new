/**
 * RawObservation / SourceEvent — S2 Supply Candidate Boundary (Option A).
 *
 * Logical contracts only. Persistence = existing stores:
 * - bot_meta provenance on offers.pending
 * - product_price_snapshots via PriceObservation mapping
 * - hunter_supply_runs / source stats for cycle telemetry
 *
 * Never dumps full scrape HTML into Postgres.
 * Never publishes. Never writes rewards/economy/distribution.
 */

import { createHash } from 'node:crypto';
import {
  DEAL_INTELLIGENCE_SCHEMA_VERSION,
  DEAL_SCORE_VERSION,
} from './constants';
import {
  buildExactIdentity,
  hashStable,
  resolveIdentityFromUrl,
} from './identity';
import { buildPriceObservation } from './priceObservation';
import type {
  CaptureMethod,
  DealIdentity,
  DealScore,
  EvidenceReference,
  PriceObservation,
} from './types';

export const RAW_OBSERVATION_SCHEMA_VERSION = 'raw_observation.v1' as const;
export const RAW_PARSER_VERSION = 'ingest_parser.v1' as const;
export const RAW_NORMALIZATION_VERSION = 'ingest_normalize.v1' as const;

/** Persist only terminal / audit-relevant statuses on bot_meta; rest = telemetry. */
export type RawObservationProcessingStatus =
  | 'received'
  | 'normalized'
  | 'validated'
  | 'scored'
  | 'suppressed'
  | 'duplicate'
  | 'inserted'
  | 'failed';

export type RawPayloadRef = {
  /**
   * inline_meta — small structured fields only (title/prices/ids).
   * omitted — hash-only (default for large/sensitive bodies).
   * external_ref — pointer outside Postgres (future; unused in S2).
   */
  kind: 'inline_meta' | 'omitted' | 'external_ref';
  evidenceHash: string;
  /** Compact non-secret summary for replay diagnostics. */
  summary: Record<string, unknown> | null;
  externalRef: string | null;
  /** Estimated original payload size if known; never the payload itself. */
  byteEstimate: number | null;
};

export type RawFetchMetadata = {
  httpStatus: number | null;
  finalUrl: string | null;
  redirectHops: number | null;
  contentType: string | null;
  timedOut: boolean;
  blocked: boolean;
  errorCode: string | null;
};

export type SourceEvent = {
  sourceId: string;
  sourceEventId: string;
  occurredAt: string;
  /** Idempotency: sourceId + sourceEventId */
  idempotencyKey: string;
};

export type RawObservationProvenance = {
  captureMethod: CaptureMethod;
  workerRunId: string | null;
  supplyRunId: string | null;
  seedId: string | null;
  sourceDetail: string | null;
  profileId: string | null;
};

export type RawObservation = {
  observationId: string;
  schemaVersion: typeof RAW_OBSERVATION_SCHEMA_VERSION;
  sourceEvent: SourceEvent;
  observedAt: string;
  url: string;
  merchant: string | null;
  externalProductId: string | null;
  externalListingId: string | null;
  identity: DealIdentity;
  listPrice: number | null;
  salePrice: number | null;
  currency: string | null;
  payload: RawPayloadRef;
  fetchMetadata: RawFetchMetadata;
  parserVersion: string;
  normalizationVersion: string;
  provenance: RawObservationProvenance;
  processingStatus: RawObservationProcessingStatus;
  linkedOfferId: string | null;
  /**
   * Observation idempotency (not candidate):
   * source + fingerprint/url + time bucket + price fingerprint.
   */
  idempotencyKey: string;
};

/** Compact slice safe to embed in offers.bot_meta (no giant payloads). */
export type RawObservationProvenanceSlice = {
  schemaVersion: typeof RAW_OBSERVATION_SCHEMA_VERSION;
  observationId: string;
  sourceEventId: string;
  sourceId: string;
  observedAt: string;
  url: string;
  evidenceHash: string;
  parserVersion: string;
  normalizationVersion: string;
  identityStatus: DealIdentity['identityStatus'];
  productFingerprint: string | null;
  processingStatus: RawObservationProcessingStatus;
  dealScoreVersion: string | null;
  dealScore: number | null;
  dealScoreConfidence: number | null;
};

export function buildSourceEventIdempotencyKey(
  sourceId: string,
  sourceEventId: string,
): string {
  return `se:${hashStable([sourceId.trim(), sourceEventId.trim()])}`;
}

export function buildSourceEvent(input: {
  sourceId: string;
  sourceEventId: string;
  occurredAt?: string;
}): SourceEvent {
  const sourceId = input.sourceId.trim();
  const sourceEventId = input.sourceEventId.trim();
  return {
    sourceId,
    sourceEventId,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    idempotencyKey: buildSourceEventIdempotencyKey(sourceId, sourceEventId),
  };
}

/** Minute bucket — same observation replay within the minute collapses. */
export function observationTimeBucket(iso: string): string {
  return iso.slice(0, 16);
}

export function buildObservationIdempotencyKey(input: {
  sourceId: string;
  productKey: string;
  observedAt: string;
  salePrice: number | null;
  listPrice: number | null;
  currency?: string | null;
}): string {
  return `ro:${hashStable([
    input.sourceId,
    input.productKey,
    observationTimeBucket(input.observedAt),
    String(input.salePrice ?? ''),
    String(input.listPrice ?? ''),
    (input.currency ?? '').trim().toUpperCase(),
  ])}`;
}

export function hashEvidenceParts(parts: Array<string | number | null | undefined>): string {
  return createHash('sha256')
    .update(parts.map((p) => (p == null ? '' : String(p))).join('|'))
    .digest('hex')
    .slice(0, 40);
}

export function buildRawPayloadRef(input: {
  kind?: RawPayloadRef['kind'];
  evidenceParts: Array<string | number | null | undefined>;
  summary?: Record<string, unknown> | null;
  externalRef?: string | null;
  byteEstimate?: number | null;
}): RawPayloadRef {
  return {
    kind: input.kind ?? 'omitted',
    evidenceHash: hashEvidenceParts(input.evidenceParts),
    summary: input.summary ?? null,
    externalRef: input.externalRef ?? null,
    byteEstimate: input.byteEstimate ?? null,
  };
}

export function emptyFetchMetadata(
  partial?: Partial<RawFetchMetadata>,
): RawFetchMetadata {
  return {
    httpStatus: null,
    finalUrl: null,
    redirectHops: null,
    contentType: null,
    timedOut: false,
    blocked: false,
    errorCode: null,
    ...partial,
  };
}

/**
 * Build RawObservation from normalized listing fields (machine ingest).
 * Does not fetch, insert, or publish.
 */
export function buildRawObservation(input: {
  sourceId: string;
  sourceEventId: string;
  url: string;
  observedAt?: string;
  merchant?: string | null;
  salePrice?: number | null;
  listPrice?: number | null;
  currency?: string | null;
  title?: string | null;
  identity?: DealIdentity;
  captureMethod?: CaptureMethod;
  sourceDetail?: string | null;
  supplyRunId?: string | null;
  workerRunId?: string | null;
  seedId?: string | null;
  profileId?: string | null;
  fetchMetadata?: Partial<RawFetchMetadata>;
  parserVersion?: string;
  normalizationVersion?: string;
  processingStatus?: RawObservationProcessingStatus;
  linkedOfferId?: string | null;
  /** Optional raw body size estimate — never the body. */
  payloadByteEstimate?: number | null;
}): RawObservation {
  const observedAt = input.observedAt ?? new Date().toISOString();
  const url = input.url.trim();
  const identity =
    input.identity ??
    resolveIdentityFromUrl({
      url,
      merchant: input.merchant ?? null,
    });
  const productKey =
    identity.productFingerprint ??
    identity.asin ??
    identity.mlItemId ??
    url.toLowerCase();
  const sourceEvent = buildSourceEvent({
    sourceId: input.sourceId,
    sourceEventId: input.sourceEventId,
    occurredAt: observedAt,
  });
  const salePrice =
    input.salePrice != null && Number.isFinite(input.salePrice) ? input.salePrice : null;
  const listPrice =
    input.listPrice != null && Number.isFinite(input.listPrice) ? input.listPrice : null;
  const currency = input.currency?.trim().toUpperCase() || null;

  const payload = buildRawPayloadRef({
    kind: 'inline_meta',
    evidenceParts: [
      sourceEvent.sourceId,
      sourceEvent.sourceEventId,
      url,
      productKey,
      salePrice,
      listPrice,
      currency,
      input.title ?? '',
      input.parserVersion ?? RAW_PARSER_VERSION,
      input.normalizationVersion ?? RAW_NORMALIZATION_VERSION,
    ],
    summary: {
      title: input.title?.slice(0, 120) ?? null,
      salePrice,
      listPrice,
      currency,
      merchant: input.merchant ?? identity.merchant,
      fingerprint: identity.productFingerprint,
    },
    byteEstimate: input.payloadByteEstimate ?? null,
  });

  const idempotencyKey = buildObservationIdempotencyKey({
    sourceId: sourceEvent.sourceId,
    productKey,
    observedAt,
    salePrice,
    listPrice,
    currency,
  });

  return {
    observationId: `raw_${hashStable([idempotencyKey])}`,
    schemaVersion: RAW_OBSERVATION_SCHEMA_VERSION,
    sourceEvent,
    observedAt,
    url,
    merchant: input.merchant ?? identity.merchant,
    externalProductId: identity.asin ?? identity.mlItemId ?? identity.merchantProductId,
    externalListingId: identity.mlItemId ?? identity.asin ?? null,
    identity,
    listPrice,
    salePrice,
    currency,
    payload,
    fetchMetadata: emptyFetchMetadata(input.fetchMetadata),
    parserVersion: input.parserVersion ?? RAW_PARSER_VERSION,
    normalizationVersion: input.normalizationVersion ?? RAW_NORMALIZATION_VERSION,
    provenance: {
      captureMethod: input.captureMethod ?? 'unknown',
      workerRunId: input.workerRunId ?? null,
      supplyRunId: input.supplyRunId ?? null,
      seedId: input.seedId ?? null,
      sourceDetail: input.sourceDetail ?? null,
      profileId: input.profileId ?? null,
    },
    processingStatus: input.processingStatus ?? 'received',
    linkedOfferId: input.linkedOfferId ?? null,
    idempotencyKey,
  };
}

export function withProcessingStatus(
  obs: RawObservation,
  processingStatus: RawObservationProcessingStatus,
  linkedOfferId?: string | null,
): RawObservation {
  return {
    ...obs,
    processingStatus,
    linkedOfferId: linkedOfferId !== undefined ? linkedOfferId : obs.linkedOfferId,
  };
}

/** Same source event id → identical SourceEvent idempotency key. */
export function sourceEventsAreSame(a: SourceEvent, b: SourceEvent): boolean {
  return a.idempotencyKey === b.idempotencyKey;
}

/** Same observation idempotency → treat as replay. */
export function observationsAreSame(a: RawObservation, b: RawObservation): boolean {
  return a.idempotencyKey === b.idempotencyKey;
}

export function dedupeRawObservationsByIdempotency(
  rows: RawObservation[],
): { unique: RawObservation[]; duplicateKeys: string[] } {
  const seen = new Set<string>();
  const unique: RawObservation[] = [];
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
 * RawObservation → PriceObservation (logical).
 * Backend remains product_price_snapshots / offer_price_snapshots — no new SQL table.
 * Requires exact identity + finite sale price + ISO currency.
 */
export function mapRawObservationToPriceObservation(
  obs: RawObservation,
  opts?: { backendHint?: PriceObservation['backendHint'] },
): PriceObservation | { ok: false; reason: string } {
  if (obs.identity.identityStatus !== 'exact') {
    return { ok: false, reason: 'identity_not_exact' };
  }
  if (obs.salePrice == null || !Number.isFinite(obs.salePrice)) {
    return { ok: false, reason: 'sale_price_missing' };
  }
  const currency = (obs.currency ?? 'MXN').trim().toUpperCase();
  if (currency.length !== 3) {
    return { ok: false, reason: 'currency_invalid' };
  }

  const evidence: EvidenceReference[] = [
    { kind: 'raw_observation', ref: obs.observationId },
    { kind: 'evidence_hash', ref: obs.payload.evidenceHash },
    { kind: 'source_event', ref: obs.sourceEvent.sourceEventId },
  ];

  return buildPriceObservation({
    identity: obs.identity,
    merchant: obs.merchant,
    currency,
    listPrice: obs.listPrice,
    salePrice: obs.salePrice,
    effectivePrice: null,
    observedAt: obs.observedAt,
    sourceId: obs.sourceEvent.sourceId,
    url: obs.url,
    captureMethod: obs.provenance.captureMethod,
    extractionConfidence: obs.identity.identityStatus === 'exact' ? 0.85 : 0.4,
    evidence,
    backendHint: opts?.backendHint ?? 'product_price_snapshots',
  });
}

/** Prefer exact ML identity when mapping toward Price Memory (ML-only today). */
export function preferMlExactIdentity(identity: DealIdentity): DealIdentity {
  if (identity.identityStatus === 'exact' && identity.mlItemId) {
    return buildExactIdentity({
      merchant: identity.merchant ?? 'mercadolibre',
      mlItemId: identity.mlItemId,
      canonicalUrl: identity.canonicalUrl,
      seller: identity.seller,
      variantKey: identity.variantKey,
      productFingerprint: identity.productFingerprint ?? `ml:${identity.mlItemId}`,
    });
  }
  return identity;
}

export function toProvenanceSlice(
  obs: RawObservation,
  dealScore?: DealScore | null,
): RawObservationProvenanceSlice {
  return {
    schemaVersion: RAW_OBSERVATION_SCHEMA_VERSION,
    observationId: obs.observationId,
    sourceEventId: obs.sourceEvent.sourceEventId,
    sourceId: obs.sourceEvent.sourceId,
    observedAt: obs.observedAt,
    url: obs.url.slice(0, 2048),
    evidenceHash: obs.payload.evidenceHash,
    parserVersion: obs.parserVersion,
    normalizationVersion: obs.normalizationVersion,
    identityStatus: obs.identity.identityStatus,
    productFingerprint: obs.identity.productFingerprint,
    processingStatus: obs.processingStatus,
    dealScoreVersion: dealScore?.version ?? DEAL_SCORE_VERSION,
    dealScore: dealScore != null ? dealScore.score : null,
    dealScoreConfidence: dealScore != null ? dealScore.confidence : null,
  };
}

/** Schema marker for consumers — DI schema stays independent. */
export const RAW_OBSERVATION_DI_SCHEMA = DEAL_INTELLIGENCE_SCHEMA_VERSION;
