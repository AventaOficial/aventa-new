/**
 * Durable automation KPI for one Hunter/machine cycle.
 * Automation = processed without human intervention (not merely discovered).
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
  auto_processed: number;
  human_required: number;
  blocked: number;
  retryable: number;
  failed: number;
  pending_created: number;
  duplicates: number;
};

export type AutomationCycleMetrics = AutomationCycleCounts & {
  /** auto_processed / candidate_count when candidate_count > 0; else null. */
  automation_rate: number | null;
  /** pending_created / candidate_count when candidate_count > 0; else null. */
  pending_rate: number | null;
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
  };
}

/**
 * Classify a single candidate terminal outcome for automation accounting.
 * pending mint without human = auto_processed.
 * Quality/write deny that needs review = human_required only when explicitly queued for humans.
 * Gate suppress / kill-switch / auth = blocked.
 */
export function classifyAutomationOutcome(input: {
  status: string;
  skipReason?: string | null;
  pendingCreated?: boolean;
}): AutomationCycleOutcome {
  const status = (input.status || '').toLowerCase();
  const reason = (input.skipReason || '').toLowerCase();

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

export function buildAutomationCycleMetrics(
  counts: AutomationCycleCounts,
): AutomationCycleMetrics {
  const n = Math.max(0, Math.floor(counts.candidate_count));
  const auto = Math.max(0, Math.floor(counts.auto_processed));
  const pending = Math.max(0, Math.floor(counts.pending_created));
  return {
    ...counts,
    candidate_count: n,
    auto_processed: auto,
    pending_created: pending,
    automation_rate: n > 0 ? Math.round((auto / n) * 10000) / 10000 : null,
    pending_rate: n > 0 ? Math.round((pending / n) * 10000) / 10000 : null,
  };
}

export function accumulateAutomationOutcome(
  counts: AutomationCycleCounts,
  outcome: AutomationCycleOutcome,
  opts?: { pendingCreated?: boolean },
): AutomationCycleCounts {
  const next = { ...counts, candidate_count: counts.candidate_count + 1 };
  switch (outcome) {
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
): AutomationCycleMetrics {
  let counts = emptyAutomationCycleCounts();
  for (const r of results) {
    const outcome = classifyAutomationOutcome({
      status: r.status,
      skipReason: r.skipReason,
      pendingCreated: r.status === 'inserted',
    });
    counts = accumulateAutomationOutcome(counts, outcome, {
      pendingCreated: r.status === 'inserted',
    });
  }
  return buildAutomationCycleMetrics(counts);
}
