/**
 * Day 13.2 — hunter_collect per-source progress (OBSERVABILITY ONLY).
 *
 * The caller owns a mutable progress object and passes it to `runHunterCollect`.
 * The engine updates it while sources run, so the caller can still read partial
 * progress when the outer budget race fires and the engine result is discarded.
 * Never changes deadlines, scheduling, source order, acceptance or dedupe.
 */

import {
  emptyRequestProgressCounters,
  type RequestProgressCounters,
} from '@/lib/server/requestProgressCounters';

export const HUNTER_SOURCE_PROGRESS_VERSION = 1 as const;

export type HunterSourceProgressStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'threw'
  | 'skipped_disabled'
  | 'skipped_external'
  | 'skipped_breaker'
  | 'skipped_deadline'
  /** Planned source the engine never reached (only in snapshots). */
  | 'not_started';

export type HunterSourceDeadlineStatus =
  | 'none'
  /** Engine budget expired before this source started (engine-level soft_deadline). */
  | 'skipped_before_start'
  /** Outer hunter budget fired while this source was still running. */
  | 'in_flight_at_deadline'
  /** Source finished, but the outer budget discarded the whole engine result. */
  | 'finished_result_discarded'
  /** Outer hunter budget fired before the engine reached this source. */
  | 'not_reached_at_deadline';

export type HunterSourceProgressEntry = {
  source: string;
  started_at: string | null;
  finished_at: string | null;
  elapsed_ms: number | null;
  requests: RequestProgressCounters;
  /** Items returned by the source collect (null when it never returned). */
  candidates_received: number | null;
  /** Items kept after the engine cross-source dedupe (null when not reached). */
  candidates_accepted: number | null;
  /** `collectedCount - itemsFound` as reported by the source (null when not reported). */
  candidates_discarded: number | null;
  /** `candidates_received - candidates_accepted` (null when dedupe not reached). */
  duplicates: number | null;
  errors: number;
  error_code: string | null;
  status: HunterSourceProgressStatus;
  deadline_status: HunterSourceDeadlineStatus;
  partial_result_lost: boolean;
};

export type HunterCollectProgress = {
  started_at_ms: number;
  entries: HunterSourceProgressEntry[];
  engine_returned: boolean;
};

export type HunterCollectProgressSnapshot = {
  hunter_source_progress_version: typeof HUNTER_SOURCE_PROGRESS_VERSION;
  started_at: string;
  snapshot_at: string;
  engine_returned: boolean;
  outer_deadline_fired: boolean;
  entries: HunterSourceProgressEntry[];
};

export function createHunterCollectProgress(nowMs: number = Date.now()): HunterCollectProgress {
  return { started_at_ms: nowMs, entries: [], engine_returned: false };
}

export function beginSourceProgress(
  progress: HunterCollectProgress | null | undefined,
  source: string,
  nowMs: number = Date.now(),
): HunterSourceProgressEntry | null {
  if (!progress) return null;
  const entry: HunterSourceProgressEntry = {
    source,
    started_at: new Date(nowMs).toISOString(),
    finished_at: null,
    elapsed_ms: null,
    requests: emptyRequestProgressCounters(),
    candidates_received: null,
    candidates_accepted: null,
    candidates_discarded: null,
    duplicates: null,
    errors: 0,
    error_code: null,
    status: 'running',
    deadline_status: 'none',
    partial_result_lost: false,
  };
  progress.entries.push(entry);
  return entry;
}

/** Records a source that never ran (disabled / external / breaker / budget). */
export function recordSkippedSourceProgress(
  progress: HunterCollectProgress | null | undefined,
  source: string,
  status: Extract<
    HunterSourceProgressStatus,
    'skipped_disabled' | 'skipped_external' | 'skipped_breaker' | 'skipped_deadline'
  >,
  errorCode: string | null = null,
): void {
  if (!progress) return;
  progress.entries.push({
    source,
    started_at: null,
    finished_at: null,
    elapsed_ms: null,
    requests: emptyRequestProgressCounters(),
    candidates_received: null,
    candidates_accepted: null,
    candidates_discarded: null,
    duplicates: null,
    errors: 0,
    error_code: errorCode,
    status,
    deadline_status: status === 'skipped_deadline' ? 'skipped_before_start' : 'none',
    partial_result_lost: false,
  });
}

export function finishSourceProgress(
  entry: HunterSourceProgressEntry | null,
  input: {
    status: Extract<HunterSourceProgressStatus, 'completed' | 'failed' | 'threw'>;
    nowMs?: number;
    received?: number | null;
    collectedCount?: number | null;
    errors?: number;
    errorCode?: string | null;
  },
): void {
  if (!entry) return;
  const nowMs = input.nowMs ?? Date.now();
  entry.status = input.status;
  entry.finished_at = new Date(nowMs).toISOString();
  entry.elapsed_ms = entry.started_at ? Math.max(0, nowMs - Date.parse(entry.started_at)) : null;
  entry.candidates_received = input.received ?? null;
  entry.candidates_discarded =
    typeof input.collectedCount === 'number' && typeof input.received === 'number'
      ? Math.max(0, input.collectedCount - input.received)
      : null;
  entry.errors = input.errors ?? 0;
  entry.error_code = input.errorCode ?? null;
}

/** Called by the engine after cross-source dedupe (engine returned normally). */
export function recordAcceptedAfterDedupe(
  progress: HunterCollectProgress | null | undefined,
  acceptedBySource: Record<string, number>,
): void {
  if (!progress) return;
  progress.engine_returned = true;
  for (const e of progress.entries) {
    if (e.status !== 'completed' || e.candidates_received == null) continue;
    const accepted = acceptedBySource[e.source] ?? 0;
    e.candidates_accepted = accepted;
    e.duplicates = Math.max(0, e.candidates_received - accepted);
  }
}

/**
 * Immutable snapshot for persistence. When the engine has not returned, running
 * entries become `in_flight_at_deadline` and finished entries with candidates are
 * marked as discarded — the outer race drops the whole engine result.
 */
export function snapshotHunterCollectProgress(
  progress: HunterCollectProgress,
  input?: { nowMs?: number; outerDeadlineFired?: boolean; plannedSources?: readonly string[] },
): HunterCollectProgressSnapshot {
  const nowMs = input?.nowMs ?? Date.now();
  const outer = input?.outerDeadlineFired === true && !progress.engine_returned;
  const entries = progress.entries.map((e) => {
    const copy: HunterSourceProgressEntry = { ...e, requests: { ...e.requests } };
    if (!outer) return copy;
    if (copy.status === 'running') {
      copy.deadline_status = 'in_flight_at_deadline';
      copy.elapsed_ms = copy.started_at ? Math.max(0, nowMs - Date.parse(copy.started_at)) : null;
      copy.partial_result_lost = true;
    } else if (
      (copy.status === 'completed' || copy.status === 'failed' || copy.status === 'threw') &&
      copy.deadline_status === 'none'
    ) {
      copy.deadline_status = 'finished_result_discarded';
      copy.partial_result_lost = (copy.candidates_received ?? 0) > 0;
    }
    return copy;
  });
  const seen = new Set(entries.map((e) => e.source));
  for (const source of input?.plannedSources ?? []) {
    if (seen.has(source)) continue;
    seen.add(source);
    entries.push({
      source,
      started_at: null,
      finished_at: null,
      elapsed_ms: null,
      requests: emptyRequestProgressCounters(),
      candidates_received: null,
      candidates_accepted: null,
      candidates_discarded: null,
      duplicates: null,
      errors: 0,
      error_code: null,
      status: 'not_started',
      deadline_status: outer ? 'not_reached_at_deadline' : 'none',
      partial_result_lost: false,
    });
  }
  return {
    hunter_source_progress_version: HUNTER_SOURCE_PROGRESS_VERSION,
    started_at: new Date(progress.started_at_ms).toISOString(),
    snapshot_at: new Date(nowMs).toISOString(),
    engine_returned: progress.engine_returned,
    outer_deadline_fired: outer,
    entries,
  };
}
