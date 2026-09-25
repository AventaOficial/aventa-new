/**
 * Day 4 — Durable automation KPI contract.
 *
 * Automation = candidate reached a terminal machine outcome WITHOUT human intervention
 * AND produced a real pending write (not dry-run, not duplicate, not merely discovered).
 *
 * Formulas (documented + tested):
 *   automation_rate = auto_processed / candidate_count   (null if candidate_count=0)
 *   terminal_rate   = terminals / candidate_count        (should ≈ 1)
 *   pending_rate    = pending_created / candidate_count
 *
 * Resistant to:
 *   - dry-run (never increments auto_processed / pending_created)
 *   - duplicates (counted as duplicate, not auto)
 *   - blocked sources (not counted as candidates unless they entered the pool)
 *   - retries (caller must not double-count the same candidate identity)
 */

export type AutomationCycleOutcome =
  | 'auto_processed'
  | 'human_required'
  | 'blocked'
  | 'retryable'
  | 'failed'
  | 'duplicate';

export type AutomationCycleCounts = {
  candidate_count: number;
  /** Real pending mint without human (dry-run excluded). */
  auto_processed: number;
  human_required: number;
  blocked: number;
  retryable: number;
  failed: number;
  pending_created: number;
  duplicates: number;
  /** Successfully extracted + identified + PM tip applied (or history loaded). */
  successfully_enriched: number;
  dqe_verified: number;
  s61_passed: number;
  s7_passed: number;
  written: number;
};

export type AutomationCycleMetrics = AutomationCycleCounts & {
  /** auto_processed / candidate_count when candidate_count > 0; else null. */
  automation_rate: number | null;
  /** pending_created / candidate_count when candidate_count > 0; else null. */
  pending_rate: number | null;
  /**
   * (auto + human + blocked + retryable + failed + duplicate) / candidate_count.
   * Measures accounting completeness — not success.
   */
  terminal_rate: number | null;
};

export function emptyAutomationCycleCounts(): AutomationCycleCounts {
  return {
    candidate_count: 0,
    auto_processed: 0,
    human_required: 0,
    blocked: 0,
    retryable: 0,
    failed: 0,
    pending_created: 0,
    duplicates: 0,
    successfully_enriched: 0,
    dqe_verified: 0,
    s61_passed: 0,
    s7_passed: 0,
    written: 0,
  };
}

/**
 * Classify a single candidate terminal outcome for automation accounting.
 * pending mint without human = auto_processed — ONLY when dryRun is false.
 */
export function classifyAutomationOutcome(input: {
  status: string;
  skipReason?: string | null;
  pendingCreated?: boolean;
  dryRun?: boolean;
}): AutomationCycleOutcome {
  const status = (input.status || '').toLowerCase();
  const reason = (input.skipReason || '').toLowerCase();
  const dryRun = input.dryRun === true;

  if (dryRun && (input.pendingCreated === true || status === 'inserted')) {
    // Dry-run must never count as automated write success
    return 'blocked';
  }

  if (input.pendingCreated === true || status === 'inserted') {
    return 'auto_processed';
  }
  if (status === 'duplicate' || reason.includes('duplicate')) {
    return 'duplicate';
  }
  if (
    reason.includes('retry') ||
    reason.includes('rate_limit') ||
    reason.includes('timeout') ||
    reason.includes('source_blocked')
  ) {
    return 'retryable';
  }
  if (
    status === 'error' ||
    reason.includes('fail_closed') ||
    reason.includes('invalid')
  ) {
    return 'failed';
  }
  if (
    reason.includes('writes') ||
    reason.includes('production_blocked') ||
    reason.includes('s61_') ||
    reason.includes('suppress') ||
    reason.includes('dry_run') ||
    reason.includes('budget') ||
    status === 'skipped'
  ) {
    return 'blocked';
  }
  if (status === 'pending_review' || reason.includes('human')) {
    return 'human_required';
  }
  return 'blocked';
}

function terminalSum(counts: AutomationCycleCounts): number {
  return (
    counts.auto_processed +
    counts.human_required +
    counts.blocked +
    counts.retryable +
    counts.failed +
    counts.duplicates
  );
}

export function buildAutomationCycleMetrics(
  counts: AutomationCycleCounts,
): AutomationCycleMetrics {
  const n = Math.max(0, Math.floor(counts.candidate_count));
  const auto = Math.max(0, Math.floor(counts.auto_processed));
  const pending = Math.max(0, Math.floor(counts.pending_created));
  const terminals = terminalSum(counts);
  return {
    ...counts,
    candidate_count: n,
    auto_processed: auto,
    pending_created: pending,
    automation_rate: n > 0 ? Math.round((auto / n) * 10000) / 10000 : null,
    pending_rate: n > 0 ? Math.round((pending / n) * 10000) / 10000 : null,
    terminal_rate: n > 0 ? Math.round((terminals / n) * 10000) / 10000 : null,
  };
}

export function accumulateAutomationOutcome(
  counts: AutomationCycleCounts,
  outcome: AutomationCycleOutcome,
  opts?: {
    pendingCreated?: boolean;
    dryRun?: boolean;
    enriched?: boolean;
    dqeVerified?: boolean;
    s61Passed?: boolean;
    s7Passed?: boolean;
    written?: boolean;
  },
): AutomationCycleCounts {
  const dryRun = opts?.dryRun === true;
  const next = { ...counts, candidate_count: counts.candidate_count + 1 };

  if (opts?.enriched) next.successfully_enriched += 1;
  if (opts?.dqeVerified) next.dqe_verified += 1;
  if (opts?.s61Passed) next.s61_passed += 1;
  if (opts?.s7Passed && !dryRun) next.s7_passed += 1;
  if (opts?.written && !dryRun) next.written += 1;

  // Dry-run: coerce auto_processed → blocked
  let resolved = outcome;
  if (dryRun && outcome === 'auto_processed') {
    resolved = 'blocked';
  }

  switch (resolved) {
    case 'auto_processed':
      next.auto_processed += 1;
      if (opts?.pendingCreated !== false) next.pending_created += 1;
      break;
    case 'human_required':
      next.human_required += 1;
      break;
    case 'blocked':
      next.blocked += 1;
      break;
    case 'retryable':
      next.retryable += 1;
      break;
    case 'failed':
      next.failed += 1;
      break;
    case 'duplicate':
      next.duplicates += 1;
      break;
  }
  return next;
}

export function metricsFromWorkerResults(
  results: Array<{ status: string; skipReason?: string | null }>,
  opts?: { dryRun?: boolean },
): AutomationCycleMetrics {
  let counts = emptyAutomationCycleCounts();
  for (const r of results) {
    const outcome = classifyAutomationOutcome({
      status: r.status,
      skipReason: r.skipReason,
      pendingCreated: r.status === 'inserted',
      dryRun: opts?.dryRun,
    });
    counts = accumulateAutomationOutcome(counts, outcome, {
      pendingCreated: r.status === 'inserted' && !opts?.dryRun,
      dryRun: opts?.dryRun,
      written: r.status === 'inserted' && !opts?.dryRun,
    });
  }
  return buildAutomationCycleMetrics(counts);
}

/** Formula documentation for operators / Day 4 docs. */
export const AUTOMATION_KPI_FORMULAS = {
  automation_rate:
    'auto_processed / candidate_count — real pending mint without human; dry-run and duplicates excluded from numerator',
  terminal_rate:
    '(auto_processed + human_required + blocked + retryable + failed + duplicates) / candidate_count',
  pending_rate: 'pending_created / candidate_count — real rows only',
} as const;
