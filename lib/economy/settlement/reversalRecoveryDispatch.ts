/**
 * Durable delivery for settlement reversal recovery.
 *
 * Finds commissions that are already reversed and still need the compensating
 * ledger row (or a finished audit of that row). The only economic call is
 * recoverSettlementReversal. This module does not price, insert, or update
 * ledger, commissions, rewards, or payouts.
 *
 * Idempotency of the money row stays on UNIQUE(network, external_ref).
 * A second cron run is the retry. No job table.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isMoneyPathFrozen } from '@/lib/server/moneyPathFreeze';
import { recoverSettlementReversal } from './reversalContract';

/** Repairs attempted per run. The read itself returns only pending rows, oldest first. */
export const SETTLEMENT_REVERSAL_RECOVERY_BATCH_LIMIT = 25;
export const SETTLEMENT_REVERSAL_RECOVERY_RPC = 'list_pending_settlement_reversal_commissions';

const DISPATCH_ACTOR = 'settlement_reversal_recovery_dispatch';

export type SettlementReversalRecoveryFailure = {
  commissionId: string;
  reason: string;
};

export type SettlementReversalRecoveryDispatchResult = {
  ok: boolean;
  blocked: boolean;
  reason: 'money_path_frozen' | null;
  scanned: number;
  eligible: number;
  recovered: number;
  reused: number;
  skipped: number;
  failed: number;
  /** Needs recovery but sits past this run's batch limit. */
  deferred: number;
  failures: SettlementReversalRecoveryFailure[];
  error?: string;
};

function emptyResult(
  patch: Partial<SettlementReversalRecoveryDispatchResult> = {},
): SettlementReversalRecoveryDispatchResult {
  return {
    ok: true,
    blocked: false,
    reason: null,
    scanned: 0,
    eligible: 0,
    recovered: 0,
    reused: 0,
    skipped: 0,
    failed: 0,
    deferred: 0,
    failures: [],
    ...patch,
  };
}

function clampLimit(raw: number | undefined): number {
  const requested = raw ?? SETTLEMENT_REVERSAL_RECOVERY_BATCH_LIMIT;
  if (!Number.isFinite(requested)) return SETTLEMENT_REVERSAL_RECOVERY_BATCH_LIMIT;
  return Math.max(1, Math.min(Math.floor(requested), SETTLEMENT_REVERSAL_RECOVERY_BATCH_LIMIT));
}

type PendingRecoveryRow = {
  id: string;
  pending_count?: number | string;
};

/**
 * Deliver recoverSettlementReversal for commissions the database already
 * classified as pending. Completed reversals are not in this read, so a
 * long completed history cannot hide an older gap. Overlapping runs stay
 * idempotent on UNIQUE(network, external_ref).
 */
export async function dispatchSettlementReversalRecovery(
  supabase: SupabaseClient,
  options?: { limit?: number },
): Promise<SettlementReversalRecoveryDispatchResult> {
  if (isMoneyPathFrozen()) {
    return emptyResult({ blocked: true, reason: 'money_path_frozen' });
  }

  const limit = clampLimit(options?.limit);
  const { data, error: scanError } = await supabase.rpc(SETTLEMENT_REVERSAL_RECOVERY_RPC, {
    p_limit: limit,
  });

  if (scanError) {
    return emptyResult({ ok: false, error: scanError.message });
  }

  const rows = (data ?? []) as PendingRecoveryRow[];
  if (rows.length === 0) return emptyResult();

  const pendingCount = Number(rows[0]?.pending_count ?? rows.length);
  const deferred = Number.isFinite(pendingCount) ? Math.max(0, pendingCount - rows.length) : 0;
  const result = emptyResult({
    scanned: rows.length,
    eligible: rows.length,
    deferred,
  });

  for (const row of rows) {
    const commissionId = String(row.id);
    try {
      const recovery = await recoverSettlementReversal(supabase, {
        commissionId,
        actor: DISPATCH_ACTOR,
      });
      if (recovery.ok && recovery.reused) {
        result.reused += 1;
        continue;
      }
      if (recovery.ok) {
        result.recovered += 1;
        continue;
      }
      const reason = recovery.reason ?? 'ledger_write_failed';
      result.failed += 1;
      result.failures.push({ commissionId, reason });
      console.error('[settlement-reversal-recovery]', commissionId, reason);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'dispatch_exception';
      result.failed += 1;
      result.failures.push({ commissionId, reason });
      console.error('[settlement-reversal-recovery]', commissionId, reason);
    }
  }

  return result;
}
