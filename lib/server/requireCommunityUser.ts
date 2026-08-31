import type { User } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { hasCurrentLegalConsent } from '@/lib/server/legalConsent';
import { isUserBanned } from '@/lib/server/isUserBanned';

export type CommunityUserOptions = {
  /** Requiere email confirmado (OAuth cuenta como verificado). Default: true */
  requireEmailVerified?: boolean;
  /** Requiere Términos + Privacidad vigentes. Default: true */
  requireLegalConsent?: boolean;
  /** Bloquea usuarios con ban activo. Default: true */
  requireNotBanned?: boolean;
};

export type CommunityAuthSuccess = {
  user: User;
  supabase: SupabaseClient;
};

export type CommunityAuthFailure = {
  error: string;
  status: 401 | 403;
  code?: 'email_not_verified' | 'legal_consent_required' | 'user_banned';
};

const DEFAULT_OPTIONS: Required<CommunityUserOptions> = {
  requireEmailVerified: true,
  requireLegalConsent: true,
  requireNotBanned: true,
};

export function isEmailVerifiedForCommunity(user: User): boolean {
  if (user.email_confirmed_at) return true;
  const identities = user.identities ?? [];
  return identities.some((i) => i.provider && i.provider !== 'email');
}

export async function requireBearerCommunityUser(
  request: Request,
  options: CommunityUserOptions = {},
): Promise<CommunityAuthSuccess | CommunityAuthFailure> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

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
    return { error: 'Sesión inválida', status: 401 };
  }

  if (opts.requireNotBanned) {
    const banned = await isUserBanned(supabase, user.id);
    if (banned) {
      return {
        error: 'Tu cuenta está restringida.',
        status: 403,
        code: 'user_banned',
      };
    }
  }

  if (opts.requireEmailVerified && !isEmailVerifiedForCommunity(user)) {
    return {
      error: 'Confirma tu correo electrónico para usar esta función.',
      status: 403,
      code: 'email_not_verified',
    };
  }

  if (opts.requireLegalConsent) {
    const consent = await hasCurrentLegalConsent(supabase, user.id);
    if (consent === false) {
      return {
        error:
          'Debes aceptar los Términos y la Política de Privacidad. Ve a Configuración o regístrate de nuevo.',
        status: 403,
        code: 'legal_consent_required',
      };
    }
  }

  return { user, supabase };
}

export function communityAuthFailureResponse(failure: CommunityAuthFailure): NextResponse {
  return NextResponse.json(
    { error: failure.error, code: failure.code },
    { status: failure.status },
  );
}
