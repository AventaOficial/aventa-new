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
    `verdict="${funnel.operator_verdict}"`,
  ].join(' ');
}
