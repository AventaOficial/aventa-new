/**
 * Cycle funnel — durable, operator-facing explanation of one Hunter ingest cycle.
 * Separates discovery observation from real moderation inserts.
 * Does not enable writes. Does not invent candidates.
 */

import type { SupplyOpsRunSummary } from './supplyOpsRunSummary';
import { isProductionRuntime } from '@/lib/server/moneyPathFreeze';

export type CycleFunnelSummary = {
  runId: string;
  environment: string;
  bottleneck: string;
  bottleneckDetail: string;
  /** Candidates posted by worker / discovery. */
  requests_or_candidates: number;
  products_seen: number;
  products_normalized: number;
  products_rejected_identity: number;
  products_surviving_gates: number;
  products_deduped: number;
  products_budget_cut: number;
  /** Observation-only (dry-run / would_insert). Not moderation. */
  would_insert_observation: number;
  /** Real pending rows minted for moderation. */
  offers_sent_to_moderation: number;
  write_attempts: number;
  write_failed: number;
  writes_disabled: number;
  dry_run: boolean;
  machine_pending_writes_enabled: boolean;
  production_write_blocked: boolean;
  reason_codes: Record<string, number>;
  /** One-line operator verdict. */
  operator_verdict: string;
  /** Day 3 continuous discovery — optional extension fields. */
  cycle_id?: string;
  sources_requested?: number;
  sources_succeeded?: number;
  sources_blocked?: number;
  sources_failed?: number;
  candidates_discovered?: number;
  candidates_canonicalized?: number;
  dqe_verified?: number;
  dqe_potential?: number;
  s61_pass?: number;
  s61_blocked?: number;
  observations_created?: number;
  pending_created?: number;
  automation_rate?: number | null;
  /** Day 6 — per-source funnel stages. */
  by_source?: Record<string, import('./sourceFunnelMetrics').SourceFunnelStageCounts>;
};

export function buildCycleFunnelSummary(ops: SupplyOpsRunSummary): CycleFunnelSummary {
  const productionWriteBlocked = isProductionRuntime();
  const offersSent = ops.writeSuccess;
  const wouldInsert = ops.dryRunSimulated;

  const operator_verdict = explainCycleVerdict({
    bottleneck: ops.bottleneck,
    bottleneckDetail: ops.bottleneckDetail,
    discovered: ops.discovered,
    offersSent,
    wouldInsert,
    dryRun: ops.dryRun,
    productionWriteBlocked,
    writesEnabled: ops.machinePendingWritesEnabled,
  });

  return {
    runId: ops.runId,
    environment: ops.environment,
    bottleneck: ops.bottleneck,
    bottleneckDetail: ops.bottleneckDetail,
    requests_or_candidates: ops.discovered,
    products_seen: ops.discovered,
    products_normalized: ops.normalized,
    products_rejected_identity: ops.identityInvalid,
    products_surviving_gates: ops.liveEligible,
    products_deduped: ops.duplicates,
    products_budget_cut: ops.budgetRejected,
    would_insert_observation: wouldInsert,
    offers_sent_to_moderation: offersSent,
    write_attempts: ops.writeAttempts,
    write_failed: ops.writeFailed,
    writes_disabled: ops.writesDisabled,
    dry_run: ops.dryRun,
    machine_pending_writes_enabled: ops.machinePendingWritesEnabled,
    production_write_blocked: productionWriteBlocked,
    reason_codes: ops.reasonCodes,
    operator_verdict,
  };
}

export function explainCycleVerdict(input: {
  bottleneck: string;
  bottleneckDetail: string;
  discovered: number;
  offersSent: number;
  wouldInsert: number;
  dryRun: boolean;
  productionWriteBlocked: boolean;
  writesEnabled: boolean;
}): string {
  if (input.offersSent > 0) {
    return `Moderation received ${input.offersSent} pending offer(s) this cycle.`;
  }
  if (input.discovered === 0) {
    return `Offers lost at discovery: worker posted 0 candidates (${input.bottleneckDetail}).`;
  }
  if (input.dryRun) {
    return `Offers reached quality gates but stopped at dryRun/WORKER_DISCOVERY_ONLY — would_insert=${input.wouldInsert}, offers_sent_to_moderation=0.`;
  }
  if (input.productionWriteBlocked) {
    return `Offers stopped at machine write auth: PRODUCTION_BLOCKED (fail-closed). Observation may still show would_insert; moderation queue stays empty.`;
  }
  if (!input.writesEnabled) {
    return `Offers stopped at write kill-switch: BOT_INGEST_MACHINE_PENDING_WRITES off — liveEligible survived but no pending mint.`;
  }
  return `Zero moderation inserts — bottleneck=${input.bottleneck}: ${input.bottleneckDetail}`;
}

export function formatCycleFunnelLog(funnel: CycleFunnelSummary): string {
  return [
    '[hunter-cycle-funnel]',
    `runId=${funnel.runId}`,
    `bottleneck=${funnel.bottleneck}`,
    `seen=${funnel.products_seen}`,
    `normalized=${funnel.products_normalized}`,
    `gates=${funnel.products_surviving_gates}`,
    `deduped=${funnel.products_deduped}`,
    `would_insert=${funnel.would_insert_observation}`,
    `moderation=${funnel.offers_sent_to_moderation}`,
    `dryRun=${funnel.dry_run ? 1 : 0}`,
    `prodBlocked=${funnel.production_write_blocked ? 1 : 0}`,
    funnel.cycle_id ? `cycle_id=${funnel.cycle_id}` : null,
    funnel.candidates_discovered != null
      ? `discovered=${funnel.candidates_discovered}`
      : null,
    funnel.automation_rate != null ? `automation_rate=${funnel.automation_rate}` : null,
    `verdict="${funnel.operator_verdict}"`,
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Map Day 3 continuous discovery funnel onto CycleFunnelSummary (same authority).
 * Does not invent writes: dry-run keeps offers_sent_to_moderation=0.
 */
export function buildCycleFunnelSummaryFromDiscovery(input: {
  cycleId: string;
  funnel: {
    candidates_discovered: number;
    candidates_canonicalized: number;
    duplicates: number;
    unsupported: number;
    invalid: number;
    s61_pass: number;
    s61_blocked: number;
    pending_created: number;
    observations_created: number;
    sources_requested: number;
    sources_succeeded: number;
    sources_blocked: number;
    sources_failed: number;
    dqe_verified: number;
    dqe_potential: number;
    dry_run: boolean;
  };
  operator_verdict: string;
  dryRun: boolean;
  automation_rate?: number | null;
  bySource?: Record<string, import('./sourceFunnelMetrics').SourceFunnelStageCounts>;
}): CycleFunnelSummary {
  const productionWriteBlocked = isProductionRuntime();
  const f = input.funnel;
  const bottleneck =
    f.pending_created > 0
      ? 'none'
      : f.candidates_discovered === 0
        ? 'discovery'
        : f.s61_pass === 0
          ? 'quality_gate'
          : input.dryRun
            ? 'dry_run'
            : 'write_path';

  return {
    runId: input.cycleId,
    cycle_id: input.cycleId,
    environment: productionWriteBlocked ? 'production' : 'staging_or_dev',
    bottleneck,
    bottleneckDetail: input.operator_verdict,
    requests_or_candidates: f.candidates_discovered,
    products_seen: f.candidates_discovered,
    products_normalized: f.candidates_canonicalized,
    products_rejected_identity: f.unsupported + f.invalid,
    products_surviving_gates: f.s61_pass,
    products_deduped: f.duplicates,
    products_budget_cut: 0,
    would_insert_observation: input.dryRun ? f.s61_pass : 0,
    offers_sent_to_moderation: input.dryRun ? 0 : f.pending_created,
    write_attempts: input.dryRun ? 0 : f.pending_created + (f.s61_pass - f.pending_created > 0 ? f.s61_pass - f.pending_created : 0),
    write_failed: 0,
    writes_disabled: input.dryRun ? 1 : 0,
    dry_run: input.dryRun,
    machine_pending_writes_enabled: !input.dryRun,
    production_write_blocked: productionWriteBlocked,
    reason_codes: {
      dqe_verified: f.dqe_verified,
      dqe_potential: f.dqe_potential,
      s61_blocked: f.s61_blocked,
      sources_blocked: f.sources_blocked,
      sources_failed: f.sources_failed,
    },
    operator_verdict: input.operator_verdict,
    sources_requested: f.sources_requested,
    sources_succeeded: f.sources_succeeded,
    sources_blocked: f.sources_blocked,
    sources_failed: f.sources_failed,
    candidates_discovered: f.candidates_discovered,
    candidates_canonicalized: f.candidates_canonicalized,
    dqe_verified: f.dqe_verified,
    dqe_potential: f.dqe_potential,
    s61_pass: f.s61_pass,
    s61_blocked: f.s61_blocked,
    observations_created: input.dryRun ? 0 : f.observations_created,
    pending_created: input.dryRun ? 0 : f.pending_created,
    automation_rate: input.automation_rate ?? null,
    by_source: input.bySource,
  };
}
