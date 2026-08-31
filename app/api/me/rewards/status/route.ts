import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getRewardsMembership } from '@/lib/rewards/eligibility';
import { maybeUnlockRewardsProgram, getFirstApprovedOfferIds } from '@/lib/rewards/unlock';
import { getUserRewardBalances } from '@/lib/rewards/rewardsEngine';
import { isRewardsProgramActive } from '@/lib/rewards/programStatus';
import { REWARDS_MIN_PAYOUT_CENTS, REWARDS_CREATOR_SHARE_BPS, REWARDS_HOLD_DAYS } from '@/lib/rewards/config';

/** GET: estado del Programa de Recompensas para el usuario autenticado. */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  await maybeUnlockRewardsProgram(supabase, user.id, user.id);
  const membership = await getRewardsMembership(supabase, user.id);
  const balances = await getUserRewardBalances(supabase, user.id);

  let welcomeOfferChoices: Array<{ id: string; title: string; created_at: string }> = [];
  if (membership.needsWelcomeSelection) {
    const ids = await getFirstApprovedOfferIds(supabase, user.id);
    if (ids.length > 0) {
      const { data: offers } = await supabase
        .from('offers')
        .select('id, title, created_at')
        .in('id', ids)
        .order('created_at', { ascending: true });
      welcomeOfferChoices = (offers ?? []) as Array<{ id: string; title: string; created_at: string }>;
    }
  }

  let welcomeOffer: { id: string; title: string } | null = null;
  if (membership.welcomeOfferId) {
    const { data: wo } = await supabase
      .from('offers')
      .select('id, title')
      .eq('id', membership.welcomeOfferId)
      .maybeSingle();
    if (wo) welcomeOffer = wo as { id: string; title: string };
  }

  return NextResponse.json({
    programName: 'Programa de Recompensas',
    programActive: isRewardsProgramActive(),
    progress: {
      approvedOffers: membership.approvedOffersCount,
      requiredOffers: membership.requiredOffers,
      positiveVotes: membership.positiveVotesTotal,
      requiredVotes: membership.requiredVotes,
      unlocked: Boolean(membership.rewardProgramUnlockedAt),
      unlockedAt: membership.rewardProgramUnlockedAt,
    },
    welcome: {
      needsSelection: membership.needsWelcomeSelection,
      welcomeOfferId: membership.welcomeOfferId,
      selectedAt: membership.welcomeOfferSelectedAt,
      welcomeOffer,
      choices: welcomeOfferChoices,
    },
    balances: {
      validatingCents: balances.validatingCents,
      availableCents: balances.availableCents,
      paidCents: balances.paidCents,
    },
    policy: {
      creatorShareBps: REWARDS_CREATOR_SHARE_BPS,
      minPayoutCents: REWARDS_MIN_PAYOUT_CENTS,
      holdDays: REWARDS_HOLD_DAYS,
    },
  });
}
