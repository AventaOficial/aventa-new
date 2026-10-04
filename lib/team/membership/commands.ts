import { isTeamId } from '../roles/teams';
import { isTeamRole } from '../roles/catalog';
import { isMembershipStatus } from '../roles/membership';
import { isValidUuid } from '@/lib/server/validateUuid';
import { assertNotSelf, normalizeReason, type TransitionFailure } from './transitions';

export type CommandFailure = TransitionFailure;

function field(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries: [string, unknown][] = Object.entries(value);
  const found = entries.find(([entryKey]) => entryKey === key);
  return found?.[1];
}

export function readAssignCommand(
  body: unknown,
  actorId: string,
):
  | {
      ok: true;
      targetUserId: string;
      teamId: string;
      role: string;
      reason: string | null;
    }
  | CommandFailure {
  if (!isValidUuid(actorId)) return { ok: false, code: 'invalid_actor' };
  const targetUserId = field(body, 'userId');
  const teamId = field(body, 'teamId');
  const role = field(body, 'role');
  if (typeof targetUserId !== 'string' || !isValidUuid(targetUserId)) {
    return { ok: false, code: 'invalid_target' };
  }
  const self = assertNotSelf(actorId, targetUserId);
  if (self) return self;
  if (typeof teamId !== 'string' || !isTeamId(teamId)) return { ok: false, code: 'unknown_team' };
  if (typeof role !== 'string' || !isTeamRole(teamId, role)) return { ok: false, code: 'invalid_role' };
  const reason = normalizeReason(field(body, 'reason'), false);
  if (!reason.ok) return reason;
  return { ok: true, targetUserId, teamId, role, reason: reason.reason };
}

export function readRoleCommand(
  body: unknown,
  actorId: string,
  targetUserId: string,
  teamId: string,
): { ok: true; role: string; reason: string } | CommandFailure {
  if (!isValidUuid(actorId)) return { ok: false, code: 'invalid_actor' };
  const self = assertNotSelf(actorId, targetUserId);
  if (self) return self;
  if (!isTeamId(teamId)) return { ok: false, code: 'unknown_team' };
  const role = field(body, 'role');
  if (typeof role !== 'string' || !isTeamRole(teamId, role)) return { ok: false, code: 'invalid_role' };
  const reason = normalizeReason(field(body, 'reason'), true);
  if (!reason.ok) return reason;
  if (!reason.reason) return { ok: false, code: 'reason_required' };
  return { ok: true, role, reason: reason.reason };
}

export function readStatusCommand(
  body: unknown,
  actorId: string,
  targetUserId: string,
): { ok: true; status: 'ACTIVE' | 'SUSPENDED' | 'REMOVED'; reason: string | null } | CommandFailure {
  if (!isValidUuid(actorId)) return { ok: false, code: 'invalid_actor' };
  const self = assertNotSelf(actorId, targetUserId);
  if (self) return self;
  const status = field(body, 'status');
  if (typeof status !== 'string' || !isMembershipStatus(status)) {
    return { ok: false, code: 'invalid_status' };
  }
  const required = status === 'SUSPENDED' || status === 'REMOVED';
  const reason = normalizeReason(field(body, 'reason'), required);
  if (!reason.ok) return reason;
  return { ok: true, status, reason: reason.reason };
}
