/**
 * Auth para /api/me/* — P1-3.
 * Escrituras: ban check fail-closed.
 * Lecturas: auth requerida; ban no bloquea GET (salvo options).
 * request-account-deletion: permitir aunque esté baneado.
 */
import type { User } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { lookupUserBan } from '@/lib/server/isUserBanned';

export type MeAuthSuccess = { user: User; supabase: SupabaseClient };
export type MeAuthFailure = {
  error: string;
  status: 401 | 403;
  code?: 'user_banned' | 'ban_check_unavailable';
};

export type MeAuthOptions = {
  /**
   * true = mutación (POST/PATCH/PUT/DELETE) → ban fail-closed.
   * false = lectura → no exige ban clear (UX / logout / ver estado).
   */
  mutate?: boolean;
  /** Excepción: permitir mutación aunque baneado (p.ej. borrar cuenta). */
  allowBanned?: boolean;
};

export async function requireBearerMeUser(
  request: Request,
  options: MeAuthOptions = {},
): Promise<MeAuthSuccess | MeAuthFailure> {
  const mutate = options.mutate === true;
  const allowBanned = options.allowBanned === true;

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) {
    return { error: 'No autorizado', status: 401 };
  }

  const supabase = createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user?.id) {
    return { error: 'No autorizado', status: 401 };
  }

  if (mutate && !allowBanned) {
    const ban = await lookupUserBan(supabase, user.id);
    if (!ban.ok) {
      return {
        error: 'No se pudo verificar el estado de la cuenta. Intenta más tarde.',
        status: 403,
        code: 'ban_check_unavailable',
      };
    }
    if (ban.banned) {
      return {
        error: 'Tu cuenta está restringida.',
        status: 403,
        code: 'user_banned',
      };
    }
  }

  return { user, supabase };
}

export function meAuthFailureResponse(failure: MeAuthFailure): NextResponse {
  return NextResponse.json(
    { error: failure.error, code: failure.code },
    { status: failure.status },
  );
}
