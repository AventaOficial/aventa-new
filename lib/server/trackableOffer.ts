import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';

/**
 * Oferta visible en feed: approved/published y no expirada.
 * Evita inflar métricas con UUIDs arbitrarios.
 */
export async function isOfferTrackable(
  offerId: string,
  supabase?: SupabaseClient,
): Promise<boolean> {
  const client = supabase ?? createServerClient();
  const now = new Date().toISOString();
  const { data, error } = await client
    .from('offers')
    .select('id')
    .eq('id', offerId)
    .or('status.eq.approved,status.eq.published')
    .or(`expires_at.is.null,expires_at.gte.${now}`)
    .maybeSingle();

  if (error) {
    console.error('[trackableOffer]', error.message);
    return false;
  }
  return !!data;
}
