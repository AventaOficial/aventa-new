import type { DealVerifierDecision, DealVerifierResult } from './types';

export type DealVerifierMetricsSnapshot = {
  evaluated: number;
  autoApproved: number;
  review: number;
  rejected: number;
  errors: number;
  /** Top reasons (fail/warn/error), capped. */
  topReasons: Array<{ reason: string; count: number }>;
};

const MAX_REASON_KEYS = 40;

const counters = {
  evaluated: 0,
  autoApproved: 0,
  review: 0,
  rejected: 0,
  errors: 0,
};

const reasonCounts = new Map<string, number>();

function bumpReason(reason: string) {
  const key = reason.slice(0, 160);
  const next = (reasonCounts.get(key) ?? 0) + 1;
  reasonCounts.set(key, next);
  if (reasonCounts.size > MAX_REASON_KEYS) {
    // Drop lowest counts when overflowing
    const sorted = [...reasonCounts.entries()].sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < Math.min(5, sorted.length); i++) {
      reasonCounts.delete(sorted[i]![0]);
    }
  }
}

export function recordDealVerifierResult(result: DealVerifierResult) {
  counters.evaluated += 1;
  if (result.decision === 'auto_approve') counters.autoApproved += 1;
  else if (result.decision === 'review') counters.review += 1;
  else counters.rejected += 1;

  if (result.reasons.some((r) => r.startsWith('Error interno del verifier'))) {
    counters.errors += 1;
  }

  for (const r of result.reasons.slice(0, 3)) {
    bumpReason(r);
  }
}

export function getDealVerifierMetrics(): DealVerifierMetricsSnapshot {
  const topReasons = [...reasonCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([reason, count]) => ({ reason, count }));

  return {
    evaluated: counters.evaluated,
    autoApproved: counters.autoApproved,
    review: counters.review,
    rejected: counters.rejected,
    errors: counters.errors,
    topReasons,
  };
}

/** Solo tests. */
export function resetDealVerifierMetrics() {
  counters.evaluated = 0;
  counters.autoApproved = 0;
  counters.review = 0;
  counters.rejected = 0;
  counters.errors = 0;
  reasonCounts.clear();
}

export function decisionBucket(d: DealVerifierDecision): keyof typeof counters {
  if (d === 'auto_approve') return 'autoApproved';
  if (d === 'review') return 'review';
  return 'rejected';
}
