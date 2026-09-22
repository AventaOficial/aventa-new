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

export const PAYOUT_BATCH_GATE_ENV_KEY = 'PAYOUT_BATCH_GATE_ENABLED';

export function isPayoutBatchGateEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env[PAYOUT_BATCH_GATE_ENV_KEY] ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** reward_ids incluidos en líneas `pass` de lotes `approved`. Fail-closed: error/tabla ausente → set vacío. */
async function loadApprovedBatchRewardIds(
  supabase: SupabaseClient,
  candidateIds: string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  try {
    const { data: batches, error } = await supabase
      .from('payout_batches')
      .select('id')
      .eq('status', 'approved');
    if (error || !batches?.length) return out;
    const { data: lines } = await supabase
      .from('payout_batch_lines')
      .select('reward_ids')
      .in('batch_id', batches.map((b) => String(b.id)))
      .eq('decision', 'pass');
    const candidates = new Set(candidateIds);
    for (const l of lines ?? []) {
      const ids = Array.isArray(l.reward_ids) ? l.reward_ids : [];
      for (const id of ids) {
        const s = String(id);
        if (candidates.has(s)) out.add(s);
      }
    }
  } catch {
    /* fail-closed */
  }
  return out;
}

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

  // Centro de Pagos V3/V5: si el gate de lotes está activo, solo se reservan rewards
  // que estén en una línea `pass` de un lote `approved`. Default OFF (comportamiento legacy).
  const approvedRewardIds = isPayoutBatchGateEnabled()
    ? await loadApprovedBatchRewardIds(supabase, ids)
    : null;

  const toProcess: string[] = [];
  for (const row of rows) {
    const id = String(row.id);
    if (claimed.has(id)) {
      out.skipped += 1;
      continue;
    }
    if (approvedRewardIds && !approvedRewardIds.has(id)) {
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
