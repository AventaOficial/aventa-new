/**
 * M5.1 — Reconciliation safety net for Ledger → Reward bridge.
 * Finds settlement-origin accrued ledgers whose reward is missing or not yet certified.
 * affiliate_ledger_entries.meta is not an economic authority.
 * Bounded by created_at lookback + limit (no blind full-table scan).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isSettlementOriginLedger } from './outcomes';
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

function shouldSkipCertifiedReward(input: {
  reward:
    | { id: string; gross_commission_cents?: number | null; currency?: string | null }
    | undefined;
  ledgerAmountCents: number;
  auditedRewardIds: Set<string>;
}): boolean {
  const reward = input.reward;
  if (!reward) return false;
  if (!input.auditedRewardIds.has(reward.id)) return false;
  if (
    typeof reward.gross_commission_cents === 'number' &&
    reward.gross_commission_cents !== input.ledgerAmountCents
  ) {
    return false;
  }
  if (
    typeof reward.currency === 'string' &&
    reward.currency.trim().toUpperCase() !== 'MXN'
  ) {
    return false;
  }
  return true;
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
    .select('id, status, notes, meta, created_at, amount_cents')
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
    .select('id, ledger_entry_id, gross_commission_cents, currency')
    .in('ledger_entry_id', ids);

  const rewardByLedger = new Map<
    string,
    { id: string; gross_commission_cents?: number | null; currency?: string | null }
  >();
  for (const reward of rewards ?? []) {
    const ledgerId = reward.ledger_entry_id ? String(reward.ledger_entry_id) : '';
    const rewardId = reward.id ? String(reward.id) : '';
    if (ledgerId && rewardId) {
      rewardByLedger.set(ledgerId, {
        id: rewardId,
        gross_commission_cents: reward.gross_commission_cents,
        currency: reward.currency,
      });
    }
  }

  const rewardIds = [...rewardByLedger.values()].map((reward) => reward.id);
  const auditedRewardIds = new Set<string>();
  if (rewardIds.length > 0) {
    const { data: auditRows, error: auditError } = await supabase
      .from('reward_audit_log')
      .select('entity_id')
      .eq('entity_type', 'creator_reward')
      .eq('event_type', 'reward_created')
      .in('entity_id', rewardIds);
    if (!auditError) {
      for (const audit of auditRows ?? []) {
        const entityId = (audit as { entity_id?: string }).entity_id;
        if (entityId) auditedRewardIds.add(String(entityId));
      }
    }
  }

  const toProcess: string[] = [];
  for (const row of settlementCandidates) {
    const id = String(row.id);
    const amountCents = Number((row as { amount_cents?: number }).amount_cents);
    if (
      shouldSkipCertifiedReward({
        reward: rewardByLedger.get(id),
        ledgerAmountCents: Number.isFinite(amountCents) ? amountCents : Number.NaN,
        auditedRewardIds,
      })
    ) {
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
