import type { SupabaseClient } from '@supabase/supabase-js';
import {
  REWARDS_CREATOR_SHARE_BPS,
  REWARDS_HOLD_DAYS,
  splitCommissionCents,
  type RewardStatus,
} from '@/lib/rewards/config';
import { isRewardsProgramActive } from '@/lib/rewards/programStatus';
import { isOfferParticipatingInRewards } from '@/lib/rewards/offerParticipation';
import {
  resolveCommissionAttribution,
  type LedgerAttributionInput,
} from '@/lib/rewards/attribution/matcher';
import { writeRewardAuditLog } from '@/lib/rewards/audit';
import { flagLedgerPendingStaffReview } from '@/lib/rewards/ledgerReconciliation';

export type FraudCheckInput = {
  creatorId: string;
  offerId: string;
  clickerUserId?: string | null;
};

export function basicFraudFlags(input: FraudCheckInput): string[] {
  const flags: string[] = [];
  if (input.clickerUserId && input.clickerUserId === input.creatorId) {
    flags.push('self_click');
  }
  return flags;
}

function holdUntilFromNow(days: number = REWARDS_HOLD_DAYS): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function isMissingRewardsTable(error: { message?: string } | null): boolean {
  const msg = (error?.message ?? '').toLowerCase();
  return msg.includes('creator_rewards') || msg.includes('does not exist') || msg.includes('schema cache');
}

async function getClickClicker(
  supabase: SupabaseClient,
  clickId: string | null,
): Promise<string | null> {
  if (!clickId) return null;
  const { data } = await supabase
    .from('reward_outbound_clicks')
    .select('clicker_user_id')
    .eq('id', clickId)
    .maybeSingle();
  return (data as { clicker_user_id?: string | null } | null)?.clicker_user_id ?? null;
}

export type CreateRewardResult =
  | { created: true; rewardId: string; status: RewardStatus }
  | { created: false; reason: string };

/**
 * Crea recompensa desde una fila de ledger atribuida.
 * No crea si programa inactivo, atribución insuficiente, oferta no participa, o fraude evidente.
 */
export async function createRewardFromLedgerEntry(
  supabase: SupabaseClient,
  ledger: LedgerAttributionInput,
  options?: { force?: boolean; manualStaffConfirmed?: boolean; actorId?: string | null },
): Promise<CreateRewardResult> {
  if (!options?.force && !isRewardsProgramActive()) {
    return { created: false, reason: 'program_inactive' };
  }

  if (ledger.status === 'void' || ledger.status === 'reversed') {
    return { created: false, reason: 'commission_void' };
  }

  if (ledger.amount_cents <= 0) {
    return { created: false, reason: 'zero_amount' };
  }

  const { data: existing } = await supabase
    .from('creator_rewards')
    .select('id')
    .eq('ledger_entry_id', ledger.id)
    .maybeSingle();
  if (existing?.id) {
    return { created: false, reason: 'duplicate_ledger' };
  }

  let match: {
    offerId: string;
    creatorId: string;
    clickId: string | null;
    method: 'sub_id' | 'product_click_window' | 'manual';
    confidence: 'high' | 'medium';
  };

  if (options?.manualStaffConfirmed && ledger.offer_id) {
    const { data: offerRow } = await supabase
      .from('offers')
      .select('id, created_by, status')
      .eq('id', ledger.offer_id)
      .maybeSingle();
    const creatorId = (offerRow as { created_by?: string } | null)?.created_by;
    const status = (offerRow as { status?: string } | null)?.status;
    if (!creatorId || (status !== 'approved' && status !== 'published')) {
      return { created: false, reason: 'invalid_manual_offer' };
    }
    match = {
      offerId: ledger.offer_id,
      creatorId,
      clickId: ledger.click_id ?? null,
      method: 'manual',
      confidence: 'high',
    };
  } else {
    const attribution = await resolveCommissionAttribution(supabase, ledger);
    if (!attribution.matched) {
      await supabase
        .from('affiliate_ledger_entries')
        .update({
          attribution_method: 'none',
          attribution_confidence: attribution.confidence,
          attributable: false,
        })
        .eq('id', ledger.id);
      return { created: false, reason: attribution.reason };
    }

    const autoMatch = attribution.match;
    if (autoMatch.confidence === 'low' || autoMatch.confidence === 'none') {
      return { created: false, reason: 'low_confidence' };
    }

    if (autoMatch.confidence === 'medium') {
      await flagLedgerPendingStaffReview(supabase, ledger.id, {
        offerId: autoMatch.offerId,
        creatorId: autoMatch.creatorId,
        method: autoMatch.method,
        confidence: autoMatch.confidence,
        clickId: autoMatch.clickId,
      });
      return { created: false, reason: 'pending_staff_review' };
    }

    match = {
      offerId: autoMatch.offerId,
      creatorId: autoMatch.creatorId,
      clickId: autoMatch.clickId,
      method: autoMatch.method,
      confidence: 'high',
    };
  }

  const participating = await isOfferParticipatingInRewards(supabase, match.offerId);
  if (!participating) {
    return { created: false, reason: 'offer_not_participating' };
  }

  const clickerUserId = await getClickClicker(supabase, match.clickId);
  const fraudFlags = basicFraudFlags({
    creatorId: match.creatorId,
    offerId: match.offerId,
    clickerUserId,
  });
  if (fraudFlags.includes('self_click')) {
    return { created: false, reason: 'fraud_self_click' };
  }

  const { creatorCents, platformCents } = splitCommissionCents(
    ledger.amount_cents,
    REWARDS_CREATOR_SHARE_BPS,
  );
  if (creatorCents <= 0) {
    return { created: false, reason: 'zero_creator_share' };
  }

  const holdUntil = holdUntilFromNow();
  const now = new Date().toISOString();

  const { data: inserted, error } = await supabase
    .from('creator_rewards')
    .insert({
      creator_id: match.creatorId,
      offer_id: match.offerId,
      ledger_entry_id: ledger.id,
      network: ledger.network,
      gross_commission_cents: ledger.amount_cents,
      creator_share_cents: creatorCents,
      platform_share_cents: platformCents,
      creator_share_bps: REWARDS_CREATOR_SHARE_BPS,
      currency: 'MXN',
      attribution_method: match.method,
      attribution_confidence: match.confidence,
      status: 'VALIDATING',
      hold_until: holdUntil,
      fraud_flags: fraudFlags,
      meta: { click_id: match.clickId },
    })
    .select('id')
    .single();

  if (error) {
    if (isMissingRewardsTable(error)) {
      return { created: false, reason: 'schema_missing' };
    }
    console.error('[rewards/create]', error.message);
    return { created: false, reason: 'insert_failed' };
  }

  await supabase
    .from('affiliate_ledger_entries')
    .update({
      offer_id: match.offerId,
      creator_id: match.creatorId,
      click_id: match.clickId,
      attribution_method: match.method,
      attribution_confidence: match.confidence,
      attributable: true,
    })
    .eq('id', ledger.id);

  const rewardId = (inserted as { id: string }).id;

  await writeRewardAuditLog(supabase, {
    eventType: 'reward_created',
    actorId: options?.actorId ?? null,
    entityType: 'creator_reward',
    entityId: rewardId,
    previousState: null,
    newState: 'VALIDATING',
    metadata: {
      ledger_entry_id: ledger.id,
      offer_id: match.offerId,
      creator_id: match.creatorId,
      attribution_method: match.method,
      attribution_confidence: match.confidence,
      manual_staff_confirmed: Boolean(options?.manualStaffConfirmed),
    },
  });

  await writeRewardAuditLog(supabase, {
    eventType: 'reward_validating',
    actorId: null,
    entityType: 'creator_reward',
    entityId: rewardId,
    previousState: 'PENDING',
    newState: 'VALIDATING',
    metadata: { hold_until: holdUntil, created_at: now },
  });

  return { created: true, rewardId, status: 'VALIDATING' };
}

/** Mueve recompensas VALIDATING → AVAILABLE cuando venció el hold. */
export async function processExpiredRewardHolds(
  supabase: SupabaseClient,
): Promise<{ processed: number }> {
  const now = new Date().toISOString();
  const { data: rows, error } = await supabase
    .from('creator_rewards')
    .select('id, status')
    .eq('status', 'VALIDATING')
    .lte('hold_until', now);

  if (error || !rows?.length) {
    return { processed: 0 };
  }

  let processed = 0;
  for (const row of rows) {
    const id = (row as { id: string }).id;
    const { data: updated, error: upd } = await supabase
      .from('creator_rewards')
      .update({
        status: 'AVAILABLE',
        available_at: now,
        updated_at: now,
      })
      .eq('id', id)
      .eq('status', 'VALIDATING')
      .select('id')
      .maybeSingle();

    if (upd) {
      console.error('[rewards/processHolds] update failed', id, upd.message);
      continue;
    }
    if (!updated?.id) {
      continue;
    }

    processed++;
    await writeRewardAuditLog(supabase, {
      eventType: 'reward_available',
      actorId: null,
      entityType: 'creator_reward',
      entityId: id,
      previousState: 'VALIDATING',
      newState: 'AVAILABLE',
      metadata: { available_at: now, source: 'process_expired_holds' },
    });
  }

  return { processed };
}

export async function cancelReward(
  supabase: SupabaseClient,
  rewardId: string,
  actorId: string,
  reason: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const { data: row } = await supabase
    .from('creator_rewards')
    .select('status')
    .eq('id', rewardId)
    .maybeSingle();
  const prev = (row as { status?: string } | null)?.status;
  if (!prev || prev === 'PAID' || prev === 'CANCELLED' || prev === 'REVERSED') {
    return false;
  }

  const { error } = await supabase
    .from('creator_rewards')
    .update({ status: 'CANCELLED', cancelled_at: now, updated_at: now })
    .eq('id', rewardId);

  if (error) return false;

  await writeRewardAuditLog(supabase, {
    eventType: 'reward_cancelled',
    actorId,
    entityType: 'creator_reward',
    entityId: rewardId,
    previousState: prev,
    newState: 'CANCELLED',
    metadata: { reason },
  });
  return true;
}

export async function reverseReward(
  supabase: SupabaseClient,
  rewardId: string,
  actorId: string,
  reason: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const { data: row } = await supabase
    .from('creator_rewards')
    .select('status')
    .eq('id', rewardId)
    .maybeSingle();
  const prev = (row as { status?: string } | null)?.status;
  if (!prev || prev === 'PAID' || prev === 'CANCELLED' || prev === 'REVERSED') {
    return false;
  }

  const { error } = await supabase
    .from('creator_rewards')
    .update({ status: 'REVERSED', reversed_at: now, updated_at: now })
    .eq('id', rewardId)
    .eq('status', prev);

  if (error) return false;

  await writeRewardAuditLog(supabase, {
    eventType: 'reward_reversed',
    actorId,
    entityType: 'creator_reward',
    entityId: rewardId,
    previousState: prev,
    newState: 'REVERSED',
    metadata: { reason },
  });
  return true;
}

export type UserRewardBalances = {
  validatingCents: number;
  availableCents: number;
  paidCents: number;
  cancelledCents: number;
  reversedCents: number;
};

export async function getUserRewardBalances(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserRewardBalances> {
  const empty: UserRewardBalances = {
    validatingCents: 0,
    availableCents: 0,
    paidCents: 0,
    cancelledCents: 0,
    reversedCents: 0,
  };

  const { data, error } = await supabase
    .from('creator_rewards')
    .select('creator_share_cents, status')
    .eq('creator_id', userId);

  if (error) return empty;

  const balances = { ...empty };
  for (const row of data ?? []) {
    const cents = Number((row as { creator_share_cents?: number }).creator_share_cents ?? 0);
    const status = (row as { status?: string }).status;
    if (status === 'PENDING' || status === 'VALIDATING') balances.validatingCents += cents;
    else if (status === 'AVAILABLE') balances.availableCents += cents;
    else if (status === 'PAID') balances.paidCents += cents;
    else if (status === 'CANCELLED') balances.cancelledCents += cents;
    else if (status === 'REVERSED') balances.reversedCents += cents;
  }
  return balances;
}
