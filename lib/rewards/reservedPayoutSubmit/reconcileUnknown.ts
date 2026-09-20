/**
 * M5.5 — Bounded batch: UNKNOWN intents → reconcile (never submit).
 * Default: still-unknown / failure only — no auto-PAID.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  processUnknownPayoutReconcile,
  type ProcessUnknownPayoutReconcileOptions,
} from './processUnknownPayoutReconcile';
import type {
  ProcessUnknownPayoutReconcileResult,
  ReconcileUnknownPayoutBatchResult,
} from './types';

export type ReconcileUnknownPayoutBatchOptions = ProcessUnknownPayoutReconcileOptions & {
  limit?: number;
  lookbackHours?: number;
};

function empty(): ReconcileUnknownPayoutBatchResult {
  return {
    scanned: 0,
    attempted: 0,
    stillUnknown: 0,
    reconciledFailed: 0,
    reused: 0,
    deferred: 0,
    rejected: 0,
    results: [],
  };
}

export async function reconcileUnknownPayoutIntents(
  supabase: SupabaseClient,
  options: ReconcileUnknownPayoutBatchOptions = {},
): Promise<ReconcileUnknownPayoutBatchResult> {
  const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
  const lookbackHours = Math.max(1, Math.min(options.lookbackHours ?? 168, 24 * 60));
  const since = new Date(Date.now() - lookbackHours * 3600_000).toISOString();

  const { data: rows, error } = await supabase
    .from('payout_intents')
    .select('id, status, updated_at, created_at')
    .eq('status', 'UNKNOWN')
    .gte('updated_at', since)
    .order('updated_at', { ascending: true })
    .limit(limit);

  if (error || !rows?.length) {
    return empty();
  }

  const out = empty();
  out.scanned = rows.length;
  const results: ProcessUnknownPayoutReconcileResult[] = [];

  for (const row of rows) {
    const result = await processUnknownPayoutReconcile(supabase, String(row.id), {
      actorId: options.actorId,
      provider: options.provider,
      sandboxOptions: options.sandboxOptions ?? { reconcile: 'unknown' },
      applyPaid: false, // M5.5 cron never auto-PAID
    });
    results.push(result);
    out.attempted += 1;
    if (result.outcome === 'still_unknown' || result.outcome === 'evidence_observed') {
      out.stillUnknown += 1;
    } else if (result.outcome === 'reconciled_failed') out.reconciledFailed += 1;
    else if (result.outcome === 'reused') out.reused += 1;
    else if (result.outcome === 'deferred') out.deferred += 1;
    else out.rejected += 1;
  }
  out.results = results;
  return out;
}
