import type { MembershipStatus } from '../../roles/membership';
import type { TeamId } from '../../roles/teams';

/**
 * Modelo puro de `team_leaderboard` / `team_leaderboard_position`.
 * Solo grants automáticos, solo el equipo pedido, solo membresías ACTIVE.
 * El XP de comunidad no es una entrada de este modelo.
 */
export type RankGrant = {
  userId: string;
  teamId: TeamId;
  amount: number;
  origin: 'rule' | 'mission' | 'achievement' | 'manual';
  day: string;
};

export type RankMember = { userId: string; teamId: TeamId; status: MembershipStatus };

export type RankedRow = { position: number; userId: string; xp: number };

function totalsFor(
  teamId: TeamId,
  grants: readonly RankGrant[],
  members: readonly RankMember[],
  fromDay: string | null,
  toDay: string,
): Map<string, number> {
  const active = new Set(
    members.filter((member) => member.teamId === teamId && member.status === 'ACTIVE').map((member) => member.userId),
  );
  const totals = new Map<string, number>();
  for (const grant of grants) {
    if (grant.teamId !== teamId || grant.origin === 'manual' || !active.has(grant.userId)) continue;
    if (grant.day > toDay || (fromDay !== null && grant.day < fromDay)) continue;
    totals.set(grant.userId, (totals.get(grant.userId) ?? 0) + grant.amount);
  }
  for (const [userId, xp] of totals) if (xp <= 0) totals.delete(userId);
  return totals;
}

/** rank() de SQL: empates comparten posición; desempate estable por user id. */
export function rankTeam(
  teamId: TeamId,
  grants: readonly RankGrant[],
  members: readonly RankMember[],
  window: { fromDay: string | null; toDay: string },
  limit: number,
): RankedRow[] {
  const sorted = [...totalsFor(teamId, grants, members, window.fromDay, window.toDay)].sort(
    (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
  );
  const rows: RankedRow[] = [];
  for (let index = 0; index < sorted.length && rows.length < limit; index += 1) {
    const [userId, xp] = sorted[index];
    const position = index > 0 && sorted[index - 1][1] === xp ? rows[index - 1].position : index + 1;
    rows.push({ position, userId, xp });
  }
  return rows;
}

export function positionInTeam(
  teamId: TeamId,
  userId: string,
  grants: readonly RankGrant[],
  members: readonly RankMember[],
  window: { fromDay: string | null; toDay: string },
): { position: number | null; xp: number; rankedMembers: number } | null {
  const isActive = members.some((m) => m.userId === userId && m.teamId === teamId && m.status === 'ACTIVE');
  if (!isActive) return null;
  const totals = totalsFor(teamId, grants, members, window.fromDay, window.toDay);
  const xp = totals.get(userId) ?? 0;
  let above = 0;
  for (const value of totals.values()) if (value > xp) above += 1;
  return { position: xp > 0 ? above + 1 : null, xp, rankedMembers: totals.size };
}
