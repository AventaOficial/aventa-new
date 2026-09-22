/**
 * Opportunity metrics for Discovery Experiment v2 (observation only).
 * Never labels UNKNOWN as a good deal.
 */

import type { DiscountClass } from './discountClass';
import type { HypotheticalDecision } from './discountAudit';

export type OpportunityCounts = {
  totalDiscovered: number;
  realGood: number;
  realLow: number;
  unknown: number;
  invalid: number;
  missingPrice: number;
  wouldInsertCurrent: number;
  /** Candidates where discount gate was killer AND class is UNKNOWN and would continue. */
  wouldInsertIfUnknownPreserved: number;
  /** By class: would continue if that class weren't auto-rejected as discount. */
  wouldContinueByClass: {
    REAL_LOW: number;
    UNKNOWN: number;
    INVALID: number;
    MISSING_PRICE: number;
  };
  stillRejectedByClass: {
    REAL_LOW: number;
    UNKNOWN: number;
    INVALID: number;
    MISSING_PRICE: number;
  };
  funnelCuts: {
    discovery: number;
    discountClassification: number;
    score: number;
    topK: number;
    diversity: number;
    wouldInsert: number;
  };
};

export type OpportunityRow = {
  discountClass: DiscountClass;
  currentDecision: string;
  hypotheticalDecision: HypotheticalDecision;
  discountGateWasKiller: boolean;
  classBucket: 'REAL_LOW' | 'UNKNOWN' | 'INVALID' | 'MISSING_PRICE' | 'REAL_GOOD' | 'OTHER';
  funnelStage?: string;
};

export function emptyOpportunityCounts(): OpportunityCounts {
  return {
    totalDiscovered: 0,
    realGood: 0,
    realLow: 0,
    unknown: 0,
    invalid: 0,
    missingPrice: 0,
    wouldInsertCurrent: 0,
    wouldInsertIfUnknownPreserved: 0,
    wouldContinueByClass: {
      REAL_LOW: 0,
      UNKNOWN: 0,
      INVALID: 0,
      MISSING_PRICE: 0,
    },
    stillRejectedByClass: {
      REAL_LOW: 0,
      UNKNOWN: 0,
      INVALID: 0,
      MISSING_PRICE: 0,
    },
    funnelCuts: {
      discovery: 0,
      discountClassification: 0,
      score: 0,
      topK: 0,
      diversity: 0,
      wouldInsert: 0,
    },
  };
}

export function accumulateOpportunity(counts: OpportunityCounts, row: OpportunityRow): void {
  counts.totalDiscovered += 1;
  switch (row.discountClass) {
    case 'DISCOUNT_REAL_GOOD':
      counts.realGood += 1;
      break;
    case 'DISCOUNT_REAL_LOW':
      counts.realLow += 1;
      break;
    case 'DISCOUNT_UNKNOWN':
      counts.unknown += 1;
      break;
    case 'DISCOUNT_INVALID':
      counts.invalid += 1;
      break;
    case 'DISCOUNT_MISSING_PRICE':
      counts.missingPrice += 1;
      break;
  }

  if (row.currentDecision === 'WOULD_INSERT' || row.currentDecision === 'INSERTED_PENDING') {
    counts.wouldInsertCurrent += 1;
  }

  const bucket = row.classBucket;
  if (
    bucket === 'REAL_LOW' ||
    bucket === 'UNKNOWN' ||
    bucket === 'INVALID' ||
    bucket === 'MISSING_PRICE'
  ) {
    if (row.hypotheticalDecision === 'WOULD_CONTINUE' || row.hypotheticalDecision === 'WOULD_INSERT') {
      counts.wouldContinueByClass[bucket] += 1;
    } else if (row.hypotheticalDecision === 'STILL_REJECTED') {
      counts.stillRejectedByClass[bucket] += 1;
    }
  }

  // ONLY count UNKNOWN preserved as the "if unknown weren't auto-reject" metric
  if (
    bucket === 'UNKNOWN' &&
    row.discountGateWasKiller &&
    (row.hypotheticalDecision === 'WOULD_CONTINUE' || row.hypotheticalDecision === 'WOULD_INSERT')
  ) {
    counts.wouldInsertIfUnknownPreserved += 1;
  }

  switch (row.funnelStage) {
    case 'DISCOVERY':
      counts.funnelCuts.discovery += 1;
      break;
    case 'DISCOUNT_CLASSIFICATION':
      counts.funnelCuts.discountClassification += 1;
      break;
    case 'SCORE':
      counts.funnelCuts.score += 1;
      break;
    case 'TOP_K':
      counts.funnelCuts.topK += 1;
      break;
    case 'DIVERSITY':
      counts.funnelCuts.diversity += 1;
      break;
    case 'WOULD_INSERT':
      counts.funnelCuts.wouldInsert += 1;
      break;
  }
}

export function summarizeOpportunities(rows: OpportunityRow[]): OpportunityCounts {
  const counts = emptyOpportunityCounts();
  for (const row of rows) accumulateOpportunity(counts, row);
  return counts;
}
