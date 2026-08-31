import type { SupabaseClient } from '@supabase/supabase-js';

export type OfferRewardsParticipationInput = {
  offerId: string;
  creatorId: string;
  offerStatus: string;
  offerCreatedAt: string;
  rewardProgramUnlockedAt: string | null;
  welcomeOfferId: string | null;
};

/**
 * Determina si una oferta participa en Rewards sin flag manual del cliente.
 * - Oferta de Bienvenida: sí
 * - Otras de las primeras 15 (pre-unlock): no
 * - Creadas después de reward_program_unlocked_at: sí
 */
export function isOfferRewardsParticipating(input: OfferRewardsParticipationInput): boolean {
  if (input.offerStatus !== 'approved' && input.offerStatus !== 'published') {
    return false;
  }
  if (!input.rewardProgramUnlockedAt) {
    return false;
  }
  if (input.welcomeOfferId && input.offerId === input.welcomeOfferId) {
    return true;
  }
  const unlockedMs = Date.parse(input.rewardProgramUnlockedAt);
  const createdMs = Date.parse(input.offerCreatedAt);
  if (!Number.isFinite(unlockedMs) || !Number.isFinite(createdMs)) {
    return false;
  }
  return createdMs >= unlockedMs;
}

export async function loadOfferParticipationContext(
  supabase: SupabaseClient,
  offerId: string,
): Promise<OfferRewardsParticipationInput | null> {
  const { data: offer, error } = await supabase
    .from('offers')
    .select('id, created_by, status, created_at')
    .eq('id', offerId)
    .maybeSingle();

  if (error || !offer) return null;

  const row = offer as {
    id: string;
    created_by?: string;
    status?: string;
    created_at?: string;
  };
  if (!row.created_by) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('reward_program_unlocked_at, welcome_offer_id')
    .eq('id', row.created_by)
    .maybeSingle();

  const prof = profile as {
    reward_program_unlocked_at?: string | null;
    welcome_offer_id?: string | null;
  } | null;

  return {
    offerId: row.id,
    creatorId: row.created_by,
    offerStatus: row.status ?? '',
    offerCreatedAt: row.created_at ?? '',
    rewardProgramUnlockedAt: prof?.reward_program_unlocked_at ?? null,
    welcomeOfferId: prof?.welcome_offer_id ?? null,
  };
}

export async function isOfferParticipatingInRewards(
  supabase: SupabaseClient,
  offerId: string,
): Promise<boolean> {
  const ctx = await loadOfferParticipationContext(supabase, offerId);
  if (!ctx) return false;
  return isOfferRewardsParticipating(ctx);
}
