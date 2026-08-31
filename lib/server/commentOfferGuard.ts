import type { SupabaseClient } from '@supabase/supabase-js';
import { isPubliclyVotableOfferStatus } from '@/lib/votes/offerVoteEligibility';

export type CommentableOffer = {
  id: string;
  status: string;
};

/** Oferta existe y está publicada (approved/published) — apta para comentarios. */
export async function getCommentableOffer(
  supabase: SupabaseClient,
  offerId: string,
): Promise<CommentableOffer | null> {
  const { data, error } = await supabase
    .from('offers')
    .select('id, status')
    .eq('id', offerId)
    .maybeSingle();

  if (error || !data) return null;
  const status = (data as { status?: string }).status ?? '';
  if (!isPubliclyVotableOfferStatus(status)) return null;
  return { id: (data as { id: string }).id, status };
}

/**
 * Valida parent_id: debe existir, pertenecer a la misma oferta y estar aprobado.
 */
export async function validateCommentParent(
  supabase: SupabaseClient,
  offerId: string,
  parentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('comments')
    .select('id, offer_id, status')
    .eq('id', parentId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: 'El comentario al que respondes no existe.' };
  }

  const row = data as { offer_id?: string; status?: string };
  if (row.offer_id !== offerId) {
    return { ok: false, error: 'La respuesta no pertenece a esta oferta.' };
  }

  if (row.status && row.status !== 'approved') {
    return { ok: false, error: 'No puedes responder a un comentario en revisión.' };
  }

  return { ok: true };
}
