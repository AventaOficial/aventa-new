/**
 * Day 12.1 — Discovery candidate observability contract (OBSERVABILITY ONLY).
 *
 * These fields explain *why* gates decided what they decided.
 * They are NOT a second authority: DQE / S6.1 / provenance mint trust remain the gates.
 *
 * Null means "not observed / not applicable" — never invent values.
 */

import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import type { ArtificialListPriceClause } from '@/lib/bots/ingest/mlPriceEngine';
import type { ProvenanceCompletenessReport } from './provenanceCompleteness';
import type { VerifiedYieldTerminalReason } from './verifiedYieldTerminal';

/** How current original/list evidence was obtained (not PM tip alone). */
export const ORIGINAL_RECOVERED_VIA = [
  'prices_endpoint',
  'products_items',
  'listing_card',
  'explicit_source',
  'unavailable',
  'unknown',
] as const;

export type OriginalRecoveredVia = (typeof ORIGINAL_RECOVERED_VIA)[number];

export const ACQUISITION_PATHS = [
  'sticky_observe',
  'discovery_evidence_fallback',
  'precomputed_only',
  'unknown',
] as const;

export type AcquisitionPath = (typeof ACQUISITION_PATHS)[number];

/** Compact durable per-candidate observation (≤50 per cycle). */
export type DiscoveryCandidateObservation = {
  schema_version: 1;
  url: string;
  source_id: string;
  product_id: string | null;
  history_ready: boolean;
  acquisition_path: AcquisitionPath;
  /** Where original/list came from during live acquisition. */
  original_recovered_via: OriginalRecoveredVia | null;
  /**
   * Day 12.3 — durable synonym of `original_recovered_via` (same vocabulary).
   * Null when acquisition did not attempt / could not classify a source.
   */
  original_source: OriginalRecoveredVia | null;
  current_price: number | null;
  original_price: number | null;
  current_price_provenance: string | null;
  original_price_provenance: string | null;
  /** Gate decision fields (mirror existing; not new authority). */
  quality_decision: string;
  would_insert: boolean;
  dqe_decision: string | null;
  primary_terminal: VerifiedYieldTerminalReason;
  reason_codes: string[];
  /** Provenance gap diagnosis (observe-only). */
  provenance: {
    complete: boolean;
    gap: string;
    detail: string;
    diagnostic_codes: string[];
    identity_match_method: string | null;
  } | null;
  /** Artificial-list diagnostics (observe-only; detection unchanged). */
  artificial: {
    detected: boolean;
    /** Exact clause labels that fired (may be multiple). */
    clauses: ArtificialListPriceClause[];
    /** Stable joined reason for operators; null when not detected. */
    reason: string | null;
    list_price: number | null;
    current_price: number | null;
    habitual30d: number | null;
    history_ready: boolean;
  } | null;
};

export function normalizeOriginalRecoveredVia(
  raw: string | null | undefined,
): OriginalRecoveredVia {
  const s = (raw ?? '').trim().toLowerCase();
  if ((ORIGINAL_RECOVERED_VIA as readonly string[]).includes(s)) {
    return s as OriginalRecoveredVia;
  }
  if (s === 'none' || s === '') return 'unavailable';
  return 'unknown';
}

export function buildCandidateObservation(input: {
  url: string;
  sourceId: string;
  productId: string | null;
  historyReady: boolean;
  meta: ParsedOfferMetadata | null;
  acquisitionPath: AcquisitionPath;
  originalRecoveredVia: OriginalRecoveredVia | null;
  qualityDecision: string;
  wouldInsert: boolean;
  dqeDecision: string | null;
  primaryTerminal: VerifiedYieldTerminalReason;
  reasonCodes: string[];
  provenanceDiag: ProvenanceCompletenessReport | null;
}): DiscoveryCandidateObservation {
  const signals = input.meta?.signals ?? null;
  const clauses = Array.isArray(signals?.artificialListPriceClauses)
    ? (signals!.artificialListPriceClauses as ArtificialListPriceClause[])
    : [];
  const artificialDetected = signals?.suspectedArtificialListPrice === true;

  return {
    schema_version: 1,
    url: input.url,
    source_id: input.sourceId,
    product_id: input.productId,
    history_ready: input.historyReady,
    acquisition_path: input.acquisitionPath,
    original_recovered_via: input.originalRecoveredVia,
    original_source: input.originalRecoveredVia,
    current_price:
      input.meta && Number.isFinite(input.meta.discountPrice) ? input.meta.discountPrice : null,
    original_price:
      input.meta?.originalPrice != null && Number.isFinite(input.meta.originalPrice)
        ? input.meta.originalPrice
        : null,
    current_price_provenance:
      typeof signals?.currentPriceProvenance === 'string'
        ? signals.currentPriceProvenance
        : null,
    original_price_provenance:
      typeof signals?.originalPriceProvenance === 'string'
        ? signals.originalPriceProvenance
        : null,
    quality_decision: input.qualityDecision,
    would_insert: input.wouldInsert,
    dqe_decision: input.dqeDecision,
    primary_terminal: input.primaryTerminal,
    reason_codes: input.reasonCodes,
    provenance: input.provenanceDiag
      ? {
          complete: input.provenanceDiag.complete,
          gap: input.provenanceDiag.gap,
          detail: input.provenanceDiag.detail,
          diagnostic_codes: [...input.provenanceDiag.diagnosticCodes],
          identity_match_method: input.provenanceDiag.identityMatchMethod ?? null,
        }
      : null,
    artificial: {
      detected: artificialDetected,
      clauses,
      reason: artificialDetected
        ? clauses.length > 0
          ? clauses.join('+')
          : 'suspected_artificial_list_price'
        : null,
      list_price:
        input.meta?.originalPrice != null && Number.isFinite(input.meta.originalPrice)
          ? input.meta.originalPrice
          : null,
      current_price:
        input.meta && Number.isFinite(input.meta.discountPrice) ? input.meta.discountPrice : null,
      habitual30d:
        typeof signals?.habitual30d === 'number' && Number.isFinite(signals.habitual30d)
          ? signals.habitual30d
          : null,
      history_ready: input.historyReady,
    },
  };
}
