import {
  CALIBRATION_SAMPLE_THRESHOLDS,
  type CalibrationCounts,
  type ConfidenceBucket,
  type MetricWithSample,
  type ScoreBucket,
  type SufficiencyLevel,
} from './types';

export function emptyCalibrationCounts(): CalibrationCounts {
  return {
    shadowEvaluated: 0,
    shadowMatched: 0,
    shadowUnknown: 0,
    autoApprove: 0,
    autoApproveHumanApproved: 0,
    autoApproveHumanRejected: 0,
    autoReject: 0,
    autoRejectHumanApproved: 0,
    autoRejectHumanRejected: 0,
    humanReview: 0,
    humanReviewApproved: 0,
    humanReviewRejected: 0,
    agreement: 0,
    disagreement: 0,
  };
}

export function sufficiencyLevel(sampleSize: number): SufficiencyLevel {
  const n = Number.isFinite(sampleSize) ? Math.max(0, Math.floor(sampleSize)) : 0;
  if (n < CALIBRATION_SAMPLE_THRESHOLDS.insufficientBelow) return 'insufficient';
  if (n < CALIBRATION_SAMPLE_THRESHOLDS.earlyBelow) return 'early';
  if (n < CALIBRATION_SAMPLE_THRESHOLDS.moderateBelow) return 'moderate';
  return 'usable';
}

export function metricWithSample(numerator: number, denominator: number): MetricWithSample {
  const sampleSize = Number.isFinite(denominator) ? Math.max(0, Math.round(denominator)) : 0;
  const sufficiency = sufficiencyLevel(sampleSize);
  if (sampleSize <= 0 || !Number.isFinite(numerator)) {
    return {
      value: null,
      pct: null,
      sampleSize,
      sufficiency,
      display: `n=0 · ${sufficiency.toUpperCase()}`,
    };
  }
  const value = numerator / sampleSize;
  const pct = Math.round(value * 1000) / 10;
  return {
    value,
    pct,
    sampleSize,
    sufficiency,
    display: `${pct}% · n=${sampleSize} · ${sufficiency.toUpperCase()}`,
  };
}

/**
 * AUTO_APPROVE precision = human approved / matched AUTO_APPROVE.
 * Matched = HUMAN_APPROVED + HUMAN_REJECTED. UNKNOWN no entra.
 */
export function autoApprovePrecision(counts: Pick<
  CalibrationCounts,
  'autoApproveHumanApproved' | 'autoApproveHumanRejected'
>): MetricWithSample {
  return metricWithSample(
    counts.autoApproveHumanApproved,
    counts.autoApproveHumanApproved + counts.autoApproveHumanRejected,
  );
}

/**
 * AUTO_REJECT precision = human rejected / matched AUTO_REJECT.
 * Excluye unknown, pending, snoozed y expired (no son veredicto de calidad).
 */
export function autoRejectPrecision(counts: Pick<
  CalibrationCounts,
  'autoRejectHumanApproved' | 'autoRejectHumanRejected'
>): MetricWithSample {
  return metricWithSample(
    counts.autoRejectHumanRejected,
    counts.autoRejectHumanApproved + counts.autoRejectHumanRejected,
  );
}

/**
 * % de HUMAN_REVIEW que termina aprobado, sobre todas las filas HUMAN_REVIEW
 * (incluye unknown, como en el ejemplo 70/100).
 */
export function reviewApprovalRate(counts: Pick<
  CalibrationCounts,
  'humanReview' | 'humanReviewApproved'
>): MetricWithSample {
  return metricWithSample(counts.humanReviewApproved, counts.humanReview);
}

export function reviewRejectRate(counts: Pick<
  CalibrationCounts,
  'humanReview' | 'humanReviewRejected'
>): MetricWithSample {
  return metricWithSample(counts.humanReviewRejected, counts.humanReview);
}

export function agreementRate(counts: Pick<CalibrationCounts, 'agreement' | 'disagreement'>): MetricWithSample {
  return metricWithSample(counts.agreement, counts.agreement + counts.disagreement);
}

export function disagreementRate(counts: Pick<CalibrationCounts, 'agreement' | 'disagreement'>): MetricWithSample {
  return metricWithSample(counts.disagreement, counts.agreement + counts.disagreement);
}

/** Buckets alineados a autoApproveMinScore=78. No cambian el umbral. */
export function scoreBucket(score: number | null | undefined): ScoreBucket {
  if (score == null || !Number.isFinite(score)) return 'unknown';
  if (score < 40) return '0-39';
  if (score < 55) return '40-54';
  if (score < 70) return '55-69';
  if (score < 78) return '70-77';
  if (score < 85) return '78-84';
  return '85+';
}

/** Buckets alineados a minAutoApproveConfidence=0.7. No cambian el umbral. */
export function confidenceBucket(confidence: number | null | undefined): ConfidenceBucket {
  if (confidence == null || !Number.isFinite(confidence)) return 'unknown';
  if (confidence < 0.5) return '0-0.49';
  if (confidence < 0.7) return '0.50-0.69';
  if (confidence < 0.85) return '0.70-0.84';
  return '0.85+';
}

export const CALIBRATION_DEFINITIONS = {
  autoApprovePrecision:
    'HUMAN_APPROVED / (HUMAN_APPROVED + HUMAN_REJECTED) entre filas AUTO_APPROVE. UNKNOWN no cuenta.',
  autoRejectPrecision:
    'HUMAN_REJECTED / (HUMAN_APPROVED + HUMAN_REJECTED) entre filas AUTO_REJECT. Excluye unknown, pending, snoozed y expired.',
  reviewApprovalRate:
    'HUMAN_APPROVED / todas las filas HUMAN_REVIEW (incluye unknown/pending).',
  agreementRate:
    '(AUTO_APPROVE+HUMAN_APPROVED + AUTO_REJECT+HUMAN_REJECTED) / (agreement + disagreement). HUMAN_REVIEW no entra.',
  sufficiency: 'n<20 insufficient · 20–49 early · 50–99 moderate · 100+ usable. Operational, no científico.',
} as const;
