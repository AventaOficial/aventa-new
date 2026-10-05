import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Formato: avk_<prefix>_<secret>
 *   prefix: 12 hex (6 bytes aleatorios), se guarda en claro para buscar la fila.
 *   secret: 32 bytes aleatorios en base64url (43 chars).
 * En base sólo viven el prefijo y el SHA-256 hex del token completo.
 */
const TOKEN_RE = /^avk_([0-9a-f]{12})_([A-Za-z0-9_-]{43})$/;

export type GeneratedMachineToken = {
  token: string;
  prefix: string;
  hash: string;
};

export function hashMachineToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function generateMachineToken(): GeneratedMachineToken {
  const prefix = randomBytes(6).toString('hex');
  const secret = randomBytes(32).toString('base64url');
  const token = `avk_${prefix}_${secret}`;
  return { token, prefix, hash: hashMachineToken(token) };
}

export function parseMachineToken(raw: string | null | undefined): { token: string; prefix: string } | null {
  if (typeof raw !== 'string') return null;
  const token = raw.trim();
  if (token.length > 80) return null;
  const m = TOKEN_RE.exec(token);
  if (!m) return null;
  return { token, prefix: m[1] };
}

/** Extrae el token de `Authorization: Bearer <token>`. Cualquier otra forma es inválida. */
export function machineTokenFromAuthorization(header: string | null | undefined): { token: string; prefix: string } | null {
  if (typeof header !== 'string') return null;
  const m = /^Bearer[ ]+(\S+)$/i.exec(header.trim());
  if (!m) return null;
  return parseMachineToken(m[1]);
}

export function machineTokenHashMatches(token: string, storedHash: string | null | undefined): boolean {
  if (typeof storedHash !== 'string' || !/^[0-9a-f]{64}$/.test(storedHash)) return false;
  const a = Buffer.from(hashMachineToken(token), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
