import { isTeamId, type TeamId } from '../roles/teams';
import { roleHasPermission } from '../permissions/grants';
import type { TeamPermission } from '../permissions/registry';
import type { MembershipStatus, TeamMembership } from '../roles/membership';

export const TEAM_XP_GRANT_MAX = 10_000;

const KEY_PATTERN = /^[A-Za-z0-9:._|-]{8,160}$/;
const SOURCE_PATTERN = /^[a-z0-9._:-]{3,64}$/;

export type TeamXpKind = 'grant' | 'compensation';

export type TeamXpDenyReason =
  | 'invalid_team'
  | 'invalid_amount'
  | 'invalid_source'
  | 'invalid_key'
  | 'self_grant'
  | 'actor_not_active'
  | 'recipient_not_active'
  | 'missing_permission'
  | 'wrong_team';

export type AuthorizedTeamXpGrant = {
  actorUserId: string;
  recipientUserId: string;
  teamId: TeamId;
  amount: number;
  source: string;
  idempotencyKey: string;
  kind: TeamXpKind;
  compensatesKey: string | null;
};

export function teamXpGrantPermission(teamId: TeamId): TeamPermission {
  const permission = `${teamId}.xp.grant`;
  return permission as TeamPermission;
}

/**
 * El cuerpo del cliente no entra en la decisión.
 * `client` existe solo para demostrar que se ignora.
 */
export function decideTeamXpGrant(input: {
  actorUserId: string;
  actorMemberships: readonly TeamMembership[];
  recipientUserId: string;
  recipientStatus: MembershipStatus | 'none';
  teamId: string;
  amount: number;
  source: string;
  idempotencyKey: string;
  kind: TeamXpKind;
  compensatesKey?: string | null;
  client?: {
    userId?: string;
    teamId?: string;
    amount?: number;
    source?: string;
  };
}): { ok: true; grant: AuthorizedTeamXpGrant } | { ok: false; reason: TeamXpDenyReason } {
  if (!isTeamId(input.teamId)) return { ok: false, reason: 'invalid_team' };
  const teamId = input.teamId;

  if (!KEY_PATTERN.test(input.idempotencyKey)) return { ok: false, reason: 'invalid_key' };
  if (!SOURCE_PATTERN.test(input.source)) return { ok: false, reason: 'invalid_source' };
  if (!Number.isInteger(input.amount) || input.amount === 0) return { ok: false, reason: 'invalid_amount' };
  if (Math.abs(input.amount) > TEAM_XP_GRANT_MAX) return { ok: false, reason: 'invalid_amount' };

  if (input.kind === 'compensation') {
    if (input.source !== 'compensation' || input.amount >= 0) return { ok: false, reason: 'invalid_amount' };
    if (!input.compensatesKey || !KEY_PATTERN.test(input.compensatesKey)) {
      return { ok: false, reason: 'invalid_key' };
    }
  } else if (input.amount < 0 || input.source === 'compensation') {
    return { ok: false, reason: 'invalid_amount' };
  }

  if (input.actorUserId === input.recipientUserId) return { ok: false, reason: 'self_grant' };

  const actor = input.actorMemberships.find(
    (membership) => membership.userId === input.actorUserId && membership.teamId === teamId,
  );
  if (!actor || actor.status !== 'ACTIVE') {
    const activeElsewhere = input.actorMemberships.some(
      (membership) => membership.userId === input.actorUserId && membership.status === 'ACTIVE',
    );
    return { ok: false, reason: activeElsewhere ? 'wrong_team' : 'actor_not_active' };
  }

  if (input.recipientStatus !== 'ACTIVE') return { ok: false, reason: 'recipient_not_active' };

  const permission = teamXpGrantPermission(teamId);
  if (!roleHasPermission(teamId, actor.role, permission)) {
    return { ok: false, reason: 'missing_permission' };
  }

  return {
    ok: true,
    grant: {
      actorUserId: input.actorUserId,
      recipientUserId: input.recipientUserId,
      teamId,
      amount: input.amount,
      source: input.source,
      idempotencyKey: input.idempotencyKey,
      kind: input.kind,
      compensatesKey: input.kind === 'compensation' ? (input.compensatesKey ?? null) : null,
    },
  };
}
