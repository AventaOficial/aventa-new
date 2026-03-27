import type { SupabaseClient } from '@supabase/supabase-js';
import {
  COMMISSION_MIN_UPVOTES_PER_OFFER,
  COMMISSION_REQUIRED_OFFERS,
  COMMISSION_TERMS_VERSION,
} from '@/lib/commissions/constants';

export type CommissionEligibility = {
  qualifyingCount: number;
  requiredOffers: number;
  voteThreshold: number;
  eligible: boolean;
  termsVersion: string;
  acceptedAt: string | null;
  termsAcceptedVersion: string | null;
};

/** Cuenta ofertas aprobadas/publicadas del usuario con votos positivos >= umbral. */
export async function countQualifyingCommissionOffers(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ qualifyingCount: number; eligible: boolean }> {
  const { data: rows, error } = await supabase
    .from('offers')
    .select('id, upvotes_count, status')
    .eq('created_by', userId)
    .in('status', ['approved', 'published']);

  if (error) {
    console.error('[commissionEligibility]', error.message);
    return { qualifyingCount: 0, eligible: false };
  }

  const qualifying = (rows ?? []).filter(
    (o: { upvotes_count?: number | null }) => (o.upvotes_count ?? 0) >= COMMISSION_MIN_UPVOTES_PER_OFFER,
  );

  return {
    qualifyingCount: qualifying.length,
    eligible: qualifying.length >= COMMISSION_REQUIRED_OFFERS,
  };
}

export async function getCommissionAcceptanceFields(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ acceptedAt: string | null; termsAcceptedVersion: string | null }> {
  const { data, error } = await supabase
    .from('profiles')
    .select('commissions_accepted_at, commissions_terms_version')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) {
    return { acceptedAt: null, termsAcceptedVersion: null };
  }

  const p = data as {
    commissions_accepted_at?: string | null;
    commissions_terms_version?: string | null;
  };
  return {
    acceptedAt: p.commissions_accepted_at ?? null,
    termsAcceptedVersion: p.commissions_terms_version ?? null,
  };
}

export async function getCommissionEligibility(
  supabase: SupabaseClient,
  userId: string,
): Promise<CommissionEligibility> {
  const { qualifyingCount, eligible } = await countQualifyingCommissionOffers(supabase, userId);
  const { acceptedAt, termsAcceptedVersion } = await getCommissionAcceptanceFields(supabase, userId);

  return {
    qualifyingCount,
    requiredOffers: COMMISSION_REQUIRED_OFFERS,
    voteThreshold: COMMISSION_MIN_UPVOTES_PER_OFFER,
    eligible,
    termsVersion: COMMISSION_TERMS_VERSION,
    acceptedAt,
    termsAcceptedVersion,
  };
}
