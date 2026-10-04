import { resolveSafeOAuthNext } from '@/lib/auth/safeOAuthNext';
import { canAccessTeam } from '../authz/authorize';
import { isTeamRole } from '../roles/catalog';
import { isTeamId, TEAM_IDS, type TeamId } from '../roles/teams';
import type { TeamMembership } from '../roles/membership';
import type { GateCheck } from './token';

const FALLBACK_NEXT = '/team/select';
const ATTEMPT_LIMIT = 8;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

type AttemptBucket = { count: number; resetAt: number };
const attempts = new Map<string, AttemptBucket>();

export type TeamEntryKind = 'login' | 'gate' | 'no-access' | 'select' | 'allow' | 'forbidden';

export function decideTeamEntry(input: {
  hasSession: boolean;
  gateValid: boolean;
  activeTeamIds: readonly TeamId[];
  requestedTeam: string | null;
}): TeamEntryKind {
  if (!input.hasSession) return 'login';
  if (!input.gateValid) return 'gate';
  if (input.requestedTeam === null) {
    return input.activeTeamIds.length === 0 ? 'no-access' : 'select';
  }
  if (!isTeamId(input.requestedTeam)) return 'forbidden';
  if (!input.activeTeamIds.includes(input.requestedTeam)) return 'forbidden';
  return 'allow';
}

/**
 * El destino del gate solo puede ser una ruta interna de Team OS.
 * Reutiliza `resolveSafeOAuthNext` y luego rechaza todo lo que no sea /team.
 */
export function resolveTeamNext(next: string | null | undefined): string {
  const safe = resolveSafeOAuthNext(next);
  if (safe.includes('..') || /%2e|%2f|%5c/i.test(safe)) return FALLBACK_NEXT;
  const path = safe.split('?')[0] ?? safe;
  if (path === '/team' || path === '/team/select') return path;
  const match = /^\/team\/([a-z]+)\/?$/.exec(path);
  const teamId = match?.[1];
  if (!teamId || !isTeamId(teamId)) return FALLBACK_NEXT;
  return path;
}

export function visibleActiveTeamIds(memberships: readonly TeamMembership[]): TeamId[] {
  return TEAM_IDS.filter((teamId) => canAccessTeam({ memberships }, teamId));
}

function activeMembership(userId: string, teamId: TeamId, role: string): TeamMembership | null {
  switch (teamId) {
    case 'moderation':
      return isTeamRole('moderation', role) ? { userId, teamId, role, status: 'ACTIVE' } : null;
    case 'hunter':
      return isTeamRole('hunter', role) ? { userId, teamId, role, status: 'ACTIVE' } : null;
    case 'finance':
      return isTeamRole('finance', role) ? { userId, teamId, role, status: 'ACTIVE' } : null;
    case 'growth':
      return isTeamRole('growth', role) ? { userId, teamId, role, status: 'ACTIVE' } : null;
    case 'product':
      return isTeamRole('product', role) ? { userId, teamId, role, status: 'ACTIVE' } : null;
    case 'community':
      return isTeamRole('community', role) ? { userId, teamId, role, status: 'ACTIVE' } : null;
    case 'operations':
      return isTeamRole('operations', role) ? { userId, teamId, role, status: 'ACTIVE' } : null;
    default: {
      const exhaustive: never = teamId;
      return exhaustive;
    }
  }
}

export function membershipFromRow(
  userId: string,
  row: { teamId: string; role: string; status: string },
): TeamMembership | null {
  if (row.status !== 'ACTIVE') return null;
  if (!isTeamId(row.teamId)) return null;
  return activeMembership(userId, row.teamId, row.role);
}

export function interpretGate(input: {
  actor: { userId: string; sessionId: string } | null;
  verification: GateCheck | { ok: false; reason: 'missing' };
}): 'ok' | 'unauthenticated' | 'gate_required' {
  if (!input.actor) return 'unauthenticated';
  if (!input.verification.ok) return 'gate_required';
  return 'ok';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function readGateCredentials(
  body: unknown,
): { ok: true; password: string; email: string | null; next: string } | { ok: false } {
  if (!isRecord(body)) return { ok: false };
  const password = body.password;
  if (typeof password !== 'string' || password.length === 0 || password.length > 200) {
    return { ok: false };
  }
  let email: string | null = null;
  if (body.email !== undefined && body.email !== null) {
    if (typeof body.email !== 'string') return { ok: false };
    const trimmed = body.email.trim().toLowerCase();
    if (trimmed.length === 0 || trimmed.length > 320 || !trimmed.includes('@') || trimmed.includes(' ')) {
      return { ok: false };
    }
    email = trimmed;
  }
  const next = typeof body.next === 'string' ? resolveTeamNext(body.next) : FALLBACK_NEXT;
  return { ok: true, password, email, next };
}

export function gateAttemptKey(input: { userId: string | null; email: string | null }): string {
  if (input.userId) return `user:${input.userId}`;
  if (input.email) return `email:${input.email.trim().toLowerCase()}`;
  return 'anonymous';
}

export function consumeGateAttempt(key: string, nowMs: number): boolean {
  const bucket = attempts.get(key);
  if (!bucket || nowMs >= bucket.resetAt) {
    attempts.set(key, { count: 1, resetAt: nowMs + ATTEMPT_WINDOW_MS });
    return true;
  }
  if (bucket.count >= ATTEMPT_LIMIT) return false;
  bucket.count += 1;
  return true;
}

export function resetGateAttempts(): void {
  attempts.clear();
}

export function readRequestedTeam(value: string | null): TeamId | null {
  if (!value || !isTeamId(value)) return null;
  return value;
}
