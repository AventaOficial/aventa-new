import { AUTONOMOUS_DECISION_POLICY_V1 } from './policy';
import type { ShadowReasonCode } from './reasonCodes';
import type { AutonomousSourceMetrics } from './metrics';

/** Subir cuando cambie la forma del snapshot persistido (columnas o semántica). */
export const SHADOW_CYCLE_SCHEMA_VERSION = 1;

export const SHADOW_CYCLE_TABLE = 'hunter_shadow_cycles';

export type ShadowCycleTopReason = {
  code: ShadowReasonCode | string;
  label: string;
  count: number;
};

/**
 * Snapshot de UN ciclo shadow. Todos los agregados tienen alcance de ciclo,
 * no de proceso: es lo que hace comparable un ciclo con el anterior.
 */
export type ShadowCycleReport = {
  cycleId: string;
  startedAt: string;
  finishedAt: string;
  evaluated: number;
  autoApprove: number;
  humanReview: number;
  autoReject: number;
  autoApprovePct: number;
  humanReviewPct: number;
  autoRejectPct: number;
  autonomousPct: number;
  avgConfidence: number;
  avgScore: number | null;
  duplicatePass: number;
  duplicateFail: number;
  duplicateUnknown: number;
  imageFound: number;
  imageMissing: number;
  topReasons: ShadowCycleTopReason[];
  bySource: Record<string, AutonomousSourceMetrics>;
  policyVersion: string;
  schemaVersion: number;
};

/** Fila tal cual va a Supabase. Sin URLs, sin títulos, sin datos de candidato. */
export type ShadowCycleRow = {
  cycle_id: string;
  started_at: string;
  finished_at: string;
  evaluated: number;
  auto_approve: number;
  human_review: number;
  auto_reject: number;
  auto_approve_pct: number;
  human_review_pct: number;
  auto_reject_pct: number;
  autonomous_pct: number;
  avg_confidence: number;
  avg_score: number | null;
  duplicate_pass: number;
  duplicate_fail: number;
  duplicate_unknown: number;
  image_found: number;
  image_missing: number;
  top_reasons: ShadowCycleTopReason[];
  by_source: Record<string, AutonomousSourceMetrics>;
  policy_version: string;
  schema_version: number;
};

export function buildShadowCycleRow(report: ShadowCycleReport): ShadowCycleRow {
  return {
    cycle_id: report.cycleId,
    started_at: report.startedAt,
    finished_at: report.finishedAt,
    evaluated: report.evaluated,
    auto_approve: report.autoApprove,
    human_review: report.humanReview,
    auto_reject: report.autoReject,
    auto_approve_pct: report.autoApprovePct,
    human_review_pct: report.humanReviewPct,
    auto_reject_pct: report.autoRejectPct,
    autonomous_pct: report.autonomousPct,
    avg_confidence: report.avgConfidence,
    avg_score: report.avgScore,
    duplicate_pass: report.duplicatePass,
    duplicate_fail: report.duplicateFail,
    duplicate_unknown: report.duplicateUnknown,
    image_found: report.imageFound,
    image_missing: report.imageMissing,
    top_reasons: report.topReasons,
    by_source: report.bySource,
    policy_version: report.policyVersion,
    schema_version: report.schemaVersion,
  };
}

export function shadowCycleRowToReport(row: Record<string, unknown>): ShadowCycleReport {
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
  return {
    cycleId: String(row.cycle_id ?? ''),
    startedAt: String(row.started_at ?? ''),
    finishedAt: String(row.finished_at ?? ''),
    evaluated: num(row.evaluated),
    autoApprove: num(row.auto_approve),
    humanReview: num(row.human_review),
    autoReject: num(row.auto_reject),
    autoApprovePct: num(row.auto_approve_pct),
    humanReviewPct: num(row.human_review_pct),
    autoRejectPct: num(row.auto_reject_pct),
    autonomousPct: num(row.autonomous_pct),
    avgConfidence: num(row.avg_confidence),
    avgScore: row.avg_score == null ? null : num(row.avg_score),
    duplicatePass: num(row.duplicate_pass),
    duplicateFail: num(row.duplicate_fail),
    duplicateUnknown: num(row.duplicate_unknown),
    imageFound: num(row.image_found),
    imageMissing: num(row.image_missing),
    topReasons: Array.isArray(row.top_reasons) ? (row.top_reasons as ShadowCycleTopReason[]) : [],
    bySource:
      row.by_source && typeof row.by_source === 'object'
        ? (row.by_source as Record<string, AutonomousSourceMetrics>)
        : {},
    policyVersion: String(row.policy_version ?? AUTONOMOUS_DECISION_POLICY_V1),
    schemaVersion: num(row.schema_version),
  };
}
