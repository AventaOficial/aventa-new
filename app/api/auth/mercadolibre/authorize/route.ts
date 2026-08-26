import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createPkcePair } from '@/lib/integrations/mercadolibre/pkce';
import {
  buildAuthorizeUrl,
  getMlOAuthConfig,
  getMlOAuthConfigError,
  isMlOAuthEnabled,
  sanitizeMlOAuthLogMessage,
} from '@/lib/integrations/mercadolibre/oauth';
import { createOAuthState } from '@/lib/integrations/mercadolibre/state';
import { setMlOAuthTransientCookies } from '@/lib/integrations/mercadolibre/oauthCookies';
import { requireOwnerSession } from '@/lib/server/requireOwnerSession';

export const dynamic = 'force-dynamic';

function errorRedirect(origin: string, reason: string): NextResponse {
  const url = new URL('/admin/owner', origin);
  url.searchParams.set('ml_oauth', 'error');
  url.searchParams.set('reason', reason);
  const response = NextResponse.redirect(url.toString());
  return response;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;

  if (!isMlOAuthEnabled()) {
    console.warn('[ml-oauth] authorize blocked: integration disabled');
    return errorRedirect(origin, 'disabled');
  }

  const configError = getMlOAuthConfigError();
  if (configError) {
    console.error('[ml-oauth] authorize blocked:', configError);
    return errorRedirect(origin, 'config');
  }

  const config = getMlOAuthConfig();
  if (!config) {
    return errorRedirect(origin, 'config');
  }

  const cookieStore = await cookies();
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
    const { state, nonce } = createOAuthState('/admin/owner');
    const { codeVerifier, codeChallenge } = createPkcePair();
    const authorizeUrl = buildAuthorizeUrl({
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      state,
      codeChallenge,
    });

    const response = NextResponse.redirect(authorizeUrl);
    setMlOAuthTransientCookies(response, { nonce, codeVerifier });
    return response;
  } catch (error) {
    console.error('[ml-oauth] authorize failed', sanitizeMlOAuthLogMessage(error));
    return errorRedirect(origin, 'start_failed');
  }
}
