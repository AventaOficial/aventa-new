/**
 * Day 12 — Provenance completeness diagnosis for discovery reacquisition.
 *
 * PRICE MEMORY IS NOT PROVENANCE.
 * This module only *diagnoses* gaps; it never marks provenance complete from
 * historyReady / PM tips alone, and never fabricates evidence.
 */

import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import { mintTrustedOriginalPrice } from '@/lib/bots/ingest/candidateInsertGate';
import { extractMercadoLibreItemId } from '@/lib/offers/offerUrlFingerprint';
import { normalizeMlProductId } from '@/lib/bots/ingest/mlPriceEngine';

/** Structured gap kinds — map onto existing S6.1 reason codes; not a second gate. */
export const PROVENANCE_GAP_KINDS = [
  'none',
  'missing_current_original',
  'untrusted_provenance_tag',
  'badge_reconstructed',
  'identity_mismatch',
  'stale_or_absent_current',
  'artificial_list',
] as const;

export type ProvenanceGapKind = (typeof PROVENANCE_GAP_KINDS)[number];

/**
 * Observable reason tokens appended alongside S6.1 codes (not replacements).
 * assignPrimaryTerminalReason still collapses to PROVENANCE_FAILURE.
 */
export const PROVENANCE_DIAGNOSTIC_CODES = [
  'PROVENANCE_MISSING_CURRENT_EVIDENCE',
  'PROVENANCE_IDENTITY_MISMATCH',
  'PROVENANCE_STALE_EVIDENCE',
  'PROVENANCE_SOURCE_MISMATCH',
] as const;

export type ProvenanceDiagnosticCode = (typeof PROVENANCE_DIAGNOSTIC_CODES)[number];

export type ProvenanceCompletenessReport = {
  complete: boolean;
  gap: ProvenanceGapKind;
  detail: string;
  diagnosticCodes: ProvenanceDiagnosticCode[];
  /** True only when current sale + trusted original provenance pass mint rules. */
  hasTrustedCurrentOriginal: boolean;
  historyReady: boolean;
  /** PM tip alone never counts as current original evidence. */
  pmHistoryIsNotProvenance: true;
};

function normalizeId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return (
    normalizeMlProductId(raw)?.toUpperCase() ??
    raw.replace(/-/g, '').toUpperCase()
  );
}

/**
 * Diagnose whether meta carries enough *current* offer evidence for S6.1 mint trust.
 * Does not mutate meta. Does not invent prices/timestamps/provenance tags.
 */
export function diagnoseProvenanceCompleteness(input: {
  meta: ParsedOfferMetadata | null;
  expectedProductId?: string | null;
  /** When live fetch failed and only a PM tip / seed meta remains. */
  currentEvidenceAbsent?: boolean;
}): ProvenanceCompletenessReport {
  const base = {
    pmHistoryIsNotProvenance: true as const,
  };

  if (input.currentEvidenceAbsent === true || !input.meta) {
    return {
      ...base,
      complete: false,
      gap: 'stale_or_absent_current',
      detail: 'no_current_offer_evidence',
      diagnosticCodes: ['PROVENANCE_MISSING_CURRENT_EVIDENCE', 'PROVENANCE_STALE_EVIDENCE'],
      hasTrustedCurrentOriginal: false,
      historyReady: false,
    };
  }

  const meta = input.meta;
  const signals = meta.signals ?? null;
  const historyReady = signals?.historyReady === true;

  if (signals?.suspectedArtificialListPrice === true) {
    return {
      ...base,
      complete: false,
      gap: 'artificial_list',
      detail: 'suspected_artificial_list_price',
      diagnosticCodes: ['PROVENANCE_SOURCE_MISMATCH'],
      hasTrustedCurrentOriginal: false,
      historyReady,
    };
  }

  const expected = normalizeId(input.expectedProductId ?? null);
  if (expected) {
    const fromUrl = normalizeId(extractMercadoLibreItemId(meta.canonicalUrl));
    if (fromUrl && fromUrl !== expected) {
      return {
        ...base,
        complete: false,
        gap: 'identity_mismatch',
        detail: `product_id_url_mismatch:${expected}!=${fromUrl}`,
        diagnosticCodes: ['PROVENANCE_IDENTITY_MISMATCH'],
        hasTrustedCurrentOriginal: false,
        historyReady,
      };
    }
  }

  const sale = meta.discountPrice;
  if (!(Number.isFinite(sale) && sale > 0)) {
    return {
      ...base,
      complete: false,
      gap: 'stale_or_absent_current',
      detail: 'missing_sale_price',
      diagnosticCodes: ['PROVENANCE_MISSING_CURRENT_EVIDENCE'],
      hasTrustedCurrentOriginal: false,
      historyReady,
    };
  }

  const original = meta.originalPrice;
  if (original == null || !(original > sale)) {
    return {
      ...base,
      complete: false,
      gap: 'missing_current_original',
      detail: 'api_or_listing_original_absent',
      diagnosticCodes: ['PROVENANCE_MISSING_CURRENT_EVIDENCE'],
      hasTrustedCurrentOriginal: false,
      historyReady,
    };
  }

  const card = (signals?.cardDiscountSource ?? '').toLowerCase();
  if (card === 'badge_reconstructed') {
    return {
      ...base,
      complete: false,
      gap: 'badge_reconstructed',
      detail: 'badge_reconstructed_original_untrusted',
      diagnosticCodes: ['PROVENANCE_SOURCE_MISMATCH'],
      hasTrustedCurrentOriginal: false,
      historyReady,
    };
  }

  const trusted = mintTrustedOriginalPrice(signals);
  if (!trusted) {
    return {
      ...base,
      complete: false,
      gap: 'untrusted_provenance_tag',
      detail: `original_provenance=${signals?.originalPriceProvenance ?? 'missing'};historyReady=${historyReady}`,
      diagnosticCodes: ['PROVENANCE_SOURCE_MISMATCH'],
      hasTrustedCurrentOriginal: false,
      historyReady,
    };
  }

  return {
    ...base,
    complete: true,
    gap: 'none',
    detail: 'current_sale_and_trusted_original',
    diagnosticCodes: [],
    hasTrustedCurrentOriginal: true,
    historyReady,
  };
}

/**
 * Merge diagnostic codes into an existing S6.1 reason list without dropping gate codes.
 */
export function appendProvenanceDiagnostics(
  reasonCodes: string[],
  report: ProvenanceCompletenessReport,
): string[] {
  if (report.complete) return reasonCodes;
  const out = [...reasonCodes];
  for (const c of report.diagnosticCodes) {
    if (!out.includes(c)) out.push(c);
  }
  return out;
}
