/**
 * S7 — Supply operations run summary.
 *
 * Compact, machine-readable funnel for one ingest execution.
 * Does not invent candidates. Does not enable writes.
 * Pure: build from counters + flags already known to the cycle.
 */

export type SupplyOpsBottleneck =
  | 'none'
  | 'discovery_empty'
  | 'discovery_failed'
  | 'ingest_disabled'
  | 'ingest_paused'
  | 'missing_bot_user'
  | 'identity_invalid'
  | 'quality_suppressed'
  | 'budget_exhausted'
  | 'writes_disabled'
  | 'dry_run'
  | 'concurrent_lock'
  | 'unknown';

export type SupplyOpsRunSummary = {
  runId: string;
  startedAt: string;
  finishedAt: string;
  environment: string;
  profile: string;
  dryRun: boolean;
  machinePendingWritesEnabled: boolean;
  bottleneck: SupplyOpsBottleneck;
  bottleneckDetail: string;
  discovered: number;
  normalized: number;
  identityValid: number;
  identityInvalid: number;
  qualityVerified: number;
  suppressed: number;
  duplicates: number;
  liveEligible: number;
  budgetRejected: number;
  writeAttempts: number;
  writeSuccess: number;
  writeDuplicate: number;
  writeFailed: number;
  writesDisabled: number;
  dryRunSimulated: number;
  reasonCodes: Record<string, number>;
  durationMs: number;
};

export type BuildSupplyOpsRunSummaryInput = {
  runId: string;
  startedAt: string;
  finishedAt: string;
  profile: string;
  dryRun: boolean;
  machinePendingWritesEnabled: boolean;
  environment?: string;
  discovered: number;
  /** Candidates that survived payload→meta (identity-capable). */
  identityValid: number;
  identityInvalid: number;
  /** Passed S6.1 / live eligibility (resolved queue before budget). */
  qualityVerified: number;
  suppressed: number;
  duplicates: number;
  liveEligible: number;
  budgetRejected: number;
  writeAttempts: number;
  writeSuccess: number;
  writeDuplicate: number;
  writeFailed: number;
  writesDisabled: number;
  dryRunSimulated: number;
  reasonCodes?: Record<string, number>;
  /** Early-exit block from ingestRunGate / lock. */
  runBlock?: 'paused' | 'disabled' | 'missing_bot_user' | 'concurrent' | null;
  discoverySeedsFailed?: number;
  discoverySeedsAttempted?: number;
};

function resolveEnvironment(explicit?: string): string {
  if (explicit?.trim()) return explicit.trim();
  const v =
    process.env.VERCEL_ENV?.trim() ||
    process.env.AVENTA_DEPLOYMENT_SURFACE?.trim() ||
    process.env.NODE_ENV?.trim() ||
    'unknown';
  return v;
}

/**
 * Deterministic bottleneck: first funnel stage that explains ~zero pending writes.
 */
export function diagnoseSupplyOpsBottleneck(
  input: BuildSupplyOpsRunSummaryInput,
): { bottleneck: SupplyOpsBottleneck; detail: string } {
  if (input.runBlock === 'disabled') {
    return { bottleneck: 'ingest_disabled', detail: 'BOT_INGEST_ENABLED is off' };
  }
  if (input.runBlock === 'paused') {
    return { bottleneck: 'ingest_paused', detail: 'bot_ingest_paused in DB' };
  }
  if (input.runBlock === 'missing_bot_user') {
    return {
      bottleneck: 'missing_bot_user',
      detail: 'BOT_INGEST_USER_ID / TECH / STAPLES not configured',
    };
  }
  if (input.runBlock === 'concurrent') {
    return { bottleneck: 'concurrent_lock', detail: 'concurrent_cycle_in_progress' };
  }

  const seedsAttempted = input.discoverySeedsAttempted ?? 0;
  const seedsFailed = input.discoverySeedsFailed ?? 0;
  if (seedsAttempted > 0 && seedsFailed >= seedsAttempted && input.discovered === 0) {
    return { bottleneck: 'discovery_failed', detail: 'all discovery seeds failed' };
  }
  if (input.discovered === 0) {
    return { bottleneck: 'discovery_empty', detail: 'worker posted zero candidates' };
  }
  if (input.identityValid === 0) {
    return {
      bottleneck: 'identity_invalid',
      detail: 'no candidate survived identity/normalization',
    };
  }
  if (input.qualityVerified === 0 && input.suppressed > 0) {
    return {
      bottleneck: 'quality_suppressed',
      detail: 'S6.1 gate suppressed all evaluated candidates',
    };
  }
  if (input.liveEligible === 0 && input.identityValid > 0) {
    return {
      bottleneck: 'quality_suppressed',
      detail: 'zero live-eligible after quality/verifier filters',
    };
  }
  if (input.budgetRejected > 0 && input.writeAttempts === 0 && input.dryRunSimulated === 0) {
    return {
      bottleneck: 'budget_exhausted',
      detail: 'eligible candidates exceeded run/daily budget',
    };
  }
  if (input.dryRun) {
    return {
      bottleneck: 'dry_run',
      detail: 'WORKER_DISCOVERY_ONLY / dryRun=true — no DB offers write',
    };
  }
  if (!input.machinePendingWritesEnabled && input.liveEligible > 0) {
    return {
      bottleneck: 'writes_disabled',
      detail: 'BOT_INGEST_MACHINE_PENDING_WRITES default OFF',
    };
  }
  if (input.writeSuccess > 0) {
    return { bottleneck: 'none', detail: 'pending inserts occurred this run' };
  }
  return { bottleneck: 'unknown', detail: 'funnel completed without clear single bottleneck' };
}

export function buildSupplyOpsRunSummary(
  input: BuildSupplyOpsRunSummaryInput,
): SupplyOpsRunSummary {
  const { bottleneck, detail } = diagnoseSupplyOpsBottleneck(input);
  const started = Date.parse(input.startedAt);
  const finished = Date.parse(input.finishedAt);
  const durationMs =
    Number.isFinite(started) && Number.isFinite(finished)
      ? Math.max(0, finished - started)
      : 0;

  return {
    runId: input.runId,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    environment: resolveEnvironment(input.environment),
    profile: input.profile,
    dryRun: input.dryRun,
    machinePendingWritesEnabled: input.machinePendingWritesEnabled,
    bottleneck,
    bottleneckDetail: detail,
    discovered: input.discovered,
    normalized: input.identityValid,
    identityValid: input.identityValid,
    identityInvalid: input.identityInvalid,
    qualityVerified: input.qualityVerified,
    suppressed: input.suppressed,
    duplicates: input.duplicates,
    liveEligible: input.liveEligible,
    budgetRejected: input.budgetRejected,
    writeAttempts: input.writeAttempts,
    writeSuccess: input.writeSuccess,
    writeDuplicate: input.writeDuplicate,
    writeFailed: input.writeFailed,
    writesDisabled: input.writesDisabled,
    dryRunSimulated: input.dryRunSimulated,
    reasonCodes: { ...(input.reasonCodes ?? {}) },
    durationMs,
  };
}

/** Safe one-line log — no secrets, no raw tracking URLs. */
export function formatSupplyOpsRunSummaryLog(summary: SupplyOpsRunSummary): string {
  return [
    '[supply-ops]',
    `runId=${summary.runId}`,
    `env=${summary.environment}`,
    `bottleneck=${summary.bottleneck}`,
    `discovered=${summary.discovered}`,
    `identityValid=${summary.identityValid}`,
    `qualityVerified=${summary.qualityVerified}`,
    `liveEligible=${summary.liveEligible}`,
    `writeSuccess=${summary.writeSuccess}`,
    `writesDisabled=${summary.writesDisabled}`,
    `dryRun=${summary.dryRun ? 1 : 0}`,
    `writesFlag=${summary.machinePendingWritesEnabled ? 1 : 0}`,
  ].join(' ');
}
