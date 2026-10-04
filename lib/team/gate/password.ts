import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase/server';
import { createServerAuthClient } from '@/lib/supabase/server-auth';
import { logTeamGate } from './log';
import type { TeamActor } from './session';
import { sessionIdFromAccessToken } from './token';

/**
 * Comprueba la contraseña en un cliente que no escribe cookies del navegador
 * y revoca solo esa sesión de verificación.
 */
export async function verifyPasswordForUser(
  email: string,
  password: string,
  expectedUserId: string,
): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return false;

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  const accessToken = data.session?.access_token;
  const userId = !error && data.user?.id ? data.user.id : null;
  if (accessToken) {
    try {
      const admin = createServerClient();
      const revoked = await admin.auth.admin.signOut(accessToken, 'local');
      if (revoked.error) logTeamGate('verify_signout_failed', expectedUserId);
    } catch {
      logTeamGate('verify_signout_failed', expectedUserId);
    }
  }
  return userId === expectedUserId;
}

/** Inicia la sesión del navegador. Solo se usa cuando todavía no hay sesión. */
export async function signInWithCookieClient(email: string, password: string): Promise<TeamActor | null> {
  const cookieStore = await cookies();
  const supabase = createServerAuthClient({
    getAll: async () => cookieStore.getAll(),
    set: (name, value, options) => {
      cookieStore.set(name, value, options as Record<string, unknown>);
    },
    delete: (name) => {
      cookieStore.delete(name);
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  const session = data.session;
  if (error || !data.user || !session) return null;
  if (session.user.id !== data.user.id) return null;
  const sessionId = sessionIdFromAccessToken(session.access_token);
  if (!sessionId) return null;
  return {
    userId: data.user.id,
    sessionId,
    email: data.user.email ?? email,
  };
}
