import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { userHasEmailPasswordIdentity } from '@/lib/auth/authIdentities';
export type EquipoPasswordAction = 'recovery_email' | 'generate_temporary';

export async function loadAuthUserForEquipoPassword(
  supabase: SupabaseClient,
  userId: string,
): Promise<
  | { ok: true; email: string; hasEmailPassword: boolean }
  | { ok: false; code: 'not_found' | 'no_email' }
> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data.user) return { ok: false, code: 'not_found' };
  const email = data.user.email?.trim() ?? '';
  if (!email) return { ok: false, code: 'no_email' };
  return {
    ok: true,
    email,
    hasEmailPassword: userHasEmailPasswordIdentity(data.user),
  };
}

function siteOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  return 'https://www.aventaofertas.com';
}

export async function sendEquipoPasswordRecoveryEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const redirectTo = `${siteOrigin()}/auth/reset-password`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function setTemporaryEquipoPassword(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ ok: true; temporaryPassword: string } | { ok: false; message: string }> {
  if (typeof supabase.auth.admin?.updateUserById !== 'function') {
    return { ok: false, message: 'auth admin unavailable' };
  }

  const temporaryPassword = `${randomBytes(9).toString('base64url')}Aa1!`;

  // Keep the SDK method bound to its owning admin API object. Extracting this
  // method and invoking it unbound can break its internal fetch/config access.
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    password: temporaryPassword,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true, temporaryPassword };
}
