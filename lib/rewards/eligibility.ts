import type { SupabaseClient } from '@supabase/supabase-js';
import {
  REWARDS_REQUIRED_APPROVED_OFFERS,
  REWARDS_REQUIRED_POSITIVE_VOTES,
  REWARDS_TERMS_VERSION,
} from '@/lib/rewards/config';

export type RewardsProgress = {
  approvedOffersCount: number;
  requiredOffers: number;
  positiveVotesTotal: number;
  requiredVotes: number;
  offersProgressMet: boolean;
  votesProgressMet: boolean;
  unlockEligible: boolean;
};

export type RewardsMembership = RewardsProgress & {
  rewardProgramUnlockedAt: string | null;
  welcomeOfferId: string | null;
  welcomeOfferSelectedAt: string | null;
  needsWelcomeSelection: boolean;
  needsTermsAcceptance: boolean;
  rewardsTermsAcceptedAt: string | null;
  rewardsTermsVersion: string | null;
  termsCurrent: boolean;
  /**
   * Fase del claim de bienvenida (derivada en servidor).
   * - locked: no cumple requisitos
   * - unlocked: desbloqueó, aún no aceptó términos
   * - pending_selection: términos OK, falta elegir oferta (fase posterior)
   * - complete: welcome offer elegida
   */
  claimPhase: 'locked' | 'unlocked' | 'pending_selection' | 'complete';
};

function isMissingRewardsColumn(error: { message?: string; code?: string } | null): boolean {
  const msg = (error?.message ?? '').toLowerCase();
  return (
    error?.code === 'PGRST204' ||
    msg.includes('reward_program_unlocked_at') ||
    msg.includes('welcome_offer_id') ||
    msg.includes('rewards_terms') ||
    msg.includes('schema cache')
  );
}

/** Cuenta ofertas aprobadas/publicadas del usuario. */
export async function countApprovedOffers(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('offers')
    .select('id', { count: 'exact', head: true })
    .eq('created_by', userId)
    .in('status', ['approved', 'published']);

  if (error) {
    console.error('[rewards/eligibility] count offers', error.message);
    return 0;
  }
  return count ?? 0;
}

/** Suma votos positivos acumulados (upvotes_count) en ofertas aprobadas del usuario. */
export async function sumAccumulatedPositiveVotes(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('offers')
    .select('upvotes_count')
    .eq('created_by', userId)
    .in('status', ['approved', 'published']);

  if (error) {
    console.error('[rewards/eligibility] sum votes', error.message);
    return 0;
  }

  return (data ?? []).reduce(
    (sum, row) => sum + Math.max(0, Number((row as { upvotes_count?: number }).upvotes_count ?? 0)),
    0,
  );
}

export function computeRewardsProgress(
  approvedOffersCount: number,
  positiveVotesTotal: number,
): RewardsProgress {
  const offersProgressMet = approvedOffersCount >= REWARDS_REQUIRED_APPROVED_OFFERS;
  const votesProgressMet = positiveVotesTotal >= REWARDS_REQUIRED_POSITIVE_VOTES;
  return {
    approvedOffersCount,
    requiredOffers: REWARDS_REQUIRED_APPROVED_OFFERS,
    positiveVotesTotal,
    requiredVotes: REWARDS_REQUIRED_POSITIVE_VOTES,
    offersProgressMet,
    votesProgressMet,
    unlockEligible: offersProgressMet && votesProgressMet,
  };
}

export async function getRewardsProgress(
  supabase: SupabaseClient,
  userId: string,
): Promise<RewardsProgress> {
  const [approvedOffersCount, positiveVotesTotal] = await Promise.all([
    countApprovedOffers(supabase, userId),
    sumAccumulatedPositiveVotes(supabase, userId),
  ]);
  return computeRewardsProgress(approvedOffersCount, positiveVotesTotal);
}

export async function getRewardsMembershipFields(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  rewardProgramUnlockedAt: string | null;
  welcomeOfferId: string | null;
  welcomeOfferSelectedAt: string | null;
  rewardsTermsAcceptedAt: string | null;
  rewardsTermsVersion: string | null;
}> {
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'reward_program_unlocked_at, welcome_offer_id, welcome_offer_selected_at, rewards_terms_accepted_at, rewards_terms_version',
    )
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) {
    if (error && !isMissingRewardsColumn(error)) {
      console.error('[rewards/eligibility] profile fields', error.message);
    }
    return {
      rewardProgramUnlockedAt: null,
      welcomeOfferId: null,
      welcomeOfferSelectedAt: null,
      rewardsTermsAcceptedAt: null,
      rewardsTermsVersion: null,
    };
  }

  const row = data as {
    reward_program_unlocked_at?: string | null;
    welcome_offer_id?: string | null;
    welcome_offer_selected_at?: string | null;
    rewards_terms_accepted_at?: string | null;
    rewards_terms_version?: string | null;
  };

  return {
    rewardProgramUnlockedAt: row.reward_program_unlocked_at ?? null,
    welcomeOfferId: row.welcome_offer_id ?? null,
    welcomeOfferSelectedAt: row.welcome_offer_selected_at ?? null,
    rewardsTermsAcceptedAt: row.rewards_terms_accepted_at ?? null,
    rewardsTermsVersion: row.rewards_terms_version ?? null,
  };
}

export async function getRewardsMembership(
  supabase: SupabaseClient,
  userId: string,
): Promise<RewardsMembership> {
  const progress = await getRewardsProgress(supabase, userId);
  const fields = await getRewardsMembershipFields(supabase, userId);
  const unlocked = Boolean(fields.rewardProgramUnlockedAt);
  const termsCurrent =
    Boolean(fields.rewardsTermsAcceptedAt) &&
    fields.rewardsTermsVersion === REWARDS_TERMS_VERSION;

  let claimPhase: RewardsMembership['claimPhase'] = 'locked';
  if (unlocked && fields.welcomeOfferId) {
    claimPhase = 'complete';
  } else if (unlocked && termsCurrent) {
    claimPhase = 'pending_selection';
  } else if (unlocked) {
    claimPhase = 'unlocked';
  }

  return {
    ...progress,
    ...fields,
    needsWelcomeSelection: unlocked && termsCurrent && !fields.welcomeOfferId,
    needsTermsAcceptance: unlocked && !termsCurrent,
    termsCurrent,
    claimPhase,
  };
}
