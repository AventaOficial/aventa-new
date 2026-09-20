/**
 * M5.6 — Bounded batch: SUBMITTED | UNKNOWN → confirm via applyProviderConfirmation.
 * Uses idx_payout_intents_status_created. No full table scan. Never submit.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  processConfirmablePayoutIntent,
  type ProcessConfirmablePayoutOptions,
} from './processConfirmablePayoutIntent';
import type {
  ProcessConfirmablePayoutResult,
  ReconcileConfirmableBatchResult,
} from './types';

export type ReconcileConfirmablePayoutsOptions = ProcessConfirmablePayoutOptions & {
  limit?: number;
  lookbackHours?: number;
};

function empty(): ReconcileConfirmableBatchResult {
  return {
    scanned: 0,
    attempted: 0,
    paid: 0,
    failed: 0,
    stillUnknown: 0,
    stillSubmitted: 0,
    reused: 0,
    deferred: 0,
    rejected: 0,
    results: [],
  };
}

export async function reconcileConfirmablePayouts(
  supabase: SupabaseClient,
  options: ReconcileConfirmablePayoutsOptions = {},
): Promise<ReconcileConfirmableBatchResult> {
  const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
  const lookbackHours = Math.max(1, Math.min(options.lookbackHours ?? 168, 24 * 60));
  const since = new Date(Date.now() - lookbackHours * 3600_000).toISOString();
  // Fetch a bit more than limit across both statuses, then take oldest first.
  const fetchLimit = Math.min(limit * 2, 400);

  const { data: rows, error } = await supabase
    .from('payout_intents')
    .select('id, status, updated_at, reserved_at, created_at')
    .in('status', ['SUBMITTED', 'UNKNOWN'])
    .gte('updated_at', since)
    .order('updated_at', { ascending: true })
    .limit(fetchLimit);

  if (error || !rows?.length) {
    return empty();
  }

  const out = empty();
  out.scanned = rows.length;
  const results: ProcessConfirmablePayoutResult[] = [];
  let attempted = 0;

  for (const row of rows) {
    if (attempted >= limit) break;
    const result = await processConfirmablePayoutIntent(supabase, String(row.id), {
      actorId: options.actorId,
      provider: options.provider,
      sandboxOptions: options.sandboxOptions,
      source: 'reconcile',
    });
    results.push(result);
    attempted += 1;
    if (result.outcome === 'paid') out.paid += 1;
    else if (result.outcome === 'failed') out.failed += 1;
    else if (result.outcome === 'still_unknown') out.stillUnknown += 1;
    else if (result.outcome === 'still_submitted') out.stillSubmitted += 1;
    else if (result.outcome === 'reused') out.reused += 1;
    else if (result.outcome === 'deferred') out.deferred += 1;
    else out.rejected += 1;
  }
  out.attempted = attempted;
  out.results = results;
  return out;
}
