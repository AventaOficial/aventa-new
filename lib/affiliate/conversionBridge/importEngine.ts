/**
 * Parser → normalizer → validator → dedupe.
 * El mismo archivo dos veces no produce una segunda decisión económica nueva.
 */

import type { CanonicalConversionState, NormalizedProviderEvent, ProviderEvidence } from './contract';
import { decideEconomics, type EconomicDecision } from './economics';
import { matchClickReference, type ClickSnapshot, type MatchResult } from './match';
import {
  containsSensitiveMaterial,
  knownCurrency,
  timestampIssue,
  type QualityCode,
} from './quality';

export type ExistingConversion = {
  externalConversionId: string;
  externalOrderId: string | null;
  canonicalStatus: CanonicalConversionState;
};

export type AcceptedRow = {
  disposition: 'accepted';
  event: NormalizedProviderEvent;
  evidence: ProviderEvidence;
  match: MatchResult;
  decision: EconomicDecision;
  qualityFlags: QualityCode[];
};

export type DuplicateRow = {
  disposition: 'duplicate';
  externalConversionId: string;
  rowReference: string;
  qualityFlags: QualityCode[];
};

export type RejectedRow = {
  disposition: 'rejected';
  rowReference: string;
  externalConversionId: string | null;
  qualityFlags: QualityCode[];
};

export type ImportRow = AcceptedRow | DuplicateRow | RejectedRow;

export type ImportBatch = {
  batchId: string;
  provider: 'MERCADOLIBRE';
  sourceMode: 'OFFICIAL_REPORT_IMPORT' | 'API';
  schemaVersion: string;
  testData: boolean;
  importedAt: string;
  status: 'succeeded' | 'partial' | 'failed';
  errorCode: string | null;
  rowCount: number;
  accepted: number;
  rejected: number;
  duplicates: number;
  unmatched: number;
  confirmed: number;
  pending: number;
  reversed: number;
  providerDataAt: string | null;
  rows: ImportRow[];
};

function evidenceFor(event: NormalizedProviderEvent, batchId: string): ProviderEvidence {
  return {
    provider: event.provider,
    source_mode: event.sourceMode,
    source_batch_id: batchId,
    source_row_reference: event.rowReference,
    external_conversion_id: event.externalConversionId,
    external_order_id: event.externalOrderId,
    imported_at: event.importedAt,
    provider_event_version: event.providerEventVersion,
  };
}

function reject(event: NormalizedProviderEvent | null, rowReference: string, flags: QualityCode[]): RejectedRow {
  return {
    disposition: 'rejected',
    rowReference,
    externalConversionId: event?.externalConversionId ?? null,
    qualityFlags: flags,
  };
}

export function importProviderEvents(input: {
  batchId: string;
  importedAt: string;
  nowMs: number;
  schemaVersion: string;
  testData: boolean;
  events: NormalizedProviderEvent[];
  clicks: readonly ClickSnapshot[];
  existing: readonly ExistingConversion[];
  parseError?: string | null;
}): ImportBatch {
  const provider = 'MERCADOLIBRE' as const;
  const sourceMode = input.events[0]?.sourceMode ?? 'OFFICIAL_REPORT_IMPORT';
  if (input.parseError) {
    return emptyBatch(input, provider, sourceMode, 'failed', input.parseError);
  }

  const existingById = new Map(input.existing.map((row) => [row.externalConversionId, row]));
  const existingOrders = new Set(
    input.existing.map((row) => row.externalOrderId).filter((id): id is string => Boolean(id)),
  );
  const seenIds = new Set<string>();
  const seenOrders = new Set<string>();
  const rows: ImportRow[] = [];

  for (const event of input.events) {
    if (containsSensitiveMaterial(event.externalConversionId) || containsSensitiveMaterial(event.clickReference ?? '')) {
      rows.push(reject(event, event.rowReference, ['PII_OR_CREDENTIAL_MATERIAL']));
      continue;
    }
    if (!event.externalConversionId.trim()) {
      const flags: QualityCode[] = ['MISSING_EXTERNAL_ID'];
      if (event.grossCommissionCents != null) flags.push('COMMISSION_WITHOUT_CONVERSION');
      rows.push(reject(event, event.rowReference, flags));
      continue;
    }
    if (event.canonicalStatus === 'UNKNOWN') {
      rows.push(reject(event, event.rowReference, ['PROVIDER_STATUS_UNKNOWN']));
      continue;
    }
    const flags: QualityCode[] = [];
    if (timestampIssue(event.occurredAt, input.nowMs)) {
      rows.push(reject(event, event.rowReference, ['IMPOSSIBLE_TIMESTAMP']));
      continue;
    }
    const prior = existingById.get(event.externalConversionId) ?? null;
    if (seenIds.has(event.externalConversionId) || prior) {
      if (!prior || prior.canonicalStatus === event.canonicalStatus) {
        rows.push({
          disposition: 'duplicate',
          externalConversionId: event.externalConversionId,
          rowReference: event.rowReference,
          qualityFlags: ['DUPLICATE_EXTERNAL_ID'],
        });
        seenIds.add(event.externalConversionId);
        continue;
      }
    }
    if (event.externalOrderId && (seenOrders.has(event.externalOrderId) || existingOrders.has(event.externalOrderId))) {
      const sameConversion = prior?.externalOrderId === event.externalOrderId;
      if (!sameConversion) {
        rows.push(reject(event, event.rowReference, ['DUPLICATE_ORDER']));
        continue;
      }
    }
    if (event.canonicalStatus === 'REVERSED' && !prior) {
      rows.push(reject(event, event.rowReference, ['REVERSED_WITHOUT_ORIGINAL']));
      continue;
    }
    if (event.currency && !knownCurrency(event.currency)) {
      rows.push(reject(event, event.rowReference, ['UNKNOWN_CURRENCY']));
      continue;
    }
    if (event.grossCommissionCents != null && event.grossCommissionCents < 0) {
      rows.push(reject(event, event.rowReference, ['INVALID_COMMISSION']));
      continue;
    }
    if (event.canonicalStatus === 'CONFIRMED' && (event.grossCommissionCents == null || !knownCurrency(event.currency))) {
      rows.push(reject(event, event.rowReference, ['CONFIRMED_WITHOUT_EVIDENCE']));
      continue;
    }

    const match = matchClickReference(event.clickReference, event.offerReference, input.clicks);
    if (match.status === 'UNMATCHED') {
      flags.push('UNMATCHED_CONVERSION', 'CONVERSION_WITHOUT_CLICK');
    }
    const decision = decideEconomics({
      canonicalStatus: event.canonicalStatus,
      match,
      existingStatus: prior?.canonicalStatus ?? null,
    });
    if (event.canonicalStatus !== 'INVALID' && event.grossCommissionCents != null && !event.externalConversionId) {
      flags.push('COMMISSION_WITHOUT_CONVERSION');
    }
    rows.push({
      disposition: 'accepted',
      event: { ...event, currency: knownCurrency(event.currency) ?? event.currency },
      evidence: evidenceFor(event, input.batchId),
      match,
      decision,
      qualityFlags: flags,
    });
    seenIds.add(event.externalConversionId);
    if (event.externalOrderId) seenOrders.add(event.externalOrderId);
    existingById.set(event.externalConversionId, {
      externalConversionId: event.externalConversionId,
      externalOrderId: event.externalOrderId,
      canonicalStatus: event.canonicalStatus,
    });
  }

  const accepted = rows.filter((row) => row.disposition === 'accepted');
  const rejected = rows.filter((row) => row.disposition === 'rejected').length;
  const duplicates = rows.filter((row) => row.disposition === 'duplicate').length;
  const unmatched = accepted.filter((row) => row.match.status === 'UNMATCHED').length;
  const confirmed = accepted.filter((row) => row.event.canonicalStatus === 'CONFIRMED').length;
  const pending = accepted.filter((row) => row.event.canonicalStatus === 'PENDING' || row.event.canonicalStatus === 'APPROVED').length;
  const reversed = accepted.filter((row) => row.event.canonicalStatus === 'REVERSED').length;
  const providerDataAt = accepted
    .map((row) => row.event.occurredAt)
    .sort()
    .at(-1) ?? null;
  const status =
    accepted.length === 0 && duplicates > 0 && rejected === 0
      ? 'succeeded'
      : accepted.length === 0
        ? 'failed'
        : rejected > 0
          ? 'partial'
          : 'succeeded';

  return {
    batchId: input.batchId,
    provider,
    sourceMode,
    schemaVersion: input.schemaVersion,
    testData: input.testData,
    importedAt: input.importedAt,
    status,
    errorCode: status === 'failed' ? 'NO_ACCEPTED_ROWS' : null,
    rowCount: input.events.length,
    accepted: accepted.length,
    rejected,
    duplicates,
    unmatched,
    confirmed,
    pending,
    reversed,
    providerDataAt,
    rows,
  };
}

function emptyBatch(
  input: { batchId: string; importedAt: string; schemaVersion: string; testData: boolean },
  provider: 'MERCADOLIBRE',
  sourceMode: 'OFFICIAL_REPORT_IMPORT' | 'API',
  status: 'failed',
  errorCode: string,
): ImportBatch {
  return {
    batchId: input.batchId,
    provider,
    sourceMode,
    schemaVersion: input.schemaVersion,
    testData: input.testData,
    importedAt: input.importedAt,
    status,
    errorCode,
    rowCount: 0,
    accepted: 0,
    rejected: 0,
    duplicates: 0,
    unmatched: 0,
    confirmed: 0,
    pending: 0,
    reversed: 0,
    providerDataAt: null,
    rows: [],
  };
}

export function failedImportBatch(input: {
  batchId: string;
  importedAt: string;
  schemaVersion: string;
  testData: boolean;
  errorCode: string;
}): ImportBatch {
  return emptyBatch(input, 'MERCADOLIBRE', 'OFFICIAL_REPORT_IMPORT', 'failed', input.errorCode);
}
