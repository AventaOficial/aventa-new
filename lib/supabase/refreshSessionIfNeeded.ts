import type { Session, SupabaseClient } from '@supabase/supabase-js';

/** Renovar access_token si caduca en menos de este margen (segundos). */
const EXPIRY_SKEW_SEC = 120;

/**
 * Evita 401 en rutas API (Bearer) cuando el access_token del estado React ya expiró
 * pero el refresh_token sigue siendo válido.
 */
export async function refreshSessionIfNeeded(
  supabase: SupabaseClient,
  session: Session | null
): Promise<Session | null> {
  if (!session?.refresh_token) return session;
  const exp = session.expires_at;
  if (exp == null) return session;
  const now = Date.now() / 1000;
  if (exp > now + EXPIRY_SKEW_SEC) return session;

  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session) {
    console.warn('[auth] refreshSession:', error?.message ?? 'sin sesión');
    return session;
  }
  return data.session;
}
