import type { SupabaseClient } from '@supabase/supabase-js';
import { REPUTATION_LEVEL_AUTO_APPROVE_OFFERS } from '@/lib/server/reputation';

/** Vigencia de ofertas auto-aprobadas (reputación o lista owner). */
export const OFFER_AUTO_APPROVE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type OfferAutoApproveSource = 'owner_whitelist' | 'reputation';

export type OfferAutoApproveDecision = {
  approved: boolean;
  source?: OfferAutoApproveSource;
  expiresAt?: string;
};

export function getOfferAutoApproveExpiryIso(fromMs: number = Date.now()): string {
  return new Date(fromMs + OFFER_AUTO_APPROVE_TTL_MS).toISOString();
}

type ProfileAutoApproveRow = {
  reputation_level?: number | null;
  owner_auto_approve_offers?: boolean | null;
};

/** Reglas de negocio: owner whitelist OR reputación nivel ≥ 3. */
export function resolveOfferAutoApproveFromProfile(
  profile: ProfileAutoApproveRow | null | undefined,
): OfferAutoApproveDecision {
  if (profile?.owner_auto_approve_offers === true) {
    return {
      approved: true,
      source: 'owner_whitelist',
      expiresAt: getOfferAutoApproveExpiryIso(),
    };
  }

  const level = profile?.reputation_level ?? 1;
  if (level >= REPUTATION_LEVEL_AUTO_APPROVE_OFFERS) {
    return {
      approved: true,
      source: 'reputation',
      expiresAt: getOfferAutoApproveExpiryIso(),
    };
  }

  return { approved: false };
}

export async function resolveOfferAutoApproveForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<OfferAutoApproveDecision> {
  const { data, error } = await supabase
    .from('profiles')
    .select('reputation_level, owner_auto_approve_offers')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    return { approved: false };
  }

  return resolveOfferAutoApproveFromProfile(data as ProfileAutoApproveRow | null);
}
