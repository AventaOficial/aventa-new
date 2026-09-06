/**
 * P1-9 — Toggle favorito con estado confirmado y rollback correcto.
 * UNIQUE (user_id, offer_id) ya existe en Production.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export function isFavoriteUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '23505') return true;
  const msg = (error.message ?? '').toLowerCase();
  return msg.includes('duplicate key') || msg.includes('unique');
}

/**
 * Aplica el toggle. Devuelve el estado confirmado que la UI debe mostrar.
 * - add falla con unique → treat as success (ya favorito)
 * - cualquier otro error → rollback a `wasFavorite`
 */
export async function applyFavoriteToggle(input: {
  client: SupabaseClient;
  userId: string;
  offerId: string;
  wasFavorite: boolean;
}): Promise<{ ok: boolean; isFavorite: boolean }> {
  const { client, userId, offerId, wasFavorite } = input;
  if (wasFavorite) {
    const { error } = await client
      .from('offer_favorites')
      .delete()
      .eq('offer_id', offerId)
      .eq('user_id', userId);
    if (error) return { ok: false, isFavorite: wasFavorite };
    return { ok: true, isFavorite: false };
  }

  const { error } = await client.from('offer_favorites').insert({
    user_id: userId,
    offer_id: offerId,
  });
  if (!error) return { ok: true, isFavorite: true };
  if (isFavoriteUniqueViolation(error)) return { ok: true, isFavorite: true };
  return { ok: false, isFavorite: wasFavorite };
}
