import type { SupabaseClient } from '@supabase/supabase-js';
import { REWARDS_REQUIRED_APPROVED_OFFERS } from '@/lib/rewards/config';
import { getRewardsProgress } from '@/lib/rewards/eligibility';
import { writeRewardAuditLog } from '@/lib/rewards/audit';

function isMissingRewardsColumn(error: { message?: string; code?: string } | null): boolean {
  const msg = (error?.message ?? '').toLowerCase();
  return (
    error?.code === 'PGRST204' ||
    msg.includes('reward_program_unlocked_at') ||
    msg.includes('schema cache')
  );
}

/**
 * Desbloquea automáticamente si cumple 15 ofertas + 15 votos acumulados.
 * Idempotente: no sobrescribe unlocked_at existente.
 */
export async function maybeUnlockRewardsProgram(
  supabase: SupabaseClient,
  userId: string,
  actorId?: string | null,
): Promise<{ unlocked: boolean; unlockedAt: string | null }> {
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
  if (!progress.unlockEligible) {
    return { unlocked: false, unlockedAt: null };
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

export type WelcomeSelectionResult =
  | { ok: true; welcomeOfferId: string; selectedAt: string }
  | { ok: false; error: string; status: number };

/** Selecciona Oferta de Bienvenida (inmutable tras fijar). */
export async function selectWelcomeOffer(
  supabase: SupabaseClient,
  userId: string,
  offerId: string,
): Promise<WelcomeSelectionResult> {
  const membership = await supabase
    .from('profiles')
    .select('reward_program_unlocked_at, welcome_offer_id')
    .eq('id', userId)
    .maybeSingle();

  if (membership.error || !membership.data) {
    return { ok: false, error: 'Perfil no encontrado', status: 404 };
  }

  const prof = membership.data as {
    reward_program_unlocked_at?: string | null;
    welcome_offer_id?: string | null;
  };

  if (!prof.reward_program_unlocked_at) {
    return { ok: false, error: 'Aún no has desbloqueado el Programa de Recompensas', status: 403 };
  }
  if (prof.welcome_offer_id) {
    return { ok: false, error: 'Ya elegiste tu Oferta de Bienvenida', status: 409 };
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
      error: 'Solo puedes elegir una de tus primeras 15 ofertas aprobadas',
      status: 400,
    };
  }

  const selectedAt = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from('profiles')
    .update({
      welcome_offer_id: offerId,
      welcome_offer_selected_at: selectedAt,
    })
    .eq('id', userId)
    .is('welcome_offer_id', null);

  if (updateErr) {
    console.error('[rewards/welcome] update', updateErr.message);
    return { ok: false, error: 'No se pudo guardar la selección', status: 500 };
  }

  await writeRewardAuditLog(supabase, {
    eventType: 'welcome_offer_selected',
    actorId: userId,
    entityType: 'profile',
    entityId: userId,
    previousState: null,
    newState: offerId,
    metadata: { welcome_offer_id: offerId },
  });

  return { ok: true, welcomeOfferId: offerId, selectedAt };
}
