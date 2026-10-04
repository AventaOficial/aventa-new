import { isTeamId, type TeamId } from '../roles/teams';
import { isTeamRole } from '../roles/catalog';
import { isMembershipStatus, type MembershipStatus } from '../roles/membership';
import { isValidUuid } from '@/lib/server/validateUuid';

export const AUDIT_ACTIONS = [
  'TEAM_MEMBER_ADDED',
  'TEAM_ROLE_CHANGED',
  'TEAM_MEMBERSHIP_SUSPENDED',
  'TEAM_MEMBERSHIP_REACTIVATED',
  'TEAM_MEMBER_REMOVED',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditState = Record<string, string> | null;

export type AuditDraft = {
  action: AuditAction;
  actorId: string;
  targetUserId: string;
  teamId: TeamId;
  previousState: AuditState;
  newState: AuditState;
  reason: string | null;
  requestId: string;
};

export type TransitionCode =
  | 'self_assignment'
  | 'invalid_actor'
  | 'invalid_target'
  | 'invalid_membership'
  | 'unknown_team'
  | 'invalid_role'
  | 'invalid_status'
  | 'invalid_transition'
  | 'removed_membership'
  | 'reason_required'
  | 'reason_invalid'
  | 'live_membership_exists';

export type TransitionFailure = { ok: false; code: TransitionCode };

const REASON_MAX = 500;

const STATUS_EDGES: Record<MembershipStatus, readonly MembershipStatus[]> = {
  ACTIVE: ['SUSPENDED', 'REMOVED'],
  SUSPENDED: ['ACTIVE', 'REMOVED'],
  REMOVED: [],
};

export function assertNotSelf(actorId: string, targetUserId: string): TransitionFailure | null {
  if (actorId === targetUserId) return { ok: false, code: 'self_assignment' };
  return null;
}

export function normalizeReason(
  value: unknown,
  required: boolean,
): { ok: true; reason: string | null } | TransitionFailure {
  if (value === undefined || value === null) {
    return required ? { ok: false, code: 'reason_required' } : { ok: true, reason: null };
  }
  if (typeof value !== 'string') return { ok: false, code: 'reason_invalid' };
  const reason = value.trim();
  if (!reason) {
    return required ? { ok: false, code: 'reason_required' } : { ok: true, reason: null };
  }
  if (reason.length > REASON_MAX) return { ok: false, code: 'reason_invalid' };
  return { ok: true, reason };
}

export function canTransition(from: MembershipStatus, to: MembershipStatus): boolean {
  if (from === to) return true;
  return STATUS_EDGES[from].includes(to);
}

export function statusAuditAction(to: MembershipStatus): AuditAction | null {
  if (to === 'SUSPENDED') return 'TEAM_MEMBERSHIP_SUSPENDED';
  if (to === 'ACTIVE') return 'TEAM_MEMBERSHIP_REACTIVATED';
  if (to === 'REMOVED') return 'TEAM_MEMBER_REMOVED';
  return null;
}

type ActorContext = {
  actorId: string;
  requestId: string;
};

function actorContext(ctx: ActorContext): TransitionFailure | null {
  if (!isValidUuid(ctx.actorId) || !isValidUuid(ctx.requestId)) {
    return { ok: false, code: 'invalid_actor' };
  }
  return null;
}

export type LiveMembership = {
  role: string;
  status: 'ACTIVE' | 'SUSPENDED';
};

export function commitAssign(
  live: LiveMembership | null,
  input: {
    actorId: string;
    targetUserId: string;
    teamId: string;
    role: string;
    reason: string | null;
    requestId: string;
  },
): { ok: true; idempotent: boolean; audit: AuditDraft | null } | TransitionFailure {
  const actor = actorContext(input);
  if (actor) return actor;
  const self = assertNotSelf(input.actorId, input.targetUserId);
  if (self) return self;
  if (!isValidUuid(input.targetUserId)) return { ok: false, code: 'invalid_target' };
  if (!isTeamId(input.teamId)) return { ok: false, code: 'unknown_team' };
  if (!isTeamRole(input.teamId, input.role)) return { ok: false, code: 'invalid_role' };
  if (live) {
    if (live.status === 'ACTIVE' && live.role === input.role) {
      return { ok: true, idempotent: true, audit: null };
    }
    return { ok: false, code: 'live_membership_exists' };
  }
  return {
    ok: true,
    idempotent: false,
    audit: {
      action: 'TEAM_MEMBER_ADDED',
      actorId: input.actorId,
      targetUserId: input.targetUserId,
      teamId: input.teamId,
      previousState: null,
      newState: { team_id: input.teamId, role: input.role, status: 'ACTIVE' },
      reason: input.reason,
      requestId: input.requestId,
    },
  };
}

export function commitRoleChange(
  current: { userId: string; teamId: TeamId; role: string; status: MembershipStatus },
  nextRole: string,
  reason: string | null,
  ctx: ActorContext,
): { ok: true; idempotent: boolean; audit: AuditDraft | null } | TransitionFailure {
  const actor = actorContext(ctx);
  if (actor) return actor;
  const self = assertNotSelf(ctx.actorId, current.userId);
  if (self) return self;
  if (current.status === 'REMOVED') return { ok: false, code: 'removed_membership' };
  if (!isTeamRole(current.teamId, nextRole)) return { ok: false, code: 'invalid_role' };
  if (current.role === nextRole) return { ok: true, idempotent: true, audit: null };
  return {
    ok: true,
    idempotent: false,
    audit: {
      action: 'TEAM_ROLE_CHANGED',
      actorId: ctx.actorId,
      targetUserId: current.userId,
      teamId: current.teamId,
      previousState: { role: current.role },
      newState: { role: nextRole },
      reason,
      requestId: ctx.requestId,
    },
  };
}

export function commitStatusChange(
  current: { userId: string; teamId: TeamId; role: string; status: MembershipStatus },
  nextStatus: string,
  reason: string | null,
  ctx: ActorContext,
): { ok: true; idempotent: boolean; audit: AuditDraft | null; status: MembershipStatus } | TransitionFailure {
  const actor = actorContext(ctx);
  if (actor) return actor;
  const self = assertNotSelf(ctx.actorId, current.userId);
  if (self) return self;
  if (!isMembershipStatus(nextStatus)) return { ok: false, code: 'invalid_status' };
  if (!canTransition(current.status, nextStatus)) return { ok: false, code: 'invalid_transition' };
  if (current.status === nextStatus) {
    return { ok: true, idempotent: true, audit: null, status: current.status };
  }
  const action = statusAuditAction(nextStatus);
  if (!action) return { ok: false, code: 'invalid_transition' };
  return {
    ok: true,
    idempotent: false,
    status: nextStatus,
    audit: {
      action,
      actorId: ctx.actorId,
      targetUserId: current.userId,
      teamId: current.teamId,
      previousState: { status: current.status },
      newState: { status: nextStatus },
      reason,
      requestId: ctx.requestId,
    },
  };
}
