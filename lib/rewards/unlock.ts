import type { SupabaseClient } from '@supabase/supabase-js';
import { REWARDS_REQUIRED_APPROVED_OFFERS, REWARDS_TERMS_VERSION } from '@/lib/rewards/config';
import { getRewardsProgress } from '@/lib/rewards/eligibility';
import { writeRewardAuditLog } from '@/lib/rewards/audit';
import {
  evaluateQualityGates,
  getHunterQualitySignals,
  isEligibleForRewardUnlock,
} from '@/lib/rewards/qualitySignals';

function isMissingRewardsColumn(error: { message?: string; code?: string } | null): boolean {
  const msg = (error?.message ?? '').toLowerCase();
  return (
    error?.code === 'PGRST204' ||
    msg.includes('reward_program_unlocked_at') ||
    msg.includes('schema cache')
  );
}

/**
 * Desbloquea automáticamente si cumple progreso V1 + gates de calidad opcionales.
 * Idempotente: no sobrescribe unlocked_at existente.
 */
export async function maybeUnlockRewardsProgram(
  supabase: SupabaseClient,
  userId: string,
  actorId?: string | null,
): Promise<{ unlocked: boolean; unlockedAt: string | null; blockedReason?: string | null }> {
  const { data: profile, error: readErr } = await supabase
    .from('profiles')
    .select('reward_program_unlocked_at')
    .eq('id', userId)
    .maybeSingle();

  if (readErr) {
    if (isMissingRewardsColumn(readErr)) {
      return { unlocked: false, unlockedAt: null };
    }
    console.error('[rewards/unlock] read profile', readErr.message);
    return { unlocked: false, unlockedAt: null };
  }

  const existing = (profile as { reward_program_unlocked_at?: string | null } | null)
    ?.reward_program_unlocked_at;
  if (existing) {
    return { unlocked: true, unlockedAt: existing };
  }

  const progress = await getRewardsProgress(supabase, userId);
  const signals = await getHunterQualitySignals(supabase, userId);
  const quality = evaluateQualityGates(signals);
  const eligibility = isEligibleForRewardUnlock(progress, quality);

  if (!eligibility.eligible) {
    return {
      unlocked: false,
      unlockedAt: null,
      blockedReason: eligibility.reasonCode,
    };
  }

  const unlockedAt = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from('profiles')
    .update({ reward_program_unlocked_at: unlockedAt })
    .eq('id', userId)
    .is('reward_program_unlocked_at', null);

  if (updateErr) {
    if (isMissingRewardsColumn(updateErr)) {
      return { unlocked: false, unlockedAt: null };
    }
    console.error('[rewards/unlock] update profile', updateErr.message);
    return { unlocked: false, unlockedAt: null };
  }

  await writeRewardAuditLog(supabase, {
    eventType: 'reward_program_unlocked',
    actorId: actorId ?? userId,
    entityType: 'profile',
    entityId: userId,
    previousState: null,
    newState: 'unlocked',
    metadata: {
      approvedOffersCount: progress.approvedOffersCount,
      positiveVotesTotal: progress.positiveVotesTotal,
      qualitySignals: {
        approvalRate: signals.approvalRate,
        distinctPositiveVoters: signals.distinctPositiveVoters,
        accountAgeDays: signals.accountAgeDays,
        rejectedCount: signals.rejectedCount,
      },
    },
  });

  return { unlocked: true, unlockedAt };
}

/** IDs de las primeras N ofertas aprobadas/publicadas del usuario (por created_at). */
export async function getFirstApprovedOfferIds(
  supabase: SupabaseClient,
  userId: string,
  limit: number = REWARDS_REQUIRED_APPROVED_OFFERS,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('offers')
    .select('id')
    .eq('created_by', userId)
    .in('status', ['approved', 'published'])
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[rewards/welcome] list first offers', error.message);
    return [];
  }

  return (data ?? []).map((r: { id: string }) => r.id);
}

export type EligibleWelcomeOffer = {
  id: string;
  title: string;
  created_at: string;
  image_url: string | null;
  store: string | null;
  price: number | null;
  original_price: number | null;
  upvotes_count: number;
  status: string;
  expires_at: string | null;
  views: number;
  eligible: true;
  dealStatus: 'approved' | 'expired';
};

/** Ofertas elegibles para Oferta de Bienvenida (mismas reglas que selectWelcomeOffer). */
export async function getEligibleWelcomeOffers(
  supabase: SupabaseClient,
  userId: string,
): Promise<EligibleWelcomeOffer[]> {
  const ids = await getFirstApprovedOfferIds(supabase, userId);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('offers')
    .select(
      'id, title, created_at, image_url, store, price, original_price, upvotes_count, status, expires_at',
    )
    .in('id', ids)
    .eq('created_by', userId)
    .in('status', ['approved', 'published'])
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[rewards/welcome] eligible details', error.message);
    return [];
  }

  const rows = (data ?? []) as Array<{
    id: string;
    title: string;
    created_at: string;
    image_url?: string | null;
    store?: string | null;
    price?: number | null;
    original_price?: number | null;
    upvotes_count?: number | null;
    status?: string | null;
    expires_at?: string | null;
  }>;

  const now = Date.now();
  const viewsById: Record<string, number> = {};
  await Promise.all(
    rows.map(async (row) => {
      const { count } = await supabase
        .from('offer_events')
        .select('id', { count: 'exact', head: true })
        .eq('offer_id', row.id)
        .eq('event_type', 'view');
      viewsById[row.id] = count ?? 0;
    }),
  );

  // Preservar orden de elegibilidad (primeras N por created_at)
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((row) => {
      const expired =
        Boolean(row.expires_at) && new Date(row.expires_at as string).getTime() < now;
      return {
        id: row.id,
        title: row.title,
        created_at: row.created_at,
        image_url: row.image_url ?? null,
        store: row.store ?? null,
        price: row.price ?? null,
        original_price: row.original_price ?? null,
        upvotes_count: Math.max(0, Number(row.upvotes_count ?? 0)),
        status: row.status ?? 'approved',
        expires_at: row.expires_at ?? null,
        views: viewsById[row.id] ?? 0,
        eligible: true as const,
        dealStatus: (expired ? 'expired' : 'approved') as 'approved' | 'expired',
      };
    });
}

export type WelcomeSelectionResult =
  | { ok: true; welcomeOfferId: string; selectedAt: string; termsVersion: string }
  | { ok: false; error: string; status: number };

export type AcceptRewardsTermsResult =
  | { ok: true; acceptedAt: string; termsVersion: string; alreadyAccepted: boolean }
  | { ok: false; error: string; status: number };

/**
 * Aceptación expresa de términos del Programa de Recompensas (sección 8).
 * No otorga welcome offer ni recompensa monetaria — solo registra consentimiento.
 * Idempotente para la versión vigente.
 */
export async function acceptRewardsProgramTerms(
  supabase: SupabaseClient,
  userId: string,
): Promise<AcceptRewardsTermsResult> {
  const membership = await supabase
    .from('profiles')
    .select(
      'reward_program_unlocked_at, rewards_terms_accepted_at, rewards_terms_version, welcome_offer_id',
    )
    .eq('id', userId)
    .maybeSingle();

  if (membership.error || !membership.data) {
    return { ok: false, error: 'Perfil no encontrado', status: 404 };
  }

  const prof = membership.data as {
    reward_program_unlocked_at?: string | null;
    rewards_terms_accepted_at?: string | null;
    rewards_terms_version?: string | null;
    welcome_offer_id?: string | null;
  };

  if (!prof.reward_program_unlocked_at) {
    return {
      ok: false,
      error: 'Aún no has desbloqueado la recompensa sorpresa',
      status: 403,
    };
  }

  if (
    prof.rewards_terms_accepted_at &&
    prof.rewards_terms_version === REWARDS_TERMS_VERSION
  ) {
    return {
      ok: true,
      acceptedAt: prof.rewards_terms_accepted_at,
      termsVersion: REWARDS_TERMS_VERSION,
      alreadyAccepted: true,
    };
  }

  const acceptedAt = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from('profiles')
    .update({
      rewards_terms_accepted_at: acceptedAt,
      rewards_terms_version: REWARDS_TERMS_VERSION,
    })
    .eq('id', userId);

  if (updateErr) {
    const msg = (updateErr.message ?? '').toLowerCase();
    if (msg.includes('rewards_terms') || updateErr.code === 'PGRST204') {
      return {
        ok: false,
        error:
          'Falta aplicar la migración SQL de aceptación de términos (20260904_rewards_terms_accept.sql).',
        status: 503,
      };
    }
    console.error('[rewards/terms] update', updateErr.message);
    return { ok: false, error: 'No se pudo registrar la aceptación', status: 500 };
  }

  await writeRewardAuditLog(supabase, {
    eventType: 'rewards_terms_accepted',
    actorId: userId,
    entityType: 'profile',
    entityId: userId,
    previousState: prof.rewards_terms_version ?? null,
    newState: REWARDS_TERMS_VERSION,
    metadata: {
      rewards_terms_version: REWARDS_TERMS_VERSION,
      rewards_terms_accepted_at: acceptedAt,
      welcome_offer_id: prof.welcome_offer_id ?? null,
    },
  });

  return {
    ok: true,
    acceptedAt,
    termsVersion: REWARDS_TERMS_VERSION,
    alreadyAccepted: false,
  };
}

export type SelectWelcomeOfferOptions = {
  /**
   * Debe ser true solo si aún no hay términos (legacy).
   * Preferible: aceptar términos antes vía acceptRewardsProgramTerms.
   */
  acceptTerms?: boolean;
};

/** Selecciona Oferta de Bienvenida (inmutable). Requiere términos vigentes ya aceptados. */
export async function selectWelcomeOffer(
  supabase: SupabaseClient,
  userId: string,
  offerId: string,
  options: SelectWelcomeOfferOptions = {},
): Promise<WelcomeSelectionResult> {
  const membership = await supabase
    .from('profiles')
    .select(
      'reward_program_unlocked_at, welcome_offer_id, rewards_terms_accepted_at, rewards_terms_version',
    )
    .eq('id', userId)
    .maybeSingle();

  if (membership.error || !membership.data) {
    return { ok: false, error: 'Perfil no encontrado', status: 404 };
  }

  const prof = membership.data as {
    reward_program_unlocked_at?: string | null;
    welcome_offer_id?: string | null;
    rewards_terms_accepted_at?: string | null;
    rewards_terms_version?: string | null;
  };

  if (!prof.reward_program_unlocked_at) {
    return { ok: false, error: 'Aún no has desbloqueado el Programa de Recompensas', status: 403 };
  }
  if (prof.welcome_offer_id) {
    return { ok: false, error: 'Ya elegiste tu Oferta de Bienvenida', status: 409 };
  }

  const termsCurrent =
    Boolean(prof.rewards_terms_accepted_at) &&
    prof.rewards_terms_version === REWARDS_TERMS_VERSION;

  if (!termsCurrent) {
    if (options.acceptTerms === true) {
      const termsResult = await acceptRewardsProgramTerms(supabase, userId);
      if (!termsResult.ok) {
        return { ok: false, error: termsResult.error, status: termsResult.status };
      }
    } else {
      return {
        ok: false,
        error: 'Debes aceptar los Términos del Programa de Recompensas antes de elegir oferta',
        status: 403,
      };
    }
  }

  const { data: offer, error: offerErr } = await supabase
    .from('offers')
    .select('id, created_by, status')
    .eq('id', offerId)
    .maybeSingle();

  if (offerErr || !offer) {
    return { ok: false, error: 'Oferta no encontrada', status: 404 };
  }

  const row = offer as { id: string; created_by?: string; status?: string };
  if (row.created_by !== userId) {
    return { ok: false, error: 'No puedes elegir una oferta ajena', status: 403 };
  }
  if (row.status !== 'approved' && row.status !== 'published') {
    return { ok: false, error: 'La oferta debe estar aprobada', status: 400 };
  }

  const eligibleIds = await getFirstApprovedOfferIds(supabase, userId);
  if (!eligibleIds.includes(offerId)) {
    return {
      ok: false,
      error: `Solo puedes elegir una de tus primeras ${REWARDS_REQUIRED_APPROVED_OFFERS} ofertas aprobadas`,
      status: 400,
    };
  }

  const selectedAt = new Date().toISOString();
  const { data: updated, error: updateErr } = await supabase
    .from('profiles')
    .update({
      welcome_offer_id: offerId,
      welcome_offer_selected_at: selectedAt,
    })
    .eq('id', userId)
    .is('welcome_offer_id', null)
    .select('welcome_offer_id, welcome_offer_selected_at')
    .maybeSingle();

  if (updateErr) {
    console.error('[rewards/welcome] update', updateErr.message);
    return { ok: false, error: 'No se pudo guardar la selección', status: 500 };
  }

  if (!updated || (updated as { welcome_offer_id?: string }).welcome_offer_id !== offerId) {
    return { ok: false, error: 'Ya elegiste tu Oferta de Bienvenida', status: 409 };
  }

  await writeRewardAuditLog(supabase, {
    eventType: 'welcome_offer_selected',
    actorId: userId,
    entityType: 'profile',
    entityId: userId,
    previousState: null,
    newState: offerId,
    metadata: {
      welcome_offer_id: offerId,
      rewards_terms_version: REWARDS_TERMS_VERSION,
    },
  });

  return {
    ok: true,
    welcomeOfferId: offerId,
    selectedAt,
    termsVersion: REWARDS_TERMS_VERSION,
  };
}
