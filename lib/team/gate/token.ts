import { createHmac, timingSafeEqual } from 'node:crypto';

export const TEAM_GATE_COOKIE = 'av_team_gate';
export const TEAM_GATE_TTL_SECONDS = 15 * 60;

export type GatePayload = {
  userId: string;
  sessionId: string;
  expiresAt: number;
};

export type GateCheck =
  | { ok: true; userId: string; sessionId: string; expiresAt: number }
  | {
      ok: false;
      reason:
        | 'missing'
        | 'malformed'
        | 'bad_signature'
        | 'expired'
        | 'user_mismatch'
        | 'session_mismatch'
        | 'unconfigured';
    };

type CookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function gateSecret(): string | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || key.length < 16) return null;
  return createHmac('sha256', key).update('aventa-team-gate-v1').digest('base64url');
}

function signBody(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

function signaturesMatch(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length) return false;
  return timingSafeEqual(actualBytes, expectedBytes);
}

function readPayload(body: string): GatePayload | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!isRecord(parsed)) return null;
    const { u, s, e } = parsed;
    if (typeof u !== 'string' || u.length === 0) return null;
    if (typeof s !== 'string' || s.length === 0) return null;
    if (typeof e !== 'number' || !Number.isFinite(e)) return null;
    return { userId: u, sessionId: s, expiresAt: e };
  } catch {
    return null;
  }
}

/**
 * Lee `session_id` de un access token que `getUser()` ya validó.
 * No verifica la firma: no usar este valor si la sesión no está confirmada.
 */
export function sessionIdFromAccessToken(token: string): string | null {
  const parts = token.split('.');
  const body = parts[1];
  if (!body) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!isRecord(parsed)) return null;
    const sessionId = parsed.session_id;
    return typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : null;
  } catch {
    return null;
  }
}

export function signTeamGate(input: {
  userId: string;
  sessionId: string;
  nowMs?: number;
  ttlSeconds?: number;
}): string | null {
  const secret = gateSecret();
  if (!secret) return null;
  if (input.userId.length === 0 || input.sessionId.length === 0) return null;
  const now = input.nowMs ?? Date.now();
  const ttl = input.ttlSeconds ?? TEAM_GATE_TTL_SECONDS;
  const payload = { u: input.userId, s: input.sessionId, e: now + ttl * 1000 };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${signBody(body, secret)}`;
}

export function verifyTeamGate(
  token: string | null | undefined,
  expected: { userId: string; sessionId: string; nowMs?: number },
): GateCheck {
  if (!token) return { ok: false, reason: 'missing' };
  const secret = gateSecret();
  if (!secret) return { ok: false, reason: 'unconfigured' };
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'malformed' };
  const body = parts[0];
  const mac = parts[1];
  if (!body || !mac || !signaturesMatch(mac, signBody(body, secret))) {
    return { ok: false, reason: 'bad_signature' };
  }
  const payload = readPayload(body);
  if (!payload) return { ok: false, reason: 'malformed' };
  const now = expected.nowMs ?? Date.now();
  if (now >= payload.expiresAt) return { ok: false, reason: 'expired' };
  if (payload.userId !== expected.userId) return { ok: false, reason: 'user_mismatch' };
  if (payload.sessionId !== expected.sessionId) return { ok: false, reason: 'session_mismatch' };
  return { ok: true, userId: payload.userId, sessionId: payload.sessionId, expiresAt: payload.expiresAt };
}

export function teamGateCookieOptions(maxAgeSeconds: number, secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
  };
}
