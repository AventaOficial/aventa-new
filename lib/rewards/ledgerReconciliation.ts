import type { SupabaseClient } from '@supabase/supabase-js';
import { cancelReward, reverseReward } from '@/lib/rewards/rewardsEngine';
import { createPaidRewardClawbackAdjustment } from '@/lib/rewards/clawback';
import { writeRewardAuditLog } from '@/lib/rewards/audit';

export type ReconcileResult = {
  ledgerEntryId: string;
  action: 'none' | 'cancelled' | 'reversed' | 'clawback_pending';
  rewardId?: string;
  reason?: string;
};

function isTerminalLedgerStatus(status: string): boolean {
  return status === 'void' || status === 'reversed';
}

/**
 * Reconcilia reward cuando la comisión del ledger pasa a void/reversed.
 * PAID → clawback pendiente (reward permanece PAID).
 */
export async function reconcileRewardsForLedgerStatus(
  supabase: SupabaseClient,
  ledgerEntryId: string,
  actorId: string | null,
  reason: string,
): Promise<ReconcileResult> {
  const { data: ledger, error: ledgerErr } = await supabase
    .from('affiliate_ledger_entries')
    .select('id, status, amount_cents')
    .eq('id', ledgerEntryId)
    .maybeSingle();

  if (ledgerErr || !ledger) {
    return { ledgerEntryId, action: 'none', reason: 'ledger_not_found' };
  }

  const ledgerStatus = (ledger as { status?: string }).status ?? '';
  if (!isTerminalLedgerStatus(ledgerStatus)) {
    return { ledgerEntryId, action: 'none' };
  }

  const { data: reward } = await supabase
    .from('creator_rewards')
    .select('id, status, creator_share_cents, payout_id')
    .eq('ledger_entry_id', ledgerEntryId)
    .maybeSingle();

  if (!reward?.id) {
    return { ledgerEntryId, action: 'none', reason: 'no_reward' };
  }

  const rewardRow = reward as {
    id: string;
    status: string;
    creator_share_cents: number;
    payout_id?: string | null;
  };

  if (rewardRow.status === 'CANCELLED' || rewardRow.status === 'REVERSED') {
    return { ledgerEntryId, action: 'none', rewardId: rewardRow.id, reason: 'already_terminal' };
  }

  const actor = actorId ?? 'system';
  const reconcileReason = `${reason} (ledger ${ledgerStatus})`;

  if (rewardRow.status === 'PAID') {
    const clawback = await createPaidRewardClawbackAdjustment(supabase, {
      rewardId: rewardRow.id,
      actorId: actor,
      reason: reconcileReason,
      ledgerEntryId,
    });
    if (!clawback.ok) {
      return { ledgerEntryId, action: 'none', rewardId: rewardRow.id, reason: clawback.error };
    }
    return { ledgerEntryId, action: 'clawback_pending', rewardId: rewardRow.id };
  }

  if (rewardRow.status === 'AVAILABLE') {
    const ok = await reverseReward(supabase, rewardRow.id, actor, reconcileReason);
    return {
      ledgerEntryId,
      action: ok ? 'reversed' : 'none',
      rewardId: rewardRow.id,
      reason: ok ? undefined : 'reverse_failed',
    };
  }

  if (rewardRow.status === 'VALIDATING' || rewardRow.status === 'PENDING') {
    const ok = await cancelReward(supabase, rewardRow.id, actor, reconcileReason);
    return {
      ledgerEntryId,
      action: ok ? 'cancelled' : 'none',
      rewardId: rewardRow.id,
      reason: ok ? undefined : 'cancel_failed',
    };
  }

  return { ledgerEntryId, action: 'none', rewardId: rewardRow.id };
}

/** Marca ledger para revisión staff (atribución medium / ambigua). */
export async function flagLedgerPendingStaffReview(
  supabase: SupabaseClient,
  ledgerEntryId: string,
  hint: {
    offerId: string;
    creatorId: string;
    method: string;
    confidence: string;
    clickId?: string | null;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const { data: ledger } = await supabase
    .from('affiliate_ledger_entries')
    .select('meta')
    .eq('id', ledgerEntryId)
    .maybeSingle();

  const prevMeta =
    ledger?.meta && typeof ledger.meta === 'object' && !Array.isArray(ledger.meta)
      ? (ledger.meta as Record<string, unknown>)
      : {};

  await supabase
    .from('affiliate_ledger_entries')
    .update({
      offer_id: hint.offerId,
      creator_id: hint.creatorId,
      attribution_method: hint.method,
      attribution_confidence: hint.confidence,
      attributable: false,
      meta: {
        ...prevMeta,
        pending_staff_review: true,
        review_hint: {
          offer_id: hint.offerId,
          creator_id: hint.creatorId,
          method: hint.method,
          confidence: hint.confidence,
          click_id: hint.clickId ?? null,
          flagged_at: now,
        },
      },
    })
    .eq('id', ledgerEntryId);

  await writeRewardAuditLog(supabase, {
    eventType: 'ledger_pending_staff_review',
    actorId: null,
    entityType: 'affiliate_ledger_entry',
    entityId: ledgerEntryId,
    previousState: null,
    newState: 'pending_review',
    metadata: { ...hint, flagged_at: now },
  });
}
