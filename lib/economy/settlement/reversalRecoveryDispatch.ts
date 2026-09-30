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
import {
  buildSettlementReversalExternalRef,
  recoverSettlementReversal,
} from './reversalContract';

/** Repairs attempted per run. The fetch window is larger so completed rows do not fill the batch. */
export const SETTLEMENT_REVERSAL_RECOVERY_BATCH_LIMIT = 25;
export const SETTLEMENT_REVERSAL_RECOVERY_FETCH_CAP = 100;

const DISPATCH_ACTOR = 'settlement_reversal_recovery_dispatch';

const AUDIT_COMPLETE_EVENTS = ['settlement_reversed', 'settlement_reversal_reused'] as const;
const DO_NOT_RETRY_EVENTS = ['settlement_reversal_inconsistent'] as const;
const TERMINAL_EVENTS = [...AUDIT_COMPLETE_EVENTS, ...DO_NOT_RETRY_EVENTS];

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

type CommissionRow = {
  id: string;
  status: string;
  ledger_entry_id: string | null;
  network: string;
  updated_at: string;
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

/**
 * Scan the newest reversed commissions and finish any recovery the transition
 * did not. Safe under overlapping runs because recoverSettlementReversal is
 * idempotent on the ledger unique key.
 */
export async function dispatchSettlementReversalRecovery(
  supabase: SupabaseClient,
  options?: { limit?: number },
): Promise<SettlementReversalRecoveryDispatchResult> {
  if (isMoneyPathFrozen()) {
    return emptyResult({ blocked: true, reason: 'money_path_frozen' });
  }

  const limit = clampLimit(options?.limit);
  const fetchLimit = Math.min(limit * 4, SETTLEMENT_REVERSAL_RECOVERY_FETCH_CAP);

  const { data: commissions, error: scanError } = await supabase
    .from('affiliate_commissions')
    .select('id, status, ledger_entry_id, network, updated_at')
    .eq('status', 'reversed')
    .not('ledger_entry_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(fetchLimit);

  if (scanError) {
    return emptyResult({ ok: false, error: scanError.message });
  }

  const rows = (commissions ?? []) as CommissionRow[];
  const scanned = rows.length;
  if (scanned === 0) return emptyResult();

  const refs = rows.map((row) => buildSettlementReversalExternalRef(String(row.id)));
  const { data: reversalRows, error: ledgerError } = await supabase
    .from('affiliate_ledger_entries')
    .select('id, network, external_ref')
    .in('external_ref', refs);

  if (ledgerError) {
    return emptyResult({ ok: false, scanned, error: ledgerError.message });
  }

  const reversalKeys = new Set(
    (reversalRows ?? []).map(
      (row) =>
        `${String((row as { network?: string }).network ?? '')}|${String(
          (row as { external_ref?: string }).external_ref ?? '',
        ).trim().toLowerCase()}`,
    ),
  );

  const presentIds = rows
    .filter((row) =>
      reversalKeys.has(
        `${row.network}|${buildSettlementReversalExternalRef(String(row.id))}`,
      ),
    )
    .map((row) => String(row.id));

  const eventsByCommission = new Map<string, Set<string>>();
  if (presentIds.length > 0) {
    const { data: events, error: eventError } = await supabase
      .from('affiliate_economic_events')
      .select('entity_id, event_type')
      .eq('entity_type', 'settlement')
      .in('entity_id', presentIds)
      .in('event_type', [...TERMINAL_EVENTS]);

    if (eventError) {
      return emptyResult({ ok: false, scanned, error: eventError.message });
    }

    for (const event of events ?? []) {
      const id = String((event as { entity_id?: string }).entity_id ?? '');
      const type = String((event as { event_type?: string }).event_type ?? '');
      const set = eventsByCommission.get(id) ?? new Set<string>();
      set.add(type);
      eventsByCommission.set(id, set);
    }
  }

  const needsRecovery: string[] = [];
  let skipped = 0;
  for (const row of rows) {
    const id = String(row.id);
    const key = `${row.network}|${buildSettlementReversalExternalRef(id)}`;
    const hasRow = reversalKeys.has(key);
    const events = eventsByCommission.get(id) ?? new Set<string>();
    const auditDone = AUDIT_COMPLETE_EVENTS.some((type) => events.has(type));
    const inconsistentRecorded = DO_NOT_RETRY_EVENTS.some((type) => events.has(type));

    if (!hasRow) {
      needsRecovery.push(id);
      continue;
    }
    if (auditDone) {
      skipped += 1;
      continue;
    }
    if (inconsistentRecorded) {
      skipped += 1;
      continue;
    }
    needsRecovery.push(id);
  }

  const batch = needsRecovery.slice(0, limit);
  const deferred = needsRecovery.length - batch.length;
  const result = emptyResult({ scanned, eligible: batch.length, skipped, deferred });

  for (const commissionId of batch) {
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
