import type { DealQualification, DealQualificationReasonCode } from './types';
import type { DealQualificationResult } from './types';

export type DealQualificationSourceId = 'chedraui_mx' | 'bodega_aurrera_mx' | 'walmart_mx' | 'other';

export type DealQualificationMetricsSnapshot = {
  candidatesEvaluated: number;
  verifiedDeals: number;
  promotions: number;
  potentialDeals: number;
  noVerifiedDeals: number;
  qualificationPct: number;
  verifiedDealPct: number;
  promotionPct: number;
  potentialDealPct: number;
  catalogOnlyPct: number;
  topRejectionReasons: Array<{ reason: DealQualificationReasonCode; count: number }>;
  bySource: Record<
    DealQualificationSourceId,
    {
      evaluated: number;
      verifiedDeals: number;
      promotions: number;
      potentialDeals: number;
      noVerifiedDeals: number;
    }
  >;
};

const emptySource = () => ({
  evaluated: 0,
  verifiedDeals: 0,
  promotions: 0,
  potentialDeals: 0,
  noVerifiedDeals: 0,
});

const counters = {
  evaluated: 0,
  verifiedDeals: 0,
  promotions: 0,
  potentialDeals: 0,
  noVerifiedDeals: 0,
  bySource: {
    chedraui_mx: emptySource(),
    bodega_aurrera_mx: emptySource(),
    walmart_mx: emptySource(),
    other: emptySource(),
  } as DealQualificationMetricsSnapshot['bySource'],
};

const reasonCounts = new Map<DealQualificationReasonCode, number>();

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function bucketFor(
  q: DealQualification,
): 'verifiedDeals' | 'promotions' | 'potentialDeals' | 'noVerifiedDeals' {
  if (q === 'VERIFIED_DEAL') return 'verifiedDeals';
  if (q === 'PROMOTION') return 'promotions';
  if (q === 'POTENTIAL_DEAL') return 'potentialDeals';
  return 'noVerifiedDeals';
}

export function qualificationSourceId(source: string | null | undefined): DealQualificationSourceId {
  if (source === 'chedraui_mx' || source === 'bodega_aurrera_mx' || source === 'walmart_mx') {
    return source;
  }
  return 'other';
}

/**
 * Universo de supply qualification. No mezclar con autonomousPct.
 */
export function recordDealQualification(
  source: string | null | undefined,
  result: DealQualificationResult,
) {
  counters.evaluated += 1;
  const key = bucketFor(result.qualification);
  counters[key] += 1;
  const src = qualificationSourceId(source);
  counters.bySource[src].evaluated += 1;
  if (result.qualification === 'VERIFIED_DEAL') counters.bySource[src].verifiedDeals += 1;
  else if (result.qualification === 'PROMOTION') counters.bySource[src].promotions += 1;
  else if (result.qualification === 'POTENTIAL_DEAL') counters.bySource[src].potentialDeals += 1;
  else counters.bySource[src].noVerifiedDeals += 1;

  if (!result.continueToPipeline) {
    for (const reason of result.reasons.slice(0, 3)) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
  }
}

export function getDealQualificationMetrics(): DealQualificationMetricsSnapshot {
  const n = counters.evaluated;
  const topRejectionReasons = [...reasonCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([reason, count]) => ({ reason, count }));

  const dealLike = counters.verifiedDeals + counters.promotions + counters.potentialDeals;

  return {
    candidatesEvaluated: n,
    verifiedDeals: counters.verifiedDeals,
    promotions: counters.promotions,
    potentialDeals: counters.potentialDeals,
    noVerifiedDeals: counters.noVerifiedDeals,
    qualificationPct: pct(dealLike, n),
    verifiedDealPct: pct(counters.verifiedDeals, n),
    promotionPct: pct(counters.promotions, n),
    potentialDealPct: pct(counters.potentialDeals, n),
    catalogOnlyPct: pct(counters.noVerifiedDeals, n),
    topRejectionReasons,
    bySource: {
      chedraui_mx: { ...counters.bySource.chedraui_mx },
      bodega_aurrera_mx: { ...counters.bySource.bodega_aurrera_mx },
      walmart_mx: { ...counters.bySource.walmart_mx },
      other: { ...counters.bySource.other },
    },
  };
}

/** Solo tests. */
export function resetDealQualificationMetrics() {
  counters.evaluated = 0;
  counters.verifiedDeals = 0;
  counters.promotions = 0;
  counters.potentialDeals = 0;
  counters.noVerifiedDeals = 0;
  counters.bySource.chedraui_mx = emptySource();
  counters.bySource.bodega_aurrera_mx = emptySource();
  counters.bySource.walmart_mx = emptySource();
  counters.bySource.other = emptySource();
  reasonCounts.clear();
}
