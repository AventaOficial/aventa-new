/**
 * M5.4 — Reconcile AVAILABLE rewards without payout_intent.
 * Bounded lookback + limit. Uses existing indexes (creator_id, status).
 * Never submits provider / never PAID.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { processAvailableRewardPayoutIntent } from './processAvailableRewardPayoutIntent';
import type {
  ProcessAvailablePayoutIntentResult,
  ReconcileAvailablePayoutIntentResult,
} from './types';

export type ReconcileAvailablePayoutIntentOptions = {
  limit?: number;
  /** Only consider rewards that became AVAILABLE within this window. */
  lookbackHours?: number;
  fetchMultiplier?: number;
};

function empty(): ReconcileAvailablePayoutIntentResult {
  return {
    scanned: 0,
    attempted: 0,
    reserved: 0,
    reused: 0,
    deferred: 0,
    rejected: 0,
    skipped: 0,
    results: [],
  };
}

export async function reconcileAvailablePayoutIntents(
  supabase: SupabaseClient,
  options: ReconcileAvailablePayoutIntentOptions = {},
): Promise<ReconcileAvailablePayoutIntentResult> {
  const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
  const lookbackHours = Math.max(1, Math.min(options.lookbackHours ?? 168, 24 * 60));
  const fetchMultiplier = Math.max(2, Math.min(options.fetchMultiplier ?? 4, 10));
  const since = new Date(Date.now() - lookbackHours * 3600_000).toISOString();
  const fetchLimit = Math.min(limit * fetchMultiplier, 800);

  const { data: rows, error } = await supabase
    .from('creator_rewards')
    .select('id, status, available_at, created_at')
    .eq('status', 'AVAILABLE')
    .gte('available_at', since)
    .order('available_at', { ascending: true })
    .limit(fetchLimit);

  if (error || !rows?.length) {
    return empty();
  }

  const out = empty();
  out.scanned = rows.length;
  const ids = rows.map((r) => String(r.id));

  const { data: intents } = await supabase
    .from('payout_intents')
    .select('reward_id')
    .in('reward_id', ids);

  const claimed = new Set(
    (intents ?? [])
      .map((r) => (r.reward_id ? String(r.reward_id) : ''))
      .filter(Boolean),
  );

  const toProcess: string[] = [];
  for (const row of rows) {
    const id = String(row.id);
    if (claimed.has(id)) {
      out.skipped += 1;
      continue;
    }
    toProcess.push(id);
    if (toProcess.length >= limit) break;
  }

  const results: ProcessAvailablePayoutIntentResult[] = [];
  for (const rewardId of toProcess) {
    const result = await processAvailableRewardPayoutIntent(supabase, rewardId);
    results.push(result);
    out.attempted += 1;
    if (result.outcome === 'reserved') out.reserved += 1;
    else if (result.outcome === 'reused') out.reused += 1;
    else if (result.outcome === 'deferred') out.deferred += 1;
    else if (result.outcome === 'rejected') out.rejected += 1;
  }
  out.results = results;
  return out;
}
