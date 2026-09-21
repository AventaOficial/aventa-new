/**
 * Observation-only audit of productive discount rejection paths + what-if.
 * Does NOT change gates.
 */

import type { DiscountClass } from './discountClass';
import { classifyDiscountEvidence, type DiscountClassification } from './discountClass';

/** Productive skip / reject reason → audit path (maps how REJECTED_* is born). */
export const REJECTED_DISCOUNT_PATHS = [
  'missing_original_price',
  'original_lte_sale',
  'discount_below_min',
  'discount_above_max',
  'discount_zero',
  'discount_non_numeric',
  'verifier_discount_fail',
  'unknown_discount_reason',
] as const;

export type RejectedDiscountPath = (typeof REJECTED_DISCOUNT_PATHS)[number];

export type DiscountGateAudit = {
  path: RejectedDiscountPath | 'not_discount_gate';
  productiveDecisionHint: 'REJECTED_DISCOUNT' | 'REJECTED_PRICE' | 'OTHER' | 'PASS';
  reason: string | null;
};

/**
 * Classify a productive skip/reject reason into a discount-gate audit path.
 * Mirrors externalWorker / runIngestCycle / checkDiscount wording.
 */
export function auditDiscountGateReason(reason: string | null | undefined): DiscountGateAudit {
  const r = (reason ?? '').trim();
  const lower = r.toLowerCase();

  if (!r) {
    return { path: 'not_discount_gate', productiveDecisionHint: 'OTHER', reason: null };
  }

  if (lower.includes('sin precio original') || lower.includes('missing_original')) {
    return {
      path: 'missing_original_price',
      // taxonomy maps "precio"/"original" → REJECTED_PRICE (not REJECTED_DISCOUNT)
      productiveDecisionHint: 'REJECTED_PRICE',
      reason: r,
    };
  }

  if (
    lower.includes('original') &&
    (lower.includes('<=') || lower.includes('no verificable') || lower.includes('lte'))
  ) {
    return {
      path: 'original_lte_sale',
      productiveDecisionHint: 'REJECTED_PRICE',
      reason: r,
    };
  }

  if (lower.includes('descuento 0') || lower.includes('discount 0') || lower.includes('no es oferta')) {
    return {
      path: 'discount_zero',
      productiveDecisionHint: 'REJECTED_DISCOUNT',
      reason: r,
    };
  }

  if (lower.includes('no numérico') || lower.includes('no numerico') || lower.includes('non.numeric')) {
    return {
      path: 'discount_non_numeric',
      productiveDecisionHint: 'REJECTED_DISCOUNT',
      reason: r,
    };
  }

  if (
    lower.includes('fuera de rango') ||
    lower.includes('por encima del tope') ||
    lower.includes('absurd')
  ) {
    // Could be below min OR above max — parse
    const m = lower.match(/descuento\s+(\d+(?:\.\d+)?)\s*%/);
    const pct = m ? Number(m[1]) : null;
    if (pct != null && pct > 80) {
      return {
        path: 'discount_above_max',
        productiveDecisionHint: 'REJECTED_DISCOUNT',
        reason: r,
      };
    }
    return {
      path: 'discount_below_min',
      productiveDecisionHint: 'REJECTED_DISCOUNT',
      reason: r,
    };
  }

  if (lower.includes('< mínimo') || lower.includes('< minimo') || lower.includes('below min')) {
    return {
      path: 'discount_below_min',
      productiveDecisionHint: 'REJECTED_DISCOUNT',
      reason: r,
    };
  }

  if (lower.includes('descuento') || lower.includes('discount')) {
    return {
      path: 'verifier_discount_fail',
      productiveDecisionHint: 'REJECTED_DISCOUNT',
      reason: r,
    };
  }

  return { path: 'not_discount_gate', productiveDecisionHint: 'OTHER', reason: r };
}

export type FunnelStageName =
  | 'DISCOVERY'
  | 'DISCOUNT_CLASSIFICATION'
  | 'SCORE'
  | 'TOP_K'
  | 'DIVERSITY'
  | 'WOULD_INSERT';

export type FunnelDecision = {
  stage: FunnelStageName;
  reason: string;
  terminal: boolean;
};

/**
 * Derive funnel terminal stage from candidate disposition + cut flags.
 * Zero silent drops: every candidate gets an explicit stage+reason.
 */
export function deriveFunnelDecision(input: {
  decision: string;
  reasonCode?: string | null;
  reasonDetail?: string | null;
  wouldTopkCut?: boolean;
  wouldDiversityCut?: boolean;
  discountClass?: DiscountClass | null;
}): FunnelDecision {
  const d = input.decision;
  const reason = input.reasonCode || input.reasonDetail || d;

  if (d === 'WOULD_INSERT' || d === 'INSERTED_PENDING' || d === 'PUBLISHED') {
    return { stage: 'WOULD_INSERT', reason: String(reason), terminal: true };
  }
  if (d === 'DISCOVERED' || input.reasonCode === 'experiment_early_persist') {
    return {
      stage: 'DISCOVERY',
      reason: String(reason),
      terminal: false,
    };
  }
  if (input.wouldDiversityCut || d === 'REJECTED_DIVERSITY') {
    return { stage: 'DIVERSITY', reason: String(reason), terminal: true };
  }
  if (
    input.wouldTopkCut ||
    (typeof reason === 'string' &&
      (reason.includes('topk') || reason.includes('top_k') || reason.includes('score_shortlist')))
  ) {
    return { stage: 'TOP_K', reason: String(reason), terminal: true };
  }
  if (
    d === 'REJECTED_DISCOUNT' ||
    d === 'REJECTED_PRICE' ||
    (typeof input.reasonDetail === 'string' &&
      /descuento|discount|precio original/i.test(input.reasonDetail))
  ) {
    return {
      stage: 'DISCOUNT_CLASSIFICATION',
      reason: String(reason),
      terminal: true,
    };
  }
  if (
    d === 'REJECTED_SCORE' ||
    d === 'REJECTED_DQE' ||
    d === 'REJECTED_LOW_VALUE' ||
    d === 'NEEDS_REVIEW' ||
    d === 'WATCHLIST'
  ) {
    return { stage: 'SCORE', reason: String(reason), terminal: true };
  }
  if (d.startsWith('REJECTED_') || d === 'DUPLICATE' || d === 'FAILED') {
    return { stage: 'SCORE', reason: String(reason), terminal: true };
  }
  return { stage: 'DISCOVERY', reason: String(reason), terminal: true };
}

export type HypotheticalDecision =
  | 'WOULD_INSERT'
  | 'WOULD_CONTINUE'
  | 'STILL_REJECTED'
  | 'SAME_AS_CURRENT';

/**
 * What-if: if the discount gate had not auto-rejected this candidate,
 * would it continue? Separated by shadow class — never calls UNKNOWN a good deal.
 */
export function simulateWithoutDiscountGate(input: {
  discountClass: DiscountClass;
  currentDecision: string;
  reason?: string | null;
  wouldTopkCut?: boolean;
  wouldDiversityCut?: boolean;
  hasTitle?: boolean;
  hasUrl?: boolean;
}): {
  currentDecision: string;
  hypotheticalDecision: HypotheticalDecision;
  /** Only meaningful when current was a discount-related reject. */
  discountGateWasKiller: boolean;
  classBucket: 'REAL_LOW' | 'UNKNOWN' | 'INVALID' | 'MISSING_PRICE' | 'REAL_GOOD' | 'OTHER';
} {
  const audit = auditDiscountGateReason(input.reason);
  const isDiscountKill =
    audit.productiveDecisionHint === 'REJECTED_DISCOUNT' ||
    audit.productiveDecisionHint === 'REJECTED_PRICE' ||
    input.currentDecision === 'REJECTED_DISCOUNT' ||
    input.currentDecision === 'REJECTED_PRICE';

  const bucket =
    input.discountClass === 'DISCOUNT_REAL_LOW'
      ? 'REAL_LOW'
      : input.discountClass === 'DISCOUNT_UNKNOWN'
        ? 'UNKNOWN'
        : input.discountClass === 'DISCOUNT_INVALID'
          ? 'INVALID'
          : input.discountClass === 'DISCOUNT_MISSING_PRICE'
            ? 'MISSING_PRICE'
            : input.discountClass === 'DISCOUNT_REAL_GOOD'
              ? 'REAL_GOOD'
              : 'OTHER';

  if (!isDiscountKill) {
    return {
      currentDecision: input.currentDecision,
      hypotheticalDecision: 'SAME_AS_CURRENT',
      discountGateWasKiller: false,
      classBucket: bucket,
    };
  }

  // MISSING_PRICE / INVALID still cannot become inserts even without "discount %" gate
  if (bucket === 'MISSING_PRICE' || bucket === 'INVALID') {
    return {
      currentDecision: input.currentDecision,
      hypotheticalDecision: 'STILL_REJECTED',
      discountGateWasKiller: true,
      classBucket: bucket,
    };
  }

  if (input.hasUrl === false || input.hasTitle === false) {
    return {
      currentDecision: input.currentDecision,
      hypotheticalDecision: 'STILL_REJECTED',
      discountGateWasKiller: true,
      classBucket: bucket,
    };
  }

  if (input.wouldDiversityCut || input.wouldTopkCut) {
    return {
      currentDecision: input.currentDecision,
      hypotheticalDecision: 'WOULD_CONTINUE',
      discountGateWasKiller: true,
      classBucket: bucket,
    };
  }

  // Survived discount gate hypothetically → would continue into score/topK
  // REAL_LOW / UNKNOWN / REAL_GOOD: NOT labeled as good deal — only "would continue"
  return {
    currentDecision: input.currentDecision,
    hypotheticalDecision: 'WOULD_CONTINUE',
    discountGateWasKiller: true,
    classBucket: bucket,
  };
}

export type DiscountPathStatsRow = {
  reasonPath: string;
  count: number;
  percentage: number;
  currentPriceAvailable: boolean | null;
  originalPriceAvailable: boolean | null;
  historicalPriceAvailable: boolean | null;
  discountEvidence: string | null;
  source: string | null;
  confidence: string | null;
};

/**
 * Aggregate audit rows for Phase 1 table.
 */
export function aggregateDiscountPathStats(
  rows: Array<{
    reason?: string | null;
    classification: DiscountClassification;
  }>,
): DiscountPathStatsRow[] {
  const total = rows.length || 1;
  const map = new Map<
    string,
    {
      count: number;
      current: boolean;
      original: boolean;
      historical: boolean;
      evidence: string;
      source: string;
      confidence: string;
    }
  >();

  for (const row of rows) {
    const audit = auditDiscountGateReason(row.reason);
    const path =
      audit.path !== 'not_discount_gate'
        ? audit.path
        : row.classification.priceEvidence.path;
    const prev = map.get(path);
    const pe = row.classification.priceEvidence;
    if (!prev) {
      map.set(path, {
        count: 1,
        current: pe.currentPriceAvailable,
        original: pe.originalPriceAvailable,
        historical: pe.historicalPriceAvailable,
        evidence: pe.discountEvidence,
        source: row.classification.discountSource,
        confidence: row.classification.discountConfidence,
      });
    } else {
      prev.count += 1;
    }
  }

  return [...map.entries()]
    .map(([reasonPath, v]) => ({
      reasonPath,
      count: v.count,
      percentage: Math.round((v.count / total) * 1000) / 10,
      currentPriceAvailable: v.current,
      originalPriceAvailable: v.original,
      historicalPriceAvailable: v.historical,
      discountEvidence: v.evidence,
      source: v.source,
      confidence: v.confidence,
    }))
    .sort((a, b) => b.count - a.count);
}

export function classifyDiscountEvidenceForAudit(
  input: Parameters<typeof classifyDiscountEvidence>[0],
): DiscountClassification {
  return classifyDiscountEvidence(input);
}
