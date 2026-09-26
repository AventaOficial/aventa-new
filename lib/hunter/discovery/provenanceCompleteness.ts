/**
 * Day 12 — Provenance completeness diagnosis for discovery reacquisition.
 *
 * PRICE MEMORY IS NOT PROVENANCE.
 * This module only *diagnoses* gaps; it never marks provenance complete from
 * historyReady / PM tips alone, and never fabricates evidence.
 *
 * Day 12.2 — ML PRODUCT (catalog tip) ≠ LISTING (item on URL).
 * A tip that reacquired via /products/{catalog}/items may legitimately yield a
 * different listing item_id; that is not an identity mismatch when the listing
 * id returned by that API equals the URL item id.
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

/** Deterministic ML sticky identity bind methods (reuse OfferQualitySignals vocabulary). */
export const ML_IDENTITY_MATCH_METHODS = [
  'exact_item_id',
  'exact_catalog_id',
  'catalog_to_listing_via_products_items',
] as const;

export type MlIdentityMatchMethod = (typeof ML_IDENTITY_MATCH_METHODS)[number];

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
  /** Day 12.2 — how tip vs URL were reconciled (null when N/A or mismatch). */
  identityMatchMethod?: MlIdentityMatchMethod | null;
};

function normalizeId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return (
    normalizeMlProductId(raw)?.toUpperCase() ??
    raw.replace(/-/g, '').toUpperCase()
  );
}

/**
 * Resolve whether PM tip identity matches the listing on the canonical URL.
 * Never invents catalog↔listing maps — only accepts an API-returned listing id.
 */
export function resolveStickyIdentityMatch(input: {
  expectedTipId?: string | null;
  urlItemId?: string | null;
  /** Listing item id returned by /products/{catalog}/items (or tip when tip is an item). */
  acquiredListingItemId?: string | null;
  /** Catalog tip used for products/items (defaults to expectedTipId when listing differs). */
  catalogProductId?: string | null;
}): {
  matched: boolean;
  method: MlIdentityMatchMethod | null;
  detail: string;
} {
  const expected = normalizeId(input.expectedTipId);
  const fromUrl = normalizeId(input.urlItemId);
  const listing = normalizeId(input.acquiredListingItemId);
  const catalog = normalizeId(input.catalogProductId) ?? expected;

  if (!expected || !fromUrl) {
    return { matched: true, method: null, detail: 'identity_check_skipped' };
  }

  if (fromUrl === expected) {
    const method: MlIdentityMatchMethod =
      listing && listing === fromUrl && catalog && catalog !== listing
        ? 'exact_catalog_id'
        : 'exact_item_id';
    return { matched: true, method, detail: `exact:${expected}` };
  }

  // Deterministic catalog → listing: tip catalog fetched products/items → listing on URL.
  if (
    listing &&
    listing === fromUrl &&
    catalog &&
    catalog === expected &&
    listing !== expected
  ) {
    return {
      matched: true,
      method: 'catalog_to_listing_via_products_items',
      detail: `catalog:${catalog}->listing:${listing}`,
    };
  }

  return {
    matched: false,
    method: null,
    detail: `product_id_url_mismatch:${expected}!=${fromUrl}`,
  };
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
      identityMatchMethod: null,
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
      identityMatchMethod: null,
    };
  }

  const expected = normalizeId(input.expectedProductId ?? null);
  const fromUrl = normalizeId(extractMercadoLibreItemId(meta.canonicalUrl));

  const identity = resolveStickyIdentityMatch({
    expectedTipId: expected,
    urlItemId: fromUrl,
    acquiredListingItemId: normalizeId(signals?.mlListingItemId),
    catalogProductId: normalizeId(signals?.mlCatalogProductId) ?? expected,
  });

  if (expected && fromUrl && !identity.matched) {
    return {
      ...base,
      complete: false,
      gap: 'identity_mismatch',
      detail: identity.detail,
      diagnosticCodes: ['PROVENANCE_IDENTITY_MISMATCH'],
      hasTrustedCurrentOriginal: false,
      historyReady,
      identityMatchMethod: null,
    };
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
      identityMatchMethod: identity.method,
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
      identityMatchMethod: identity.method,
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
      identityMatchMethod: identity.method,
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
      identityMatchMethod: identity.method,
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
    identityMatchMethod: identity.method,
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
