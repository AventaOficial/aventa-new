/**
 * M5.5 — Bounded batch: RESERVED intents → submit (initiated by default).
 * Uses idx_payout_intents_status_created. No full table scan.
 * Never auto-retries UNKNOWN via submit.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { processReservedPayoutSubmit } from './processReservedPayoutSubmit';
import type {
  ProcessReservedPayoutSubmitResult,
  ReconcileReservedPayoutSubmitBatchResult,
} from './types';
import type { ProcessReservedPayoutSubmitOptions } from './processReservedPayoutSubmit';

export type ReconcileReservedPayoutSubmitOptions = ProcessReservedPayoutSubmitOptions & {
  limit?: number;
  lookbackHours?: number;
};

function empty(): ReconcileReservedPayoutSubmitBatchResult {
  return {
    scanned: 0,
    attempted: 0,
    submitted: 0,
    reused: 0,
    unknown: 0,
    failed: 0,
    deferred: 0,
    rejected: 0,
    results: [],
  };
}

export async function reconcileReservedPayoutSubmits(
  supabase: SupabaseClient,
  options: ReconcileReservedPayoutSubmitOptions = {},
): Promise<ReconcileReservedPayoutSubmitBatchResult> {
  const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
  const lookbackHours = Math.max(1, Math.min(options.lookbackHours ?? 168, 24 * 60));
  const since = new Date(Date.now() - lookbackHours * 3600_000).toISOString();

  const { data: rows, error } = await supabase
    .from('payout_intents')
    .select('id, status, reserved_at, created_at')
    .eq('status', 'RESERVED')
    .gte('reserved_at', since)
    .order('reserved_at', { ascending: true })
    .limit(limit);

  if (error || !rows?.length) {
    return empty();
  }

  const out = empty();
  out.scanned = rows.length;
  const results: ProcessReservedPayoutSubmitResult[] = [];

  for (const row of rows) {
    const intentId = String(row.id);
    const result = await processReservedPayoutSubmit(supabase, intentId, {
      actorId: options.actorId,
      provider: options.provider,
      sandboxOptions: options.sandboxOptions,
      stopBeforePaid: options.stopBeforePaid,
    });
    results.push(result);
    out.attempted += 1;
    if (result.outcome === 'submitted') out.submitted += 1;
    else if (result.outcome === 'reused') out.reused += 1;
    else if (result.outcome === 'unknown') out.unknown += 1;
    else if (result.outcome === 'failed') out.failed += 1;
    else if (result.outcome === 'deferred') out.deferred += 1;
    else out.rejected += 1;
  }
  out.results = results;
  return out;
}
