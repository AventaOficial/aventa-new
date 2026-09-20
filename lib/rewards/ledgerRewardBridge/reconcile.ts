/**
 * M5.1 — Reconciliation safety net for Ledger → Reward bridge.
 * Finds settlement-origin accrued ledgers without creator_reward and without terminal outcome.
 * Bounded by created_at lookback + limit (no blind full-table scan).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isSettlementOriginLedger, readLedgerRewardOutcome } from './outcomes';
import { processLedgerRewardAttempt } from './processLedgerRewardAttempt';
import type {
  ProcessLedgerRewardAttemptResult,
  ReconcileLedgerRewardBridgeResult,
} from './types';

export type ReconcileLedgerRewardBridgeOptions = {
  /** Max ledger rows to attempt in this run. */
  limit?: number;
  /** Only consider ledgers created within this many hours. */
  lookbackHours?: number;
  /** Over-fetch multiplier before filtering (default 4). */
  fetchMultiplier?: number;
};

function emptyResult(): ReconcileLedgerRewardBridgeResult {
  return {
    scanned: 0,
    attempted: 0,
    created: 0,
    duplicate: 0,
    deferred: 0,
    rejected: 0,
    retryable: 0,
    skipped: 0,
    results: [],
  };
}

function shouldAttempt(meta: Record<string, unknown> | null | undefined): boolean {
  const outcome = readLedgerRewardOutcome(meta);
  if (!outcome) return true; // never attempted / crash before schedule
  if (outcome.terminal) return false;
  // pending | deferred | retryable
  return (
    outcome.class === 'pending' ||
    outcome.class === 'deferred' ||
    outcome.class === 'retryable'
  );
}

export async function reconcileLedgerRewardBridge(
  supabase: SupabaseClient,
  options: ReconcileLedgerRewardBridgeOptions = {},
): Promise<ReconcileLedgerRewardBridgeResult> {
  const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
  const lookbackHours = Math.max(1, Math.min(options.lookbackHours ?? 168, 24 * 30));
  const fetchMultiplier = Math.max(2, Math.min(options.fetchMultiplier ?? 4, 10));
  const since = new Date(Date.now() - lookbackHours * 3600_000).toISOString();

  const fetchLimit = Math.min(limit * fetchMultiplier, 800);

  const { data: rows, error } = await supabase
    .from('affiliate_ledger_entries')
    .select('id, status, notes, meta, created_at')
    .eq('status', 'accrued')
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(fetchLimit);

  if (error || !rows) {
    return emptyResult();
  }

  const settlementCandidates = rows.filter((r) =>
    isSettlementOriginLedger({
      notes: r.notes as string | null,
      meta: (r.meta ?? {}) as Record<string, unknown>,
    }),
  );

  const out = emptyResult();
  out.scanned = settlementCandidates.length;

  if (settlementCandidates.length === 0) {
    return out;
  }

  const ids = settlementCandidates.map((r) => String(r.id));
  const { data: rewards } = await supabase
    .from('creator_rewards')
    .select('ledger_entry_id')
    .in('ledger_entry_id', ids);

  const rewarded = new Set(
    (rewards ?? [])
      .map((r) => (r.ledger_entry_id ? String(r.ledger_entry_id) : ''))
      .filter(Boolean),
  );

  const toProcess: string[] = [];
  for (const row of settlementCandidates) {
    const id = String(row.id);
    if (rewarded.has(id)) {
      out.skipped += 1;
      continue;
    }
    const meta = (row.meta ?? {}) as Record<string, unknown>;
    if (!shouldAttempt(meta)) {
      out.skipped += 1;
      continue;
    }
    toProcess.push(id);
    if (toProcess.length >= limit) break;
  }

  const results: ProcessLedgerRewardAttemptResult[] = [];
  for (const ledgerId of toProcess) {
    const result = await processLedgerRewardAttempt(supabase, ledgerId);
    results.push(result);
    out.attempted += 1;
    if (result.outcome === 'created') out.created += 1;
    else if (result.outcome === 'duplicate') out.duplicate += 1;
    else if (result.outcome === 'deferred') out.deferred += 1;
    else if (result.outcome === 'rejected') out.rejected += 1;
    else if (result.outcome === 'retryable') out.retryable += 1;
  }

  out.results = results;
  return out;
}
