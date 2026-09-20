/**
 * M5.1 — Schedule durable pending attempt (no reward creation).
 * Called from orchestration after settlement — never from settleCommission internals.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildLedgerRewardOutcome,
  extractCommissionIdFromMeta,
  persistLedgerRewardOutcome,
  readLedgerRewardOutcome,
} from './outcomes';
import type { ProcessLedgerRewardAttemptResult } from './types';

export async function scheduleLedgerRewardAttempt(
  supabase: SupabaseClient,
  input: {
    ledgerEntryId: string;
    commissionId?: string | null;
  },
): Promise<ProcessLedgerRewardAttemptResult> {
  const ledgerEntryId = input.ledgerEntryId.trim();
  const { data: row, error } = await supabase
    .from('affiliate_ledger_entries')
    .select('id, meta')
    .eq('id', ledgerEntryId)
    .maybeSingle();

  if (error || !row?.id) {
    return {
      ledgerEntryId,
      outcome: 'retryable',
      reason: 'ledger_load_failed',
      attempt: 0,
      rewardId: null,
      commissionId: input.commissionId ?? null,
      terminal: false,
    };
  }

  const meta = (row.meta ?? {}) as Record<string, unknown>;
  const existing = readLedgerRewardOutcome(meta);
  if (existing?.terminal) {
    return {
      ledgerEntryId,
      outcome: existing.class,
      reason: existing.reason,
      attempt: existing.attempt,
      rewardId: existing.rewardId,
      commissionId: existing.commissionId,
      terminal: true,
    };
  }

  const commissionId =
    input.commissionId?.trim() ||
    extractCommissionIdFromMeta(meta) ||
    existing?.commissionId ||
    null;

  const outcome = buildLedgerRewardOutcome({
    class: 'pending',
    reason: 'scheduled',
    attempt: existing?.attempt ?? 0,
    commissionId,
    rewardId: existing?.rewardId ?? null,
    terminal: false,
  });

  const persisted = await persistLedgerRewardOutcome(supabase, {
    ledgerEntryId,
    prevMeta: meta,
    outcome,
  });

  if (!persisted.ok) {
    return {
      ledgerEntryId,
      outcome: 'retryable',
      reason: 'outcome_persist_failed',
      attempt: outcome.attempt,
      rewardId: null,
      commissionId,
      terminal: false,
    };
  }

  return {
    ledgerEntryId,
    outcome: 'pending',
    reason: 'scheduled',
    attempt: outcome.attempt,
    rewardId: null,
    commissionId,
    terminal: false,
  };
}
