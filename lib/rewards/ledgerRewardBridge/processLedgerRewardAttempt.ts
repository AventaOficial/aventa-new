/**
 * M5.1 — processLedgerRewardAttempt
 * Loads ledger → flag gates → tryCreateRewardFromLedgerRow only.
 * No payout. No settlement mutation. No second attribution matcher.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AffiliateNetworkId } from '@/lib/rewards/adapters/types';
import { tryCreateRewardFromLedgerRow, type LedgerRowForReward } from '@/lib/rewards/processLedger';
import { writeRewardAuditLog } from '@/lib/rewards/audit';
import { canAutoAttemptRewards, classifyEngineReason } from './classify';
import {
  buildLedgerRewardOutcome,
  extractCommissionIdFromMeta,
  persistLedgerRewardOutcome,
  readLedgerRewardOutcome,
} from './outcomes';
import type { ProcessLedgerRewardAttemptResult } from './types';

type LedgerRow = LedgerRowForReward & {
  meta?: Record<string, unknown> | null;
};

function toNetwork(raw: string): AffiliateNetworkId {
  const n = raw as AffiliateNetworkId;
  return n;
}

async function loadExistingRewardId(
  supabase: SupabaseClient,
  ledgerEntryId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('creator_rewards')
    .select('id')
    .eq('ledger_entry_id', ledgerEntryId)
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

async function auditAttempt(
  supabase: SupabaseClient,
  result: ProcessLedgerRewardAttemptResult,
): Promise<void> {
  await writeRewardAuditLog(supabase, {
    eventType: 'ledger_reward_bridge_attempt',
    actorId: null,
    entityType: 'affiliate_ledger_entry',
    entityId: result.ledgerEntryId,
    previousState: null,
    newState: result.outcome,
    metadata: {
      commission_id: result.commissionId,
      ledger_entry_id: result.ledgerEntryId,
      reward_id: result.rewardId,
      outcome: result.outcome,
      reason: result.reason,
      attempt: result.attempt,
      terminal: result.terminal,
    },
  });
}

export async function processLedgerRewardAttempt(
  supabase: SupabaseClient,
  ledgerEntryId: string,
): Promise<ProcessLedgerRewardAttemptResult> {
  const id = ledgerEntryId.trim();

  const { data: row, error } = await supabase
    .from('affiliate_ledger_entries')
    .select(
      'id, network, amount_cents, status, external_ref, notes, meta, created_at, tracking_tag, offer_id, creator_id, click_id',
    )
    .eq('id', id)
    .maybeSingle();

  if (error || !row?.id) {
    const failed: ProcessLedgerRewardAttemptResult = {
      ledgerEntryId: id,
      outcome: 'retryable',
      reason: 'ledger_load_failed',
      attempt: 0,
      rewardId: null,
      commissionId: null,
      terminal: false,
    };
    return failed;
  }

  const meta = (row.meta ?? {}) as Record<string, unknown>;
  const prev = readLedgerRewardOutcome(meta);
  const commissionId = extractCommissionIdFromMeta(meta) ?? prev?.commissionId ?? null;
  const nextAttempt = (prev?.attempt ?? 0) + 1;

  if (prev?.terminal) {
    const reused: ProcessLedgerRewardAttemptResult = {
      ledgerEntryId: id,
      outcome: prev.class,
      reason: prev.reason,
      attempt: prev.attempt,
      rewardId: prev.rewardId,
      commissionId: prev.commissionId ?? commissionId,
      terminal: true,
    };
    return reused;
  }

  const existingRewardId = await loadExistingRewardId(supabase, id);
  if (existingRewardId) {
    const outcome = buildLedgerRewardOutcome({
      class: 'duplicate',
      reason: 'duplicate_ledger',
      attempt: nextAttempt,
      commissionId,
      rewardId: existingRewardId,
      terminal: true,
    });
    await persistLedgerRewardOutcome(supabase, {
      ledgerEntryId: id,
      prevMeta: meta,
      outcome,
    });
    const result: ProcessLedgerRewardAttemptResult = {
      ledgerEntryId: id,
      outcome: 'duplicate',
      reason: 'duplicate_ledger',
      attempt: nextAttempt,
      rewardId: existingRewardId,
      commissionId,
      terminal: true,
    };
    await auditAttempt(supabase, result);
    return result;
  }

  const gates = canAutoAttemptRewards();
  if (!gates.ok) {
    const outcome = buildLedgerRewardOutcome({
      class: 'deferred',
      reason: gates.reason,
      attempt: nextAttempt,
      commissionId,
      rewardId: null,
      terminal: false,
    });
    const persisted = await persistLedgerRewardOutcome(supabase, {
      ledgerEntryId: id,
      prevMeta: meta,
      outcome,
    });
    const result: ProcessLedgerRewardAttemptResult = {
      ledgerEntryId: id,
      outcome: 'deferred',
      reason: gates.reason,
      attempt: nextAttempt,
      rewardId: null,
      commissionId,
      terminal: false,
    };
    if (!persisted.ok) {
      result.outcome = 'retryable';
      result.reason = 'outcome_persist_failed';
    }
    await auditAttempt(supabase, result);
    return result;
  }

  const ledgerRow: LedgerRow = {
    id: String(row.id),
    network: toNetwork(String(row.network)),
    amount_cents: Number(row.amount_cents),
    status: String(row.status),
    external_ref: (row.external_ref as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    meta,
    created_at: (row.created_at as string | null) ?? null,
    tracking_tag: (row.tracking_tag as string | null) ?? null,
    offer_id: (row.offer_id as string | null) ?? null,
    creator_id: (row.creator_id as string | null) ?? null,
    click_id: (row.click_id as string | null) ?? null,
  };

  const created = await tryCreateRewardFromLedgerRow(supabase, ledgerRow);

  let classified: ProcessLedgerRewardAttemptResult;

  if (created.created && created.rewardId) {
    classified = {
      ledgerEntryId: id,
      outcome: 'created',
      reason: 'created',
      attempt: nextAttempt,
      rewardId: created.rewardId,
      commissionId,
      terminal: true,
    };
  } else {
    const reason = created.reason ?? 'unknown';
    const c = classifyEngineReason(reason);
    classified = {
      ledgerEntryId: id,
      outcome: c.class === 'duplicate' ? 'duplicate' : c.class,
      reason,
      attempt: nextAttempt,
      rewardId: null,
      commissionId,
      terminal: c.terminal,
    };
    if (c.class === 'duplicate') {
      const again = await loadExistingRewardId(supabase, id);
      classified.rewardId = again;
    }
  }

  const outcome = buildLedgerRewardOutcome({
    class: classified.outcome,
    reason: classified.reason,
    attempt: classified.attempt,
    commissionId: classified.commissionId,
    rewardId: classified.rewardId,
    terminal: classified.terminal,
  });

  const persisted = await persistLedgerRewardOutcome(supabase, {
    ledgerEntryId: id,
    prevMeta: meta,
    outcome,
  });
  if (!persisted.ok && !classified.terminal) {
    classified = {
      ...classified,
      outcome: 'retryable',
      reason: 'outcome_persist_failed',
      terminal: false,
    };
  }

  await auditAttempt(supabase, classified);
  return classified;
}
