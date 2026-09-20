/**
 * Payout intent eligibility — reuses Rewards hold + minimum gates.
 * Does NOT bypass REWARDS_MIN_PAYOUT_CENTS or AVAILABLE status.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { REWARDS_MIN_PAYOUT_CENTS } from '@/lib/rewards/config';
import { getUserRewardBalances } from '@/lib/rewards/rewardsEngine';
import type {
  CreatorRewardPayoutSnapshot,
  PayoutIntentRejectReason,
} from './types';

export type PayoutIntentEligibility =
  | { ok: true; reward: CreatorRewardPayoutSnapshot; availableCents: number }
  | { ok: false; reason: PayoutIntentRejectReason };

export async function loadCreatorRewardForPayout(
  supabase: SupabaseClient,
  rewardId: string,
): Promise<CreatorRewardPayoutSnapshot | null> {
  const { data, error } = await supabase
    .from('creator_rewards')
    .select(
      'id, creator_id, creator_share_cents, currency, status, ledger_entry_id, payout_id',
    )
    .eq('id', rewardId)
    .maybeSingle();
  if (error || !data?.id) return null;
  return data as CreatorRewardPayoutSnapshot;
}

export async function evaluatePayoutIntentEligibility(
  supabase: SupabaseClient,
  rewardId: string,
): Promise<PayoutIntentEligibility> {
  const reward = await loadCreatorRewardForPayout(supabase, rewardId);
  if (!reward) return { ok: false, reason: 'reward_not_found' };

  if (reward.status === 'CANCELLED' || reward.status === 'REVERSED') {
    return { ok: false, reason: 'reward_terminal' };
  }
  if (reward.status === 'PAID') {
    return { ok: false, reason: 'reward_terminal' };
  }
  if (reward.status !== 'AVAILABLE') {
    return { ok: false, reason: 'reward_not_available' };
  }

  const amount = Number(reward.creator_share_cents);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: 'zero_amount' };
  }

  const currency = (reward.currency ?? '').trim().toUpperCase() || 'MXN';
  if (currency !== 'MXN') {
    return { ok: false, reason: 'currency_unsupported' };
  }

  const balances = await getUserRewardBalances(supabase, reward.creator_id);
  if (balances.availableCents < REWARDS_MIN_PAYOUT_CENTS) {
    return { ok: false, reason: 'below_minimum_available' };
  }

  return {
    ok: true,
    reward: { ...reward, currency, creator_share_cents: amount },
    availableCents: balances.availableCents,
  };
}
