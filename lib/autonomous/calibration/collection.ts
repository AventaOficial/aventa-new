import { isShadowReasonCode } from '../reasonCodes';
import { metricWithSample, sufficiencyLevel } from './metrics';
import type {
  CalibrationCollectionHealth,
  CalibrationCollectionStatus,
  DecisionCollectionRow,
  MetricWithSample,
  ReasonOutcomeRow,
  SourceCollectionRow,
} from './types';

export function matchRate(matched: number, eligible: number): MetricWithSample {
  return metricWithSample(matched, eligible);
}

export function collectionStatus(input: {
  readError?: boolean;
  writeFailures?: number;
  shadowSnapshots: number;
  matched: number;
}): CalibrationCollectionStatus {
  if (input.readError || (input.writeFailures ?? 0) > 0) return 'ERROR';
  if (input.shadowSnapshots <= 0) return 'NO_DATA';
  if (input.matched < 20) return 'LOW_DATA';
  return 'COLLECTING';
}

export function timeToDecisionSeconds(
  createdAt: string | null | undefined,
  humanActionAt: string | null | undefined,
): number | null {
  if (!createdAt || !humanActionAt) return null;
  const start = Date.parse(createdAt);
  const end = Date.parse(humanActionAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 1000);
}

export function emptyCollectionHealth(since: string): CalibrationCollectionHealth {
  const zero = matchRate(0, 0);
  return {
    status: 'NO_DATA',
    since,
    shadowSnapshots: 0,
    offersWithShadow: 0,
    offersWithHumanOutcome: 0,
    matched: 0,
    unmatched: 0,
    ambiguous: 0,
    unknown: 0,
    awaitingOutcomes: 0,
    approvedOutcomes: 0,
    rejectedOutcomes: 0,
    snoozedOutcomes: 0,
    expiredOutcomes: 0,
    matchRate: zero,
    lastShadowSnapshotAt: null,
    lastHumanOutcomeAt: null,
    avgTimeToDecisionSeconds: null,
    sufficiency: 'insufficient',
    byDecision: [],
    bySource: [],
    reasonOutcomes: [],
    alerts: {
      noNewShadowSnapshots: true,
      noHumanOutcomes: true,
      matchRateCollapse: false,
      dbWriteFailures: false,
    },
  };
}

export function buildCollectionHealth(input: {
  since: string;
  collection?: Record<string, unknown> | null;
  byDecision?: Record<string, unknown>[] | null;
  bySource?: Record<string, unknown>[] | null;
  reasonOutcomes?: Record<string, unknown>[] | null;
  writeFailures?: number;
  readError?: boolean;
}): CalibrationCollectionHealth {
  const row = input.collection ?? {};
  const num = (value: unknown): number => {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : 0;
  };
  const shadowSnapshots = num(row.shadow_snapshots);
  const offersWithShadow = num(row.offers_with_shadow);
  const matched = num(row.matched);
  const awaiting = num(row.pending_outcomes);
  const unknown = num(row.unknown_outcomes);
  const approved = num(row.approved_outcomes);
  const rejected = num(row.rejected_outcomes);
  const snoozed = num(row.snoozed_outcomes);
  const expired = num(row.expired_outcomes);
  const eligible = offersWithShadow;
  const rate = matchRate(matched, eligible);
  const status = collectionStatus({
    readError: input.readError,
    writeFailures: input.writeFailures,
    shadowSnapshots,
    matched,
  });
  const lastShadow = typeof row.last_shadow_at === 'string' ? row.last_shadow_at : null;
  const lastHuman = typeof row.last_human_at === 'string' ? row.last_human_at : null;
  const avg =
    row.avg_time_to_decision_seconds == null ? null : num(row.avg_time_to_decision_seconds);

  const byDecision: DecisionCollectionRow[] = (input.byDecision ?? []).map((d) => ({
    decision: String(d.shadow_decision ?? ''),
    snapshots: num(d.snapshots),
    matched: num(d.matched),
    approved: num(d.approved),
    rejected: num(d.rejected),
    pending: num(d.pending),
    unknown: num(d.unknown_outcomes),
    snoozed: num(d.snoozed),
    expired: num(d.expired),
  }));

  const bySource: SourceCollectionRow[] = (input.bySource ?? []).map((s) => {
    const snapshots = num(s.evaluated ?? s.snapshots);
    const sourceMatched = num(s.matched);
    return {
      sourceId: String(s.source_id ?? ''),
      sourceFamily: String(s.source_family ?? 'core'),
      sourceLane: String(s.source_lane ?? (s.source_family === 'community' ? 'community' : 'machine')),
      snapshots,
      matched: sourceMatched,
      approved: num(s.approved),
      rejected: num(s.rejected),
      pending: num(s.pending),
      snoozed: num(s.snoozed),
      expired: num(s.expired),
      matchRate: matchRate(sourceMatched, snapshots),
    };
  });

  const reasonOutcomes: ReasonOutcomeRow[] = (input.reasonOutcomes ?? [])
    .map((r) => ({
      reasonCode: String(r.reason_code ?? ''),
      count: num(r.count),
      approved: num(r.approved),
      rejected: num(r.rejected),
      unknown: num(r.unknown_outcomes),
    }))
    .filter((r) => r.reasonCode.length > 0 && isShadowReasonCode(r.reasonCode))
    .sort((a, b) => b.count - a.count || a.reasonCode.localeCompare(b.reasonCode));

  return {
    status,
    since: input.since,
    shadowSnapshots,
    offersWithShadow,
    offersWithHumanOutcome: num(row.offers_with_human_outcome),
    matched,
    unmatched: 0,
    ambiguous: 0,
    unknown,
    awaitingOutcomes: awaiting,
    approvedOutcomes: approved,
    rejectedOutcomes: rejected,
    snoozedOutcomes: snoozed,
    expiredOutcomes: expired,
    matchRate: rate,
    lastShadowSnapshotAt: lastShadow,
    lastHumanOutcomeAt: lastHuman,
    avgTimeToDecisionSeconds: avg,
    sufficiency: sufficiencyLevel(matched),
    byDecision,
    bySource,
    reasonOutcomes,
    alerts: {
      noNewShadowSnapshots: shadowSnapshots <= 0,
      noHumanOutcomes: approved + rejected + snoozed + expired <= 0,
      matchRateCollapse: eligible >= 20 && (rate.value ?? 0) < 0.1 && awaiting < eligible * 0.5,
      dbWriteFailures: (input.writeFailures ?? 0) > 0,
    },
  };
}
