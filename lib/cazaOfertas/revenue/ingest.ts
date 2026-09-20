/**
 * CazaOfertasss — FASE 3. Orquestación de ingestión.
 *
 * Raw → normalize → validate → financial append → attribution append.
 * Nunca muta hechos previos. Duplicados ⇒ duplicate:true (idempotente).
 */

import type { CazaResult } from '../types';
import { failResult, okResult } from '../types';
import {
  decideRevenueAttribution,
  type PublicationAttributionIndex,
  type RevenueAttributionPort,
} from './attribution';
import { normalizeRevenueRecord } from './normalize';
import type { AffiliateRevenueEvent, AffiliateRevenueLedgerPort } from './ledger';
import { toFinancialRevenueEvent, validateNormalizedRevenueEvent } from './validate';
import type { RawRevenueRecord, RevenueAttributionRecord } from './types';
import { affiliateRevenueIdempotencyKey } from './ledger';

export interface IngestRevenueRecordResult {
  readonly outcome:
    | 'appended'
    | 'duplicate'
    | 'rejected'
    | 'appended_with_unknown_attribution';
  readonly event: AffiliateRevenueEvent | null;
  readonly attribution: RevenueAttributionRecord | null;
  readonly reasons: readonly string[];
}

export interface IngestRevenueBatchResult {
  readonly results: readonly IngestRevenueRecordResult[];
  readonly appended: number;
  readonly duplicates: number;
  readonly rejected: number;
}

function resolveReversesEventId(
  raw: RawRevenueRecord,
  preferredTarget: AffiliateRevenueEvent | null
): string | null {
  if (!raw.reversesExternalReference) return null;
  if (preferredTarget) return preferredTarget.eventId;
  return affiliateRevenueIdempotencyKey({
    network: raw.provider,
    externalReference: raw.reversesExternalReference,
    eventType: 'COMMISSION',
  });
}

/**
 * Ingesta un único RawRevenueRecord.
 */
export async function ingestRevenueRecord(input: {
  readonly raw: RawRevenueRecord;
  readonly ledger: AffiliateRevenueLedgerPort;
  readonly attributions: RevenueAttributionPort;
  readonly publicationIndex: PublicationAttributionIndex;
  readonly recordedAt: string;
}): Promise<IngestRevenueRecordResult> {
  const normalized = normalizeRevenueRecord(input.raw);
  if (!normalized.ok) {
    return {
      outcome: 'rejected',
      event: null,
      attribution: null,
      reasons: normalized.reasons,
    };
  }

  const validated = validateNormalizedRevenueEvent(normalized.value);
  if (!validated.ok) {
    return {
      outcome: 'rejected',
      event: null,
      attribution: null,
      reasons: validated.reasons,
    };
  }

  let reversesEventId: string | null = null;
  if (input.raw.reversesExternalReference) {
    const preferredType =
      input.raw.eventType === 'CANCELLATION' ? 'ORDER' : 'COMMISSION';
    const preferred = await input.ledger.findByEventId(
      affiliateRevenueIdempotencyKey({
        network: input.raw.provider,
        externalReference: input.raw.reversesExternalReference,
        eventType: preferredType,
      })
    );
    const fallback =
      preferred ??
      (await input.ledger.findByEventId(
        affiliateRevenueIdempotencyKey({
          network: input.raw.provider,
          externalReference: input.raw.reversesExternalReference,
          eventType: preferredType === 'ORDER' ? 'COMMISSION' : 'ORDER',
        })
      ));
    reversesEventId = resolveReversesEventId(input.raw, fallback);
  }

  const financial = toFinancialRevenueEvent(
    validated.value,
    input.recordedAt,
    reversesEventId
  );
  if (!financial.ok) {
    return {
      outcome: 'rejected',
      event: null,
      attribution: null,
      reasons: financial.reasons,
    };
  }

  const append = await input.ledger.append(financial.value);
  if (append.duplicate) {
    const existing = await input.ledger.findByEventId(financial.value.eventId);
    const existingAttr = await input.attributions.findByEventId(financial.value.eventId);
    return {
      outcome: 'duplicate',
      event: existing,
      attribution: existingAttr,
      reasons: ['ingest.duplicate_idempotent'],
    };
  }

  const decision = await decideRevenueAttribution({
    event: financial.value,
    index: input.publicationIndex,
    decidedAt: input.recordedAt,
  });
  if (!decision.ok) {
    return {
      outcome: 'rejected',
      event: financial.value,
      attribution: null,
      reasons: decision.reasons,
    };
  }

  await input.attributions.append(decision.value);

  return {
    outcome:
      decision.value.decision === 'ATTRIBUTED'
        ? 'appended'
        : 'appended_with_unknown_attribution',
    event: financial.value,
    attribution: decision.value,
    reasons: ['ingest.ok'],
  };
}

export async function ingestRevenueBatch(input: {
  readonly records: readonly RawRevenueRecord[];
  readonly ledger: AffiliateRevenueLedgerPort;
  readonly attributions: RevenueAttributionPort;
  readonly publicationIndex: PublicationAttributionIndex;
  readonly recordedAt: string;
}): Promise<IngestRevenueBatchResult> {
  const results: IngestRevenueRecordResult[] = [];
  let appended = 0;
  let duplicates = 0;
  let rejected = 0;

  for (const raw of input.records) {
    const r = await ingestRevenueRecord({ ...input, raw });
    results.push(r);
    if (r.outcome === 'duplicate') duplicates += 1;
    else if (r.outcome === 'rejected') rejected += 1;
    else appended += 1;
  }

  return { results, appended, duplicates, rejected };
}

/** Helper de test: construye Raw mínimo válido. */
export function buildRawRevenueRecord(
  overrides: Partial<RawRevenueRecord> &
    Pick<RawRevenueRecord, 'provider' | 'externalReference' | 'eventType' | 'status'>
): RawRevenueRecord {
  const now = overrides.occurredAt ?? '2026-09-19T12:00:00.000Z';
  return {
    provider: overrides.provider,
    externalReference: overrides.externalReference,
    eventType: overrides.eventType,
    occurredAt: now,
    currency: overrides.currency ?? 'MXN',
    grossAmount: overrides.grossAmount ?? null,
    commissionAmount: overrides.commissionAmount ?? null,
    status: overrides.status,
    productReference: overrides.productReference ?? null,
    externalProductId: overrides.externalProductId ?? null,
    trackingIdentifier: overrides.trackingIdentifier ?? null,
    sourceBatchId: overrides.sourceBatchId ?? 'batch_test_0001',
    sourceMetadata: overrides.sourceMetadata ?? {},
    reversesExternalReference: overrides.reversesExternalReference ?? null,
    receivedAt: overrides.receivedAt ?? now,
  };
}

export function assertIngestOk(
  r: IngestRevenueRecordResult
): CazaResult<AffiliateRevenueEvent> {
  if (!r.event || r.outcome === 'rejected') return failResult(r.reasons);
  return okResult(r.event);
}
