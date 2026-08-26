import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  exchangeCodeForTokens,
  getMlOAuthConfig,
  getMlOAuthConfigError,
  isMlOAuthEnabled,
  sanitizeMlOAuthLogMessage,
  validateOAuthCallback,
} from '@/lib/integrations/mercadolibre/oauth';
import {
  ML_OAUTH_PKCE_COOKIE,
  ML_OAUTH_STATE_COOKIE,
  clearMlOAuthTransientCookies,
} from '@/lib/integrations/mercadolibre/oauthCookies';
import { upsertMercadoLibreTokens } from '@/lib/integrations/mercadolibre/tokenStore';
import { requireOwnerSession } from '@/lib/server/requireOwnerSession';

export const dynamic = 'force-dynamic';

function errorRedirect(origin: string, reason: string): NextResponse {
  const url = new URL('/admin/owner', origin);
  url.searchParams.set('ml_oauth', 'error');
  url.searchParams.set('reason', reason);
  const response = NextResponse.redirect(url.toString());
  clearMlOAuthTransientCookies(response);
  return response;
}

function successRedirect(origin: string): NextResponse {
  const url = new URL('/admin/owner', origin);
  url.searchParams.set('ml_oauth', 'connected');
  const response = NextResponse.redirect(url.toString());
  clearMlOAuthTransientCookies(response);
  return response;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;

  if (!isMlOAuthEnabled()) {
    console.warn('[ml-oauth] callback blocked: integration disabled');
    return errorRedirect(origin, 'disabled');
  }

  const configError = getMlOAuthConfigError();
  if (configError) {
    console.error('[ml-oauth] callback blocked:', configError);
    return errorRedirect(origin, 'config');
  }

  const config = getMlOAuthConfig();
  if (!config) {
    return errorRedirect(origin, 'config');
  }

  const cookieStore = await cookies();
  const cookieNonce = cookieStore.get(ML_OAUTH_STATE_COOKIE)?.value;
  const codeVerifier = cookieStore.get(ML_OAUTH_PKCE_COOKIE)?.value;

  const validation = validateOAuthCallback({
    code: requestUrl.searchParams.get('code'),
    state: requestUrl.searchParams.get('state'),
    cookieNonce,
    codeVerifier,
  });

  if (!validation.ok) {
    console.warn('[ml-oauth] callback validation failed:', validation.reason);
    return errorRedirect(origin, validation.reason);
  }

  // Requiere sesión owner activa (misma ventana OAuth).
  const auth = await requireOwnerSession(request, {
    getAll: async () => cookieStore.getAll(),
    set: (name, value, options) => {
      cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2]);
    },
    delete: (name) => {
      cookieStore.delete(name);
    },
  });

  if ('error' in auth) {
    const reason = auth.status === 403 ? 'forbidden' : 'unauthorized';
    return errorRedirect(origin, reason);
  }

  try {
    const tokenResponse = await exchangeCodeForTokens({
      config,
      code: validation.code,
      codeVerifier: validation.codeVerifier,
    });

    await upsertMercadoLibreTokens({
      tokenResponse,
      connectedByUserId: auth.user.id,
    });

    return successRedirect(origin);
  } catch (error) {
    console.error('[ml-oauth] callback exchange/store failed', sanitizeMlOAuthLogMessage(error));
    return errorRedirect(origin, 'exchange_failed');
  }
}
