/**
 * Read path. Agrega en SQL. No SELECT * de miles de filas.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { AUTONOMOUS_DECISION_POLICY_V1 } from '../policy';
import { isShadowReasonCode } from '../reasonCodes';
import {
  CALIBRATION_DEFINITIONS,
  agreementRate,
  autoApprovePrecision,
  autoRejectPrecision,
  disagreementRate,
  emptyCalibrationCounts,
  metricWithSample,
  reviewApprovalRate,
  reviewRejectRate,
} from './metrics';
import { recommendedCalibrationAction } from './recommend';
import { buildCollectionHealth, emptyCollectionHealth } from './collection';
import { getCalibrationWriteMetrics } from './persistMetrics';
import {
  DISAGREEMENT_PAIRS,
  SHADOW_CALIBRATION_SCHEMA_VERSION,
  type BucketCalibrationRow,
  type CalibrationCollectionHealth,
  type CalibrationCounts,
  type CalibrationSnapshot,
  type CreatorCalibrationRow,
  type DisagreementPair,
  type ReasonCalibrationRow,
  type SourceCalibrationRow,
} from './types';

function num(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function mapCounts(row: Record<string, unknown> | null | undefined): CalibrationCounts {
  if (!row) return emptyCalibrationCounts();
  return {
    shadowEvaluated: num(row.shadow_evaluated),
    shadowMatched: num(row.shadow_matched),
    shadowUnknown: num(row.shadow_unknown),
    autoApprove: num(row.auto_approve),
    autoApproveHumanApproved: num(row.auto_approve_human_approved),
    autoApproveHumanRejected: num(row.auto_approve_human_rejected),
    autoReject: num(row.auto_reject),
    autoRejectHumanApproved: num(row.auto_reject_human_approved),
    autoRejectHumanRejected: num(row.auto_reject_human_rejected),
    humanReview: num(row.human_review),
    humanReviewApproved: num(row.human_review_approved),
    humanReviewRejected: num(row.human_review_rejected),
    agreement: num(row.agreement),
    disagreement: num(row.disagreement),
  };
}

function mapSource(row: Record<string, unknown>): SourceCalibrationRow {
  const counts: CalibrationCounts = {
    shadowEvaluated: num(row.evaluated),
    shadowMatched: num(row.matched),
    shadowUnknown: 0,
    autoApprove: num(row.auto_approve),
    autoApproveHumanApproved: num(row.auto_approve_human_approved),
    autoApproveHumanRejected: num(row.auto_approve_human_rejected),
    autoReject: num(row.auto_reject),
    autoRejectHumanApproved: num(row.auto_reject_human_approved),
    autoRejectHumanRejected: num(row.auto_reject_human_rejected),
    humanReview: num(row.human_review),
    humanReviewApproved: num(row.human_review_approved),
    humanReviewRejected: num(row.human_review_rejected),
    agreement: num(row.agreement),
    disagreement: num(row.disagreement),
  };
  return {
    ...counts,
    sourceId: String(row.source_id ?? ''),
    sourceFamily: String(row.source_family ?? 'core'),
    autoApprovePrecision: autoApprovePrecision(counts),
    autoRejectPrecision: autoRejectPrecision(counts),
    reviewApprovalRate: reviewApprovalRate(counts),
    agreementRate: agreementRate(counts),
  };
}

function mapCreator(row: Record<string, unknown>): CreatorCalibrationRow {
  const agreement = num(row.agreement);
  const matched = num(row.matched);
  return {
    creatorId: String(row.creator_id ?? ''),
    submissions: num(row.submissions),
    matched,
    agreement,
    autoApprove: num(row.auto_approve),
    humanReview: num(row.human_review),
    autoReject: num(row.auto_reject),
    humanApproved: num(row.human_approved),
    humanRejected: num(row.human_rejected),
    agreementRate: metricWithSample(agreement, matched),
  };
}

function mapReason(row: Record<string, unknown>): ReasonCalibrationRow | null {
  const pair = String(row.pair ?? '');
  if (!DISAGREEMENT_PAIRS.includes(pair as DisagreementPair)) return null;
  const reasonCode = String(row.reason_code ?? '');
  if (!reasonCode || !isShadowReasonCode(reasonCode)) return null;
  return {
    pair: pair as DisagreementPair,
    reasonCode,
    count: num(row.count),
  };
}

function mapBucket(row: Record<string, unknown>): BucketCalibrationRow {
  const agreement = num(row.agreement);
  const disagreement = num(row.disagreement);
  return {
    bucket: String(row.bucket ?? 'unknown'),
    evaluated: num(row.evaluated),
    matched: num(row.matched),
    agreement,
    disagreement,
    agreementRate: agreementRate({ agreement, disagreement }),
  };
}

function emptySnapshot(since: string): CalibrationSnapshot {
  const counts = emptyCalibrationCounts();
  const base: CalibrationSnapshot = {
    persistence: 'supabase_hunter_shadow_outcomes',
    schemaVersion: SHADOW_CALIBRATION_SCHEMA_VERSION,
    policyVersion: AUTONOMOUS_DECISION_POLICY_V1,
    since,
    recommendedAction: '',
    counts,
    agreementRate: agreementRate(counts),
    disagreementRate: disagreementRate(counts),
    autoApprovePrecision: autoApprovePrecision(counts),
    autoRejectPrecision: autoRejectPrecision(counts),
    reviewApprovalRate: reviewApprovalRate(counts),
    reviewRejectRate: reviewRejectRate(counts),
    bySource: [],
    byCreator: [],
    disagreementReasons: [],
    scoreBuckets: [],
    confidenceBuckets: [],
    collection: emptyCollectionHealth(since),
    definitions: { ...CALIBRATION_DEFINITIONS },
  };
  return {
    ...base,
    recommendedAction: recommendedCalibrationAction(base),
  };
}

export function buildCalibrationSnapshot(input: {
  since: string;
  collectionSince?: string;
  summary?: Record<string, unknown> | null;
  bySource?: Record<string, unknown>[] | null;
  byCreator?: Record<string, unknown>[] | null;
  reasons?: Record<string, unknown>[] | null;
  scoreBuckets?: Record<string, unknown>[] | null;
  confidenceBuckets?: Record<string, unknown>[] | null;
  collection?: Record<string, unknown> | null;
  byDecision?: Record<string, unknown>[] | null;
  reasonOutcomes?: Record<string, unknown>[] | null;
  writeFailures?: number;
  readError?: boolean;
}): CalibrationSnapshot {
  const counts = mapCounts(input.summary);
  const collection: CalibrationCollectionHealth = buildCollectionHealth({
    since: input.collectionSince ?? input.since,
    collection: input.collection,
    byDecision: input.byDecision,
    bySource: input.bySource,
    reasonOutcomes: input.reasonOutcomes,
    writeFailures: input.writeFailures,
    readError: input.readError,
  });
  const snapshot: CalibrationSnapshot = {
    persistence: 'supabase_hunter_shadow_outcomes',
    schemaVersion: SHADOW_CALIBRATION_SCHEMA_VERSION,
    policyVersion: AUTONOMOUS_DECISION_POLICY_V1,
    since: input.since,
    recommendedAction: '',
    counts,
    agreementRate: agreementRate(counts),
    disagreementRate: disagreementRate(counts),
    autoApprovePrecision: autoApprovePrecision(counts),
    autoRejectPrecision: autoRejectPrecision(counts),
    reviewApprovalRate: reviewApprovalRate(counts),
    reviewRejectRate: reviewRejectRate(counts),
    bySource: (input.bySource ?? []).map(mapSource).sort((a, b) => b.shadowEvaluated - a.shadowEvaluated),
    byCreator: (input.byCreator ?? [])
      .map(mapCreator)
      .sort((a, b) => b.submissions - a.submissions)
      .slice(0, 20),
    disagreementReasons: (input.reasons ?? [])
      .map(mapReason)
      .filter((row): row is ReasonCalibrationRow => row != null)
      .sort((a, b) => b.count - a.count || a.reasonCode.localeCompare(b.reasonCode)),
    scoreBuckets: (input.scoreBuckets ?? []).map(mapBucket),
    confidenceBuckets: (input.confidenceBuckets ?? []).map(mapBucket),
    collection,
    definitions: { ...CALIBRATION_DEFINITIONS },
  };
  snapshot.recommendedAction = recommendedCalibrationAction(snapshot);
  return snapshot;
}

export async function getShadowCalibration(
  supabase: SupabaseClient | null,
  opts?: { since?: Date | string; now?: Date },
): Promise<CalibrationSnapshot> {
  const now = opts?.now ?? new Date();
  const sinceDate =
    opts?.since instanceof Date
      ? opts.since
      : typeof opts?.since === 'string'
        ? new Date(opts.since)
        : new Date(now.getTime() - 30 * 24 * 3600_000);
  const since = Number.isFinite(sinceDate.getTime())
    ? sinceDate.toISOString()
    : new Date(now.getTime() - 30 * 24 * 3600_000).toISOString();

  if (!supabase) {
    const writes = getCalibrationWriteMetrics();
    return {
      ...emptySnapshot(since),
      collection: buildCollectionHealth({
        since,
        readError: true,
        writeFailures: writes.shadowFailures + writes.humanFailures,
      }),
    };
  }

  const collectionSince = '2020-01-01T00:00:00.000Z';
  const writes = getCalibrationWriteMetrics();
  const writeFailures = writes.shadowFailures + writes.humanFailures;

  try {
    const [summary, bySource, byCreator, reasons, scoreBuckets, confidenceBuckets, collection, byDecision, reasonOutcomes] =
      await Promise.all([
        supabase.rpc('hunter_shadow_calibration_summary', { p_since: since }),
        supabase.rpc('hunter_shadow_calibration_by_source', { p_since: collectionSince }),
        supabase.rpc('hunter_shadow_calibration_by_creator', { p_since: since }),
        supabase.rpc('hunter_shadow_calibration_reasons', { p_since: since }),
        supabase.rpc('hunter_shadow_calibration_score_buckets', { p_since: since }),
        supabase.rpc('hunter_shadow_calibration_confidence_buckets', { p_since: since }),
        supabase.rpc('hunter_shadow_calibration_collection', { p_since: collectionSince }),
        supabase.rpc('hunter_shadow_calibration_by_decision', { p_since: collectionSince }),
        supabase.rpc('hunter_shadow_calibration_reason_outcomes', { p_since: collectionSince }),
      ]);

    const summaryRow = Array.isArray(summary.data) ? (summary.data[0] as Record<string, unknown>) : null;
    const collectionRow = Array.isArray(collection.data)
      ? (collection.data[0] as Record<string, unknown>)
      : null;
    const readError = Boolean(summary.error && collection.error);
    return buildCalibrationSnapshot({
      since,
      collectionSince,
      summary: summary.error ? null : summaryRow,
      bySource: bySource.error || !Array.isArray(bySource.data) ? [] : (bySource.data as Record<string, unknown>[]),
      byCreator: byCreator.error || !Array.isArray(byCreator.data) ? [] : (byCreator.data as Record<string, unknown>[]),
      reasons: reasons.error || !Array.isArray(reasons.data) ? [] : (reasons.data as Record<string, unknown>[]),
      scoreBuckets:
        scoreBuckets.error || !Array.isArray(scoreBuckets.data)
          ? []
          : (scoreBuckets.data as Record<string, unknown>[]),
      confidenceBuckets:
        confidenceBuckets.error || !Array.isArray(confidenceBuckets.data)
          ? []
          : (confidenceBuckets.data as Record<string, unknown>[]),
      collection: collection.error ? null : collectionRow,
      byDecision:
        byDecision.error || !Array.isArray(byDecision.data)
          ? []
          : (byDecision.data as Record<string, unknown>[]),
      reasonOutcomes:
        reasonOutcomes.error || !Array.isArray(reasonOutcomes.data)
          ? []
          : (reasonOutcomes.data as Record<string, unknown>[]),
      writeFailures,
      readError,
    });
  } catch {
    return {
      ...emptySnapshot(since),
      collection: buildCollectionHealth({
        since: collectionSince,
        readError: true,
        writeFailures,
      }),
    };
  }
}
