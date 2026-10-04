import { canAccessTeam } from '../authz/authorize';
import type { TeamMembership } from '../roles/membership';
import { isTeamId, type TeamId } from '../roles/teams';

export type HeroAccess =
  | { ok: true; teamId: TeamId; membership: TeamMembership }
  | { ok: false; reason: 'invalid_team' | 'denied' };

/**
 * El equipo de la URL solo abre el Hero si hay una membresía ACTIVE.
 * SUSPENDED, REMOVED y equipos ajenos quedan fuera.
 */
export function heroAccess(requestedTeam: string, memberships: readonly TeamMembership[]): HeroAccess {
  if (!isTeamId(requestedTeam)) return { ok: false, reason: 'invalid_team' };
  if (!canAccessTeam({ memberships }, requestedTeam)) return { ok: false, reason: 'denied' };
  const membership = memberships.find((item) => item.teamId === requestedTeam && item.status === 'ACTIVE');
  if (!membership) return { ok: false, reason: 'denied' };
  return { ok: true, teamId: requestedTeam, membership };
}
