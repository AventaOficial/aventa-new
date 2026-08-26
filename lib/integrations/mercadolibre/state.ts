import { randomBytes } from 'crypto';

const STATE_MAX_AGE_MS = 10 * 60 * 1000;

/** Rutas internas permitidas tras OAuth (returnTo en state, no en redirect_uri). */
export const ML_OAUTH_RETURN_TO_WHITELIST = ['/admin/owner'] as const;

export type MlOAuthReturnTo = (typeof ML_OAUTH_RETURN_TO_WHITELIST)[number];

export type MlOAuthStatePayload = {
  nonce: string;
  returnTo: MlOAuthReturnTo;
  iat: number;
};

function base64UrlEncodeJson(payload: MlOAuthStatePayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function base64UrlDecodeJson(raw: string): MlOAuthStatePayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as MlOAuthStatePayload;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.nonce !== 'string' || !parsed.nonce.trim()) return null;
    if (typeof parsed.returnTo !== 'string') return null;
    if (typeof parsed.iat !== 'number' || !Number.isFinite(parsed.iat)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isAllowedReturnTo(value: string): value is MlOAuthReturnTo {
  return (ML_OAUTH_RETURN_TO_WHITELIST as readonly string[]).includes(value);
}

export function createOAuthState(returnTo: MlOAuthReturnTo = '/admin/owner'): {
  state: string;
  nonce: string;
} {
  const nonce = randomBytes(32).toString('base64url');
  const payload: MlOAuthStatePayload = {
    nonce,
    returnTo,
    iat: Date.now(),
  };
  return { state: base64UrlEncodeJson(payload), nonce };
}

export function parseOAuthState(stateParam: string | null | undefined): MlOAuthStatePayload | null {
  if (!stateParam || !stateParam.trim()) return null;
  const payload = base64UrlDecodeJson(stateParam.trim());
  if (!payload) return null;
  if (!isAllowedReturnTo(payload.returnTo)) return null;
  return payload;
}

export function isOAuthStateExpired(
  payload: MlOAuthStatePayload,
  nowMs: number = Date.now(),
): boolean {
  return nowMs - payload.iat > STATE_MAX_AGE_MS;
}

export function validateOAuthState(params: {
  stateParam: string | null | undefined;
  cookieNonce: string | null | undefined;
  nowMs?: number;
}): { ok: true; payload: MlOAuthStatePayload } | { ok: false; reason: string } {
  const payload = parseOAuthState(params.stateParam);
  if (!payload) return { ok: false, reason: 'invalid_state' };

  if (isOAuthStateExpired(payload, params.nowMs)) {
    return { ok: false, reason: 'state_expired' };
  }

  const cookieNonce = params.cookieNonce?.trim() ?? '';
  if (!cookieNonce || cookieNonce !== payload.nonce) {
    return { ok: false, reason: 'state_mismatch' };
  }

  return { ok: true, payload };
}
