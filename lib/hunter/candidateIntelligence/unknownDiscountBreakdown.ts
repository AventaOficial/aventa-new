/**
 * UNKNOWN discount breakdown — observation only.
 * Never converts UNKNOWN into assumed discount. Never changes 25% threshold.
 */

import { auditDiscountGateReason } from './discountAudit';

export type UnknownBreakdownRow = {
  canonicalUrl?: string | null;
  source?: string | null;
  sourceDetail?: string | null;
  discountClass?: string | null;
  discountPercentage?: number | null;
  salePrice?: number | null;
  originalPrice?: number | null;
  reasonCode?: string | null;
  reasonDetail?: string | null;
  decision?: string | null;
  funnelStage?: string | null;
  priceEvidence?: Record<string, unknown> | null;
  rotQuery?: string | null;
  category?: string | null;
};

export type UnknownPath =
  | 'missing_original_price'
  | 'missing_sale_price'
  | 'both_prices_missing'
  | 'original_lte_sale'
  | 'untrusted_badge'
  | 'parser_failure'
  | 'enrichment_gap'
  | 'discount_not_computable'
  | 'other_unknown';

export type UnknownBreakdownReport = {
  total_candidates: number;
  unknown_count: number;
  unknown_rate: number | null;
  by_path: Record<UnknownPath, number>;
  by_source: Record<string, number>;
  by_query: Record<string, number>;
  by_category: Record<string, number>;
  recoverable_estimate: {
    has_both_prices: number;
    missing_original_only: number;
    no_price_evidence: number;
    theoretically_recoverable_rate: number | null;
    classification: 'FACT' | 'INFERENCE';
    note: string;
  };
};

function isUnknownRow(r: UnknownBreakdownRow): boolean {
  if (r.discountClass === 'DISCOUNT_UNKNOWN' || r.discountClass === 'DISCOUNT_MISSING_PRICE') {
    return true;
  }
  if (r.discountPercentage != null) return false;
  const reason = `${r.reasonCode ?? ''} ${r.reasonDetail ?? ''} ${r.decision ?? ''}`.toLowerCase();
  return (
    reason.includes('sin precio') ||
    reason.includes('unknown') ||
    r.decision === 'REJECTED_DISCOUNT' ||
    r.decision === 'REJECTED_PRICE'
  );
}

function classifyPath(r: UnknownBreakdownRow): UnknownPath {
  const pe = r.priceEvidence;
  const status = typeof pe?.calculationStatus === 'string' ? pe.calculationStatus : null;
  const audit = auditDiscountGateReason(r.reasonCode || r.reasonDetail);

  if (r.salePrice == null && r.originalPrice == null) return 'both_prices_missing';
  if (r.salePrice != null && r.originalPrice == null) return 'missing_original_price';
  if (r.salePrice == null && r.originalPrice != null) return 'missing_sale_price';
  if (r.salePrice != null && r.originalPrice != null && r.originalPrice <= r.salePrice) {
    return 'original_lte_sale';
  }
  if (audit.path === 'missing_original_price') return 'missing_original_price';
  if (status === 'untrusted' || (r.reasonDetail || '').toLowerCase().includes('badge')) {
    return 'untrusted_badge';
  }
  if ((r.reasonCode || '').toLowerCase().includes('parse')) return 'parser_failure';
  if ((r.reasonCode || '').toLowerCase().includes('enrich')) return 'enrichment_gap';
  if (r.salePrice != null && r.originalPrice != null) return 'discount_not_computable';
  return 'other_unknown';
}

export function buildUnknownDiscountBreakdown(
  rows: readonly UnknownBreakdownRow[],
): UnknownBreakdownReport {
  const unknownRows = rows.filter(isUnknownRow);

  const by_path: Record<UnknownPath, number> = {
    missing_original_price: 0,
    missing_sale_price: 0,
    both_prices_missing: 0,
    original_lte_sale: 0,
    untrusted_badge: 0,
    parser_failure: 0,
    enrichment_gap: 0,
    discount_not_computable: 0,
    other_unknown: 0,
  };
  const by_source: Record<string, number> = {};
  const by_query: Record<string, number> = {};
  const by_category: Record<string, number> = {};

  let has_both_prices = 0;
  let missing_original_only = 0;
  let no_price_evidence = 0;

  for (const r of unknownRows) {
    const path = classifyPath(r);
    by_path[path] += 1;
    by_source[r.source || 'UNKNOWN'] = (by_source[r.source || 'UNKNOWN'] ?? 0) + 1;
    by_query[r.rotQuery || 'UNKNOWN'] = (by_query[r.rotQuery || 'UNKNOWN'] ?? 0) + 1;
    by_category[r.category || 'UNKNOWN'] = (by_category[r.category || 'UNKNOWN'] ?? 0) + 1;

    if (r.salePrice != null && r.originalPrice != null && r.originalPrice > r.salePrice) {
      has_both_prices += 1;
    } else if (r.salePrice != null && r.originalPrice == null) {
      missing_original_only += 1;
    } else if (r.salePrice == null && r.originalPrice == null) {
      no_price_evidence += 1;
    }
  }

  const n = unknownRows.length;
  const theoretically =
    n > 0 ? Math.round(((missing_original_only + has_both_prices) / n) * 1000) / 1000 : null;

  return {
    total_candidates: rows.length,
    unknown_count: n,
    unknown_rate: rows.length > 0 ? Math.round((n / rows.length) * 1000) / 1000 : null,
    by_path,
    by_source,
    by_query,
    by_category,
    recoverable_estimate: {
      has_both_prices,
      missing_original_only,
      no_price_evidence,
      theoretically_recoverable_rate: theoretically,
      classification: 'INFERENCE',
      note:
        'Recoverable ≈ missing_original_only + has_both_prices (recompute). Does NOT invent prices. Enrichment may recover list price for missing_original_only only when source exposes it.',
    },
  };
}
