import { isValidCodeVerifier } from '@/lib/integrations/mercadolibre/pkce';
import { validateOAuthState } from '@/lib/integrations/mercadolibre/state';

export const ML_OAUTH_AUTH_HOST = 'auth.mercadolibre.com.mx';
export const ML_OAUTH_TOKEN_URL = 'https://api.mercadolibre.com/oauth/token';
export const ML_OAUTH_PROVIDER = 'mercadolibre';

export type MlOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type MlOAuthTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  user_id?: number;
  refresh_token?: string;
};

export type MlOAuthCallbackValidation =
  | { ok: true; code: string; codeVerifier: string }
  | { ok: false; reason: string };

export function isMlOAuthEnabled(): boolean {
  const flag = process.env.ML_OAUTH_ENABLED?.trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

export function getMlOAuthConfig(): MlOAuthConfig | null {
  if (!isMlOAuthEnabled()) return null;

  const clientId = process.env.ML_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.ML_OAUTH_CLIENT_SECRET?.trim();
  const redirectUri = process.env.ML_OAUTH_REDIRECT_URI?.trim();

  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }

  return { clientId, clientSecret, redirectUri };
}

export function getMlOAuthConfigError(): string | null {
  if (!isMlOAuthEnabled()) return 'ML_OAUTH_DISABLED';
  const cfg = getMlOAuthConfig();
  if (cfg) return null;
  const missing: string[] = [];
  if (!process.env.ML_OAUTH_CLIENT_ID?.trim()) missing.push('ML_OAUTH_CLIENT_ID');
  if (!process.env.ML_OAUTH_CLIENT_SECRET?.trim()) missing.push('ML_OAUTH_CLIENT_SECRET');
  if (!process.env.ML_OAUTH_REDIRECT_URI?.trim()) missing.push('ML_OAUTH_REDIRECT_URI');
  return missing.length ? `ML_OAUTH_MISSING_${missing.join('_')}` : 'ML_OAUTH_MISCONFIGURED';
}

export function buildAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(`https://${ML_OAUTH_AUTH_HOST}/authorization`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('scope', 'read offline_access');
  return url.toString();
}

export function validateOAuthCallback(params: {
  code: string | null | undefined;
  state: string | null | undefined;
  cookieNonce: string | null | undefined;
  codeVerifier: string | null | undefined;
}): MlOAuthCallbackValidation {
  if (!params.code?.trim()) {
    return { ok: false, reason: 'missing_code' };
  }

  const stateResult = validateOAuthState({
    stateParam: params.state,
    cookieNonce: params.cookieNonce,
  });
  if (!stateResult.ok) {
    return { ok: false, reason: stateResult.reason };
  }

  const codeVerifier = params.codeVerifier?.trim() ?? '';
  if (!codeVerifier || !isValidCodeVerifier(codeVerifier)) {
    return { ok: false, reason: 'missing_code_verifier' };
  }

  return { ok: true, code: params.code.trim(), codeVerifier };
}

export async function exchangeCodeForTokens(params: {
  config: MlOAuthConfig;
  code: string;
  codeVerifier: string;
}): Promise<MlOAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: params.config.clientId,
    client_secret: params.config.clientSecret,
    code: params.code,
    redirect_uri: params.config.redirectUri,
    code_verifier: params.codeVerifier,
  });

  const res = await fetch(ML_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
    cache: 'no-store',
  });

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error('ML_OAUTH_TOKEN_PARSE_FAILED');
  }

  if (!res.ok) {
    const err = json as { error?: string; message?: string };
    const code = typeof err?.error === 'string' ? err.error : 'token_exchange_failed';
    console.error('[ml-oauth] token exchange failed', { status: res.status, error: code });
    throw new Error(`ML_OAUTH_TOKEN_EXCHANGE_${code.toUpperCase()}`);
  }

  const data = json as MlOAuthTokenResponse;
  if (!data.access_token?.trim()) {
    throw new Error('ML_OAUTH_TOKEN_MISSING_ACCESS');
  }
  if (!data.refresh_token?.trim()) {
    throw new Error('ML_OAUTH_TOKEN_MISSING_REFRESH');
  }
  if (typeof data.expires_in !== 'number' || !Number.isFinite(data.expires_in) || data.expires_in <= 0) {
    throw new Error('ML_OAUTH_TOKEN_INVALID_EXPIRES');
  }

  return data;
}

export async function refreshAccessToken(params: {
  config: MlOAuthConfig;
  refreshToken: string;
}): Promise<MlOAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: params.config.clientId,
    client_secret: params.config.clientSecret,
    refresh_token: params.refreshToken,
  });

  const res = await fetch(ML_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
    cache: 'no-store',
  });

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error('ML_OAUTH_REFRESH_PARSE_FAILED');
  }

  if (!res.ok) {
    const err = json as { error?: string };
    const code = typeof err?.error === 'string' ? err.error : 'refresh_failed';
    console.error('[ml-oauth] token refresh failed', { status: res.status, error: code });
    throw new Error(`ML_OAUTH_REFRESH_${code.toUpperCase()}`);
  }

  const data = json as MlOAuthTokenResponse;
  if (!data.access_token?.trim()) {
    throw new Error('ML_OAUTH_REFRESH_MISSING_ACCESS');
  }
  if (!data.refresh_token?.trim()) {
    throw new Error('ML_OAUTH_REFRESH_MISSING_REFRESH');
  }
  if (typeof data.expires_in !== 'number' || !Number.isFinite(data.expires_in) || data.expires_in <= 0) {
    throw new Error('ML_OAUTH_REFRESH_INVALID_EXPIRES');
  }

  return data;
}

/** Sanitiza errores ML para logs — nunca incluir tokens ni secrets. */
export function sanitizeMlOAuthLogMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 120);
  return 'unknown_error';
}
