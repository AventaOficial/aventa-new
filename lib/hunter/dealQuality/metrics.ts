import type { DealQualityDecision, DealQualityDecisionKind } from './types';

export type DealQualityMetricsSnapshot = {
  evaluated: number;
  byDecision: Record<DealQualityDecisionKind, number>;
  topReasons: Array<{ reason: string; count: number }>;
  topMissingEvidence: Array<{ code: string; count: number }>;
  topNegativeSignals: Array<{ code: string; count: number }>;
  artificialListPrice: number;
  historyReady: number;
  historyMissing: number;
  firstAt: string | null;
  lastAt: string | null;
  persistence: 'process_memory';
};

const emptyByDecision = (): Record<DealQualityDecisionKind, number> => ({
  VERIFIED_DEAL: 0,
  PROMOTION: 0,
  POTENTIAL_DEAL: 0,
  NO_VERIFIED_DEAL: 0,
  DUPLICATE: 0,
  REJECT: 0,
});

type Counters = {
  evaluated: number;
  byDecision: Record<DealQualityDecisionKind, number>;
  reasons: Map<string, number>;
  missing: Map<string, number>;
  negative: Map<string, number>;
  artificialListPrice: number;
  historyReady: number;
  historyMissing: number;
  firstAt: string | null;
  lastAt: string | null;
};

let counters: Counters = {
  evaluated: 0,
  byDecision: emptyByDecision(),
  reasons: new Map(),
  missing: new Map(),
  negative: new Map(),
  artificialListPrice: 0,
  historyReady: 0,
  historyMissing: 0,
  firstAt: null,
  lastAt: null,
};

function bump(map: Map<string, number>, key: string): void {
  const k = key.trim().slice(0, 120);
  if (!k) return;
  map.set(k, (map.get(k) ?? 0) + 1);
}

function topN(map: Map<string, number>, n: number): Array<{ reason?: string; code?: string; count: number }> {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([k, count]) => ({ count, reason: k, code: k }));
}

export function resetDealQualityMetrics(): void {
  counters = {
    evaluated: 0,
    byDecision: emptyByDecision(),
    reasons: new Map(),
    missing: new Map(),
    negative: new Map(),
    artificialListPrice: 0,
    historyReady: 0,
    historyMissing: 0,
    firstAt: null,
    lastAt: null,
  };
}

export function recordDealQualityDecision(decision: DealQualityDecision): void {
  counters.evaluated += 1;
  counters.byDecision[decision.decision] += 1;
  const at = decision.generatedAt;
  if (!counters.firstAt) counters.firstAt = at;
  counters.lastAt = at;

  for (const r of decision.reasons.slice(0, 8)) bump(counters.reasons, r);
  for (const m of decision.missingEvidence.slice(0, 8)) bump(counters.missing, m);
  for (const n of decision.negativeSignals.slice(0, 8)) bump(counters.negative, n);

  if (decision.negativeSignals.includes('artificial_list_price')) {
    counters.artificialListPrice += 1;
  }
  if (decision.positiveSignals.includes('price_history_ready')) {
    counters.historyReady += 1;
  }
  if (decision.missingEvidence.includes('price_history')) {
    counters.historyMissing += 1;
  }
}

export function getDealQualityMetrics(): DealQualityMetricsSnapshot {
  return {
    evaluated: counters.evaluated,
    byDecision: { ...counters.byDecision },
    topReasons: topN(counters.reasons, 12).map((x) => ({
      reason: x.reason ?? '',
      count: x.count,
    })),
    topMissingEvidence: topN(counters.missing, 12).map((x) => ({
      code: x.code ?? '',
      count: x.count,
    })),
    topNegativeSignals: topN(counters.negative, 12).map((x) => ({
      code: x.code ?? '',
      count: x.count,
    })),
    artificialListPrice: counters.artificialListPrice,
    historyReady: counters.historyReady,
    historyMissing: counters.historyMissing,
    firstAt: counters.firstAt,
    lastAt: counters.lastAt,
    persistence: 'process_memory',
  };
}
