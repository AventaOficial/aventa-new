import type { TeamId } from '../roles/teams';
import type { AuthorizedTeamXpGrant } from './policy';

export type StoredTeamXpGrant = AuthorizedTeamXpGrant & {
  createdAt: string;
};

export type TeamXpState = {
  grants: readonly StoredTeamXpGrant[];
  balances: Readonly<Record<string, number>>;
};

export const EMPTY_TEAM_XP_STATE: TeamXpState = { grants: [], balances: {} };

function balanceKey(userId: string, teamId: TeamId): string {
  return `${userId}:${teamId}`;
}

function sameGrant(left: StoredTeamXpGrant, right: AuthorizedTeamXpGrant): boolean {
  return (
    left.actorUserId === right.actorUserId &&
    left.recipientUserId === right.recipientUserId &&
    left.teamId === right.teamId &&
    left.amount === right.amount &&
    left.source === right.source &&
    left.idempotencyKey === right.idempotencyKey &&
    left.kind === right.kind &&
    left.compensatesKey === right.compensatesKey
  );
}

/**
 * Aplica ledger y acumulado juntos.
 * Si el movimiento no cabe, devuelve el estado anterior sin cambios.
 * La base hace la misma operación dentro de `team_ops.grant_team_xp`.
 */
export function commitTeamXpGrant(
  state: TeamXpState,
  grant: AuthorizedTeamXpGrant,
  createdAt = '1970-01-01T00:00:00.000Z',
):
  | { ok: true; state: TeamXpState; applied: boolean; balance: number }
  | { ok: false; reason: 'idempotency_conflict' | 'balance_underflow'; state: TeamXpState } {
  const existing = state.grants.find((item) => item.idempotencyKey === grant.idempotencyKey);
  const key = balanceKey(grant.recipientUserId, grant.teamId);
  const current = state.balances[key] ?? 0;

  if (existing) {
    if (!sameGrant(existing, grant)) {
      return { ok: false, reason: 'idempotency_conflict', state };
    }
    return { ok: true, state, applied: false, balance: current };
  }

  const next = current + grant.amount;
  if (next < 0) return { ok: false, reason: 'balance_underflow', state };

  return {
    ok: true,
    applied: true,
    balance: next,
    state: {
      grants: [...state.grants, { ...grant, createdAt }],
      balances: { ...state.balances, [key]: next },
    },
  };
}

export function teamXpBalance(state: TeamXpState, userId: string, teamId: TeamId): number {
  return state.balances[balanceKey(userId, teamId)] ?? 0;
}
