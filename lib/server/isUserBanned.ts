/**
 * P1-3 — Ban lookup with explicit reliability.
 * Fail-closed for sensitive actions: unreliable lookup ⇒ deny.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type BanLookupResult =
  | { ok: true; banned: boolean }
  | { ok: false; reason: 'query_error' | 'exception' };

/** Consulta autoritativa de ban activo (permanente o no expirado). */
export async function lookupUserBan(
  supabase: SupabaseClient,
  userId: string,
): Promise<BanLookupResult> {
  try {
    const { data: ban, error } = await supabase
      .from('user_bans')
      .select('id')
      .eq('user_id', userId)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .maybeSingle();

    if (error) {
      console.error('[ban] lookup error', error.message);
      return { ok: false, reason: 'query_error' };
    }
    return { ok: true, banned: Boolean(ban) };
  } catch (e) {
    console.error('[ban] lookup exception', e);
    return { ok: false, reason: 'exception' };
  }
}

/**
 * True si hay ban activo.
 * P1-3: error de infra → true (fail-closed). Usar lookupUserBan si necesitas distinguir.
 */
export async function isUserBanned(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const result = await lookupUserBan(supabase, userId);
  if (!result.ok) return true;
  return result.banned;
}
