import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getRewardsMembership } from '@/lib/rewards/eligibility';
import {
  maybeUnlockRewardsProgram,
  getEligibleWelcomeOffers,
} from '@/lib/rewards/unlock';
import { getUserRewardBalances } from '@/lib/rewards/rewardsEngine';
import { isRewardsProgramActive } from '@/lib/rewards/programStatus';
import {
  evaluateQualityGates,
  getHunterQualitySignals,
  isEligibleForRewardUnlock,
} from '@/lib/rewards/qualitySignals';
import {
  REWARDS_MIN_PAYOUT_CENTS,
  REWARDS_CREATOR_SHARE_BPS,
  REWARDS_HOLD_DAYS,
  REWARDS_TERMS_VERSION,
} from '@/lib/rewards/config';
import { enforceRateLimitCustom } from '@/lib/server/rateLimit';

/** GET: estado del Programa de Recompensas para el usuario autenticado. */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const rl = await enforceRateLimitCustom(`rewards-status:${token.slice(0, 16)}`, 'reports');
  if (!rl.success) {
    return NextResponse.json({ error: 'Demasiados intentos' }, { status: 429 });
  }

  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  await maybeUnlockRewardsProgram(supabase, user.id, user.id);
  const membership = await getRewardsMembership(supabase, user.id);
  const balances = await getUserRewardBalances(supabase, user.id);

  const signals = await getHunterQualitySignals(supabase, user.id);
  const quality = evaluateQualityGates(signals);
  const eligibility = isEligibleForRewardUnlock(membership, quality);

  let welcomeOfferChoices: Awaited<ReturnType<typeof getEligibleWelcomeOffers>> = [];
  if (membership.needsWelcomeSelection) {
    welcomeOfferChoices = await getEligibleWelcomeOffers(supabase, user.id);
  }

  let welcomeOffer: {
    id: string;
    title: string;
    image_url: string | null;
    store: string | null;
    selectedAt: string | null;
  } | null = null;

  if (membership.welcomeOfferId) {
    const { data: wo } = await supabase
      .from('offers')
      .select('id, title, image_url, store')
      .eq('id', membership.welcomeOfferId)
      .maybeSingle();
    if (wo) {
      const row = wo as {
        id: string;
        title: string;
        image_url?: string | null;
        store?: string | null;
      };
      welcomeOffer = {
        id: row.id,
        title: row.title,
        image_url: row.image_url ?? null,
        store: row.store ?? null,
        selectedAt: membership.welcomeOfferSelectedAt,
      };
    }
  }

  return NextResponse.json({
    programName: 'Recompensa sorpresa del Cazador',
    programActive: isRewardsProgramActive(),
    surpriseMode: true,
    claimPhase: membership.claimPhase,
    encouragement: eligibility.userMessage,
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
    terms: {
      version: REWARDS_TERMS_VERSION,
      acceptedAt: membership.rewardsTermsAcceptedAt,
      acceptedVersion: membership.rewardsTermsVersion,
      current: membership.termsCurrent,
      needsAcceptance: membership.needsTermsAcceptance,
      href: '/terms#comisiones',
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
