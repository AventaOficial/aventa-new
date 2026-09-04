import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getRewardsMembership } from '@/lib/rewards/eligibility';
import { maybeUnlockRewardsProgram } from '@/lib/rewards/unlock';
import type { RewardStatus } from '@/lib/rewards/config';
import { enforceRateLimitCustom } from '@/lib/server/rateLimit';

type OfferSnippet = {
  id: string;
  title: string;
  image_url: string | null;
  store: string | null;
  price: number | null;
};

function mapCreatorStatus(status: string): {
  uiStatus: 'validating' | 'available' | 'delivered' | 'cancelled';
  label: string;
} {
  switch (status as RewardStatus) {
    case 'PAID':
      return { uiStatus: 'delivered', label: 'Entregada' };
    case 'CANCELLED':
    case 'REVERSED':
      return { uiStatus: 'cancelled', label: 'Cancelada' };
    case 'AVAILABLE':
      return { uiStatus: 'available', label: 'Lista' };
    case 'PENDING':
    case 'VALIDATING':
    default:
      return { uiStatus: 'validating', label: 'En validación' };
  }
}

/**
 * GET: historial de reconocimientos del cazador autenticado.
 * Incluye claim de bienvenida (profiles) + creator_rewards (ledger).
 * Solo el usuario de la sesión — nunca userId del cliente.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const rl = await enforceRateLimitCustom(`rewards-history:${token.slice(0, 16)}`, 'reports');
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

  let welcomeOffer: OfferSnippet | null = null;
  if (membership.welcomeOfferId) {
    const { data: wo } = await supabase
      .from('offers')
      .select('id, title, image_url, store, price')
      .eq('id', membership.welcomeOfferId)
      .eq('created_by', user.id)
      .maybeSingle();
    if (wo) {
      const row = wo as {
        id: string;
        title: string;
        image_url?: string | null;
        store?: string | null;
        price?: number | null;
      };
      welcomeOffer = {
        id: row.id,
        title: row.title,
        image_url: row.image_url ?? null,
        store: row.store ?? null,
        price: row.price ?? null,
      };
    }
  }

  const { data: rewardRows, error } = await supabase
    .from('creator_rewards')
    .select(
      'id, offer_id, network, status, hold_until, available_at, paid_at, created_at',
    )
    .eq('creator_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error && !(error.message ?? '').includes('creator_rewards')) {
    return NextResponse.json({ error: 'No se pudieron cargar recompensas' }, { status: 500 });
  }

  const rows = rewardRows ?? [];
  const offerIds = [
    ...new Set(
      rows
        .map((r: { offer_id?: string | null }) => r.offer_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];

  const offersById: Record<string, OfferSnippet> = {};
  if (offerIds.length > 0) {
    const { data: offers } = await supabase
      .from('offers')
      .select('id, title, image_url, store, price')
      .in('id', offerIds)
      .eq('created_by', user.id);
    for (const o of offers ?? []) {
      const row = o as {
        id: string;
        title: string;
        image_url?: string | null;
        store?: string | null;
        price?: number | null;
      };
      offersById[row.id] = {
        id: row.id,
        title: row.title,
        image_url: row.image_url ?? null,
        store: row.store ?? null,
        price: row.price ?? null,
      };
    }
  }

  const rewards = rows.map(
    (r: {
      id: string;
      offer_id?: string | null;
      network?: string;
      status: string;
      hold_until?: string | null;
      available_at?: string | null;
      paid_at?: string | null;
      created_at: string;
    }) => {
      const mapped = mapCreatorStatus(r.status);
      return {
        id: r.id,
        kind: 'commission' as const,
        status: r.status,
        uiStatus: mapped.uiStatus,
        statusLabel: mapped.label,
        network: r.network ?? null,
        createdAt: r.created_at,
        paidAt: r.paid_at ?? null,
        offer: r.offer_id ? offersById[r.offer_id] ?? null : null,
      };
    },
  );

  return NextResponse.json({
    welcome: {
      claimPhase: membership.claimPhase,
      displayNumber: 1,
      unlockedAt: membership.rewardProgramUnlockedAt,
      termsAcceptedAt: membership.rewardsTermsAcceptedAt,
      selectedAt: membership.welcomeOfferSelectedAt,
      offer: welcomeOffer,
      needsSelection: membership.needsWelcomeSelection,
    },
    rewards,
  });
}
