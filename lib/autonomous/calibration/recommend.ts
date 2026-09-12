import { SHADOW_REASON_LABELS, isShadowReasonCode, type ShadowReasonCode } from '../reasonCodes';
import type { CalibrationSnapshot, ReasonCalibrationRow, SourceCalibrationRow } from './types';

function labelReason(code: string): string {
  return isShadowReasonCode(code) ? SHADOW_REASON_LABELS[code as ShadowReasonCode] : code;
}

/**
 * Recomendación descriptiva. No ejecuta acciones ni cambia policy.
 */
export function recommendedCalibrationAction(
  snapshot: Pick<
    CalibrationSnapshot,
    | 'counts'
    | 'autoApprovePrecision'
    | 'autoRejectPrecision'
    | 'reviewApprovalRate'
    | 'disagreementReasons'
    | 'bySource'
  >,
): string {
  const { counts } = snapshot;
  if (counts.shadowEvaluated <= 0) {
    return 'Not enough matched outcomes. Shadow outcomes start after FASE 11 inserts; historical cycles cannot be correlated safely.';
  }
  if (counts.shadowMatched <= 0) {
    return 'Not enough matched outcomes. Shadow rows exist but humans have not moderated them yet.';
  }
  if (
    snapshot.autoApprovePrecision.sufficiency === 'insufficient' &&
    snapshot.autoApprovePrecision.value != null &&
    snapshot.autoApprovePrecision.value >= 0.8
  ) {
    return 'Shadow AUTO_APPROVE agreement is high but sample is insufficient.';
  }
  if (snapshot.autoApprovePrecision.sufficiency === 'insufficient' && counts.shadowMatched < 20) {
    return 'Not enough matched outcomes.';
  }

  const reviewReasons = snapshot.disagreementReasons
    .filter((r) => r.pair === 'HUMAN_REVIEW+HUMAN_APPROVE' || r.pair === 'HUMAN_REVIEW+HUMAN_REJECT')
    .sort((a, b) => b.count - a.count);
  const topReview = reviewReasons[0];
  if (topReview && counts.humanReview >= 5) {
    return `${labelReason(topReview.reasonCode)} (${topReview.reasonCode}) causes most HUMAN_REVIEW decisions.`;
  }

  const community = snapshot.bySource.find((s) => s.sourceId === 'community' || s.sourceFamily === 'community');
  const ml = snapshot.bySource.find((s) => s.sourceId === 'ml_worker');
  if (comparableSources(community, ml)) {
    const c = community!.agreementRate.value ?? 0;
    const m = ml!.agreementRate.value ?? 0;
    if (c > m) return 'Community has higher approval agreement than ML Worker.';
    if (m > c) return 'ML Worker has higher approval agreement than Community.';
  }

  if (
    snapshot.autoApprovePrecision.sufficiency !== 'insufficient' &&
    (snapshot.autoApprovePrecision.value ?? 0) >= 0.9
  ) {
    return 'AUTO_APPROVE precision is high on the current sample. Do not enable autonomy yet; keep measuring.';
  }

  return 'Keep measuring. Do not change Autonomous policy, thresholds, or publish gates.';
}

function comparableSources(
  a: SourceCalibrationRow | undefined,
  b: SourceCalibrationRow | undefined,
): boolean {
  if (!a || !b) return false;
  return a.agreementRate.sampleSize >= 5 && b.agreementRate.sampleSize >= 5;
}

export function topDisagreementReason(rows: ReasonCalibrationRow[]): ReasonCalibrationRow | null {
  const disagreements = rows.filter(
    (r) => r.pair === 'AUTO_APPROVE+HUMAN_REJECT' || r.pair === 'AUTO_REJECT+HUMAN_APPROVE',
  );
  return disagreements.sort((a, b) => b.count - a.count || a.reasonCode.localeCompare(b.reasonCode))[0] ?? null;
}
