import { AUTONOMOUS_DECISION_POLICY_V1, AUTONOMOUS_POLICY_V1 } from './policy';
import { classifyShadowReasons, SHADOW_REASON_LABELS, type ShadowReasonCode } from './reasonCodes';
import { SHADOW_CYCLE_SCHEMA_VERSION, type ShadowCycleReport } from './shadowCycle';
import type { AutonomousDecision, AutonomousDecisionResult } from './types';
import type { DealCheckStatus, DealVerifierDecision } from '@/lib/verifier/types';

export type AutonomousSourceMetrics = {
  evaluated: number;
  autoApprove: number;
  humanReview: number;
  autoReject: number;
};

export type AutonomousVerifierCounts = {
  autoApprove: number;
  review: number;
  reject: number;
};

export type AutonomousCycleSnapshot = {
  evaluated: number;
  autoApprove: number;
  humanReview: number;
  autoReject: number;
  autonomousPct: number;
  autoApprovePct: number;
  humanReviewPct: number;
  autoRejectPct: number;
  avgConfidence: number;
  imageFound: number;
  imageMissing: number;
  startedAt: string | null;
  endedAt: string | null;
};

export type AutonomousDecisionMetricsSnapshot = {
  evaluated: number;
  autoApprove: number;
  humanReview: number;
  autoReject: number;
  autonomousPct: number;
  autoApprovePct: number;
  humanReviewPct: number;
  autoRejectPct: number;
  avgConfidence: number;
  duplicatePass: number;
  duplicateFail: number;
  duplicateUnknown: number;
  imageFound: number;
  imageMissing: number;
  verifier: AutonomousVerifierCounts;
  topReasons: Array<{ reason: string; code: ShadowReasonCode; label: string; count: number }>;
  recent: ShadowObservationSample[];
  avgScore: number | null;
  bySource: Record<string, AutonomousSourceMetrics>;
  firstAt: string | null;
  lastAt: string | null;
  currentCycle: AutonomousCycleSnapshot;
  lastCycle: AutonomousCycleSnapshot;
  persistence: 'process_memory';
};

export type ShadowObservationSample = {
  source: string;
  decision: AutonomousDecision;
  confidence: number;
  score: number | null;
  reasons: ShadowReasonCode[];
  at: string;
};

const MAX_RECENT = 24;
const recent: ShadowObservationSample[] = [];
let scoreSum = 0;
let scoreCount = 0;

const MAX_REASON_KEYS = 40;

type Counters = AutonomousSourceMetrics & {
  duplicatePass: number;
  duplicateFail: number;
  duplicateUnknown: number;
  imageFound: number;
  imageMissing: number;
  confidenceSum: number;
  verifierAutoApprove: number;
  verifierReview: number;
  verifierReject: number;
};

function emptyCounters(): Counters {
  return {
    evaluated: 0,
    autoApprove: 0,
    humanReview: 0,
    autoReject: 0,
    duplicatePass: 0,
    duplicateFail: 0,
    duplicateUnknown: 0,
    imageFound: 0,
    imageMissing: 0,
    confidenceSum: 0,
    verifierAutoApprove: 0,
    verifierReview: 0,
    verifierReject: 0,
  };
}

const counters = emptyCounters();
const reasonCounts = new Map<string, number>();
const bySource = new Map<string, AutonomousSourceMetrics>();

let firstAt: string | null = null;
let lastAt: string | null = null;

let currentCycle = emptyCounters();
let currentCycleStartedAt: string | null = null;
let lastCycle: AutonomousCycleSnapshot = emptyCycleSnapshot();

/**
 * Agregados con alcance de ciclo (no de proceso). Necesarios para persistir un
 * snapshot honesto: `topReasons`/`bySource` de proceso mezclarían ciclos previos.
 */
type CycleScoped = {
  id: string;
  reasons: Map<string, number>;
  bySource: Map<string, AutonomousSourceMetrics>;
  scoreSum: number;
  scoreCount: number;
};

function emptyCycleScoped(): CycleScoped {
  return { id: newCycleId(), reasons: new Map(), bySource: new Map(), scoreSum: 0, scoreCount: 0 };
}

/** uuid v4: la columna cycle_id es uuid, el fallback también debe serlo. */
function newCycleId(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
      const r = (Math.random() * 16) | 0;
      return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
}

let cycleScoped = emptyCycleScoped();

function emptyCycleSnapshot(): AutonomousCycleSnapshot {
  return {
    evaluated: 0,
    autoApprove: 0,
    humanReview: 0,
    autoReject: 0,
    autonomousPct: 0,
    autoApprovePct: 0,
    humanReviewPct: 0,
    autoRejectPct: 0,
    avgConfidence: 0,
    imageFound: 0,
    imageMissing: 0,
    startedAt: null,
    endedAt: null,
  };
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function avgConfidence(sum: number, n: number): number {
  if (n <= 0) return 0;
  return Math.round((sum / n) * 1000) / 1000;
}

function cycleFrom(c: Counters, startedAt: string | null, endedAt: string | null): AutonomousCycleSnapshot {
  return {
    evaluated: c.evaluated,
    autoApprove: c.autoApprove,
    humanReview: c.humanReview,
    autoReject: c.autoReject,
    autonomousPct: pct(c.autoApprove + c.autoReject, c.evaluated),
    autoApprovePct: pct(c.autoApprove, c.evaluated),
    humanReviewPct: pct(c.humanReview, c.evaluated),
    autoRejectPct: pct(c.autoReject, c.evaluated),
    avgConfidence: avgConfidence(c.confidenceSum, c.evaluated),
    imageFound: c.imageFound,
    imageMissing: c.imageMissing,
    startedAt,
    endedAt,
  };
}

/**
 * Ingest source → hunter source existente. No inventa IDs.
 */
export function canonicalShadowSource(source: string, sourceDetail?: string | null): string {
  const s = source.trim() || 'unknown';
  if (s === 'ml_api') return 'ml_api_legacy';
  if (s === 'amazon_paapi' || /paapi/i.test(sourceDetail ?? '')) return 'amazon_paapi';
  if (s === 'rss') return 'rss';
  return s;
}

function bumpReason(target: Map<string, number>, code: ShadowReasonCode) {
  target.set(code, (target.get(code) ?? 0) + 1);
  if (target.size > MAX_REASON_KEYS) {
    const sorted = [...target.entries()].sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < Math.min(5, sorted.length); i++) {
      target.delete(sorted[i]![0]);
    }
  }
}

function sourceBucket(target: Map<string, AutonomousSourceMetrics>, source: string, sourceDetail?: string | null) {
  const key = canonicalShadowSource(source, sourceDetail);
  let row = target.get(key);
  if (!row) {
    row = { evaluated: 0, autoApprove: 0, humanReview: 0, autoReject: 0 };
    target.set(key, row);
  }
  return row;
}

function bumpDecision(row: Pick<AutonomousSourceMetrics, 'autoApprove' | 'humanReview' | 'autoReject'>, decision: AutonomousDecision) {
  if (decision === 'AUTO_APPROVE') row.autoApprove += 1;
  else if (decision === 'HUMAN_REVIEW') row.humanReview += 1;
  else row.autoReject += 1;
}

function bumpDuplicate(target: Counters, status: DealCheckStatus | undefined) {
  if (status === 'pass') target.duplicatePass += 1;
  else if (status === 'fail') target.duplicateFail += 1;
  else target.duplicateUnknown += 1;
}

function bumpVerifier(target: Counters, decision: DealVerifierDecision | undefined) {
  if (decision === 'auto_approve') target.verifierAutoApprove += 1;
  else if (decision === 'reject') target.verifierReject += 1;
  else target.verifierReview += 1;
}

function imagePresent(imageUrl: string | null | undefined): boolean {
  const url = (imageUrl ?? '').trim();
  return Boolean(url) && url !== AUTONOMOUS_POLICY_V1.placeholderImage;
}

export type RecordAutonomousMeta = {
  sourceDetail?: string | null;
  imageUrl?: string | null;
  verifierDecision?: DealVerifierDecision | null;
};

/**
 * Marca el inicio de un ciclo real de ingest/worker.
 * El ciclo anterior queda en lastCycle. Totales de proceso se conservan.
 */
export function beginAutonomousShadowCycle(now: Date = new Date()) {
  if (currentCycle.evaluated > 0) {
    lastCycle = cycleFrom(currentCycle, currentCycleStartedAt, lastAt);
  }
  currentCycle = emptyCounters();
  currentCycleStartedAt = now.toISOString();
  cycleScoped = emptyCycleScoped();
}

export function recordAutonomousDecision(
  result: AutonomousDecisionResult,
  source: string,
  meta: RecordAutonomousMeta = {},
  now: Date = new Date()
) {
  const iso = now.toISOString();
  if (!firstAt) firstAt = iso;
  lastAt = iso;

  const apply = (target: Counters) => {
    target.evaluated += 1;
    bumpDecision(target, result.decision);
    bumpDuplicate(target, result.checks.duplicate.status);
    bumpVerifier(target, meta.verifierDecision ?? undefined);
    target.confidenceSum += Number.isFinite(result.confidence) ? result.confidence : 0;
    if (imagePresent(meta.imageUrl)) target.imageFound += 1;
    else target.imageMissing += 1;
  };

  apply(counters);
  apply(currentCycle);

  if (Number.isFinite(result.score)) {
    scoreSum += result.score as number;
    scoreCount += 1;
    cycleScoped.scoreSum += result.score as number;
    cycleScoped.scoreCount += 1;
  }

  for (const bucket of [bySource, cycleScoped.bySource]) {
    const row = sourceBucket(bucket, source, meta.sourceDetail);
    bumpDecision(row, result.decision);
    row.evaluated += 1;
  }

  const codes = classifyShadowReasons(result);
  if (result.decision === 'HUMAN_REVIEW') {
    for (const code of codes) {
      bumpReason(reasonCounts, code);
      bumpReason(cycleScoped.reasons, code);
    }
  }

  recent.push({
    source: canonicalShadowSource(source, meta.sourceDetail),
    decision: result.decision,
    confidence: Number.isFinite(result.confidence) ? result.confidence : 0,
    score: Number.isFinite(result.score) ? result.score : null,
    reasons: codes,
    at: iso,
  });
  if (recent.length > MAX_RECENT) recent.splice(0, recent.length - MAX_RECENT);
}

function topReasonsFrom(source: Map<string, number>) {
  return [...source.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([code, count]) => ({
      reason: code,
      code: code as ShadowReasonCode,
      label: SHADOW_REASON_LABELS[code as ShadowReasonCode],
      count,
    }));
}

/**
 * Snapshot persistible del ciclo en curso. Llamar al cerrar el ciclo de ingest.
 * Lectura pura: no muta contadores ni cierra el ciclo.
 */
export function getShadowCycleReport(now: Date = new Date()): ShadowCycleReport {
  const c = currentCycle;
  return {
    cycleId: cycleScoped.id,
    startedAt: currentCycleStartedAt ?? now.toISOString(),
    finishedAt: now.toISOString(),
    evaluated: c.evaluated,
    autoApprove: c.autoApprove,
    humanReview: c.humanReview,
    autoReject: c.autoReject,
    autoApprovePct: pct(c.autoApprove, c.evaluated),
    humanReviewPct: pct(c.humanReview, c.evaluated),
    autoRejectPct: pct(c.autoReject, c.evaluated),
    autonomousPct: pct(c.autoApprove + c.autoReject, c.evaluated),
    avgConfidence: avgConfidence(c.confidenceSum, c.evaluated),
    avgScore:
      cycleScoped.scoreCount > 0
        ? Math.round((cycleScoped.scoreSum / cycleScoped.scoreCount) * 10) / 10
        : null,
    duplicatePass: c.duplicatePass,
    duplicateFail: c.duplicateFail,
    duplicateUnknown: c.duplicateUnknown,
    imageFound: c.imageFound,
    imageMissing: c.imageMissing,
    topReasons: topReasonsFrom(cycleScoped.reasons).map(({ code, label, count }) => ({
      code,
      label,
      count,
    })),
    bySource: Object.fromEntries(cycleScoped.bySource.entries()),
    policyVersion: AUTONOMOUS_DECISION_POLICY_V1,
    schemaVersion: SHADOW_CYCLE_SCHEMA_VERSION,
  };
}

export function getAutonomousDecisionMetrics(): AutonomousDecisionMetricsSnapshot {
  const topReasons = topReasonsFrom(reasonCounts);

  return {
    evaluated: counters.evaluated,
    autoApprove: counters.autoApprove,
    humanReview: counters.humanReview,
    autoReject: counters.autoReject,
    autonomousPct: pct(counters.autoApprove + counters.autoReject, counters.evaluated),
    autoApprovePct: pct(counters.autoApprove, counters.evaluated),
    humanReviewPct: pct(counters.humanReview, counters.evaluated),
    autoRejectPct: pct(counters.autoReject, counters.evaluated),
    avgConfidence: avgConfidence(counters.confidenceSum, counters.evaluated),
    avgScore: scoreCount > 0 ? Math.round((scoreSum / scoreCount) * 10) / 10 : null,
    recent: recent.slice(-MAX_RECENT),
    duplicatePass: counters.duplicatePass,
    duplicateFail: counters.duplicateFail,
    duplicateUnknown: counters.duplicateUnknown,
    imageFound: counters.imageFound,
    imageMissing: counters.imageMissing,
    verifier: {
      autoApprove: counters.verifierAutoApprove,
      review: counters.verifierReview,
      reject: counters.verifierReject,
    },
    topReasons,
    bySource: Object.fromEntries(bySource.entries()),
    firstAt,
    lastAt,
    currentCycle: cycleFrom(currentCycle, currentCycleStartedAt, currentCycle.evaluated > 0 ? lastAt : currentCycleStartedAt),
    lastCycle,
    persistence: 'process_memory',
  };
}

/** Solo tests. */
export function resetAutonomousDecisionMetrics() {
  Object.assign(counters, emptyCounters());
  reasonCounts.clear();
  bySource.clear();
  firstAt = null;
  lastAt = null;
  currentCycle = emptyCounters();
  currentCycleStartedAt = null;
  lastCycle = emptyCycleSnapshot();
  cycleScoped = emptyCycleScoped();
  recent.length = 0;
  scoreSum = 0;
  scoreCount = 0;
}
