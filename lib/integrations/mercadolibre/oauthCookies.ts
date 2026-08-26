import type { NextResponse } from 'next/server';

export const ML_OAUTH_STATE_COOKIE = 'ml_oauth_state';
export const ML_OAUTH_PKCE_COOKIE = 'ml_oauth_pkce';

const COOKIE_MAX_AGE_SECONDS = 600;
const COOKIE_PATH = '/api/auth/mercadolibre';

type CookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  maxAge: number;
  path: string;
};

function oauthCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE_SECONDS,
    path: COOKIE_PATH,
  };
}

export function setMlOAuthTransientCookies(
  response: NextResponse,
  params: { nonce: string; codeVerifier: string },
): void {
  const opts = oauthCookieOptions();
  response.cookies.set(ML_OAUTH_STATE_COOKIE, params.nonce, opts);
  response.cookies.set(ML_OAUTH_PKCE_COOKIE, params.codeVerifier, opts);
}

export function clearMlOAuthTransientCookies(response: NextResponse): void {
  const opts = { ...oauthCookieOptions(), maxAge: 0 };
  response.cookies.set(ML_OAUTH_STATE_COOKIE, '', opts);
  response.cookies.set(ML_OAUTH_PKCE_COOKIE, '', opts);
}
