import type { TeamMembership } from '../roles/membership';
import { leadRole } from '../roles/catalog';
import { TEAM_IDS, type TeamId } from '../roles/teams';
import { permissionsFor } from '../permissions/grants';
import { EXCLUDED_TEAM_ACTIONS } from '../permissions/registry';

/**
 * El rol global `owner` de `user_roles` se proyecta a los roles de equipo
 * que ya existen. No crea una membresía, no lee el email y no abre payouts.
 */
function ownerLeadMembership(userId: string, teamId: TeamId): TeamMembership {
  switch (teamId) {
    case 'moderation':
      return { userId, teamId, role: leadRole(teamId), status: 'ACTIVE' };
    case 'hunter':
      return { userId, teamId, role: leadRole(teamId), status: 'ACTIVE' };
    case 'growth':
      return { userId, teamId, role: leadRole(teamId), status: 'ACTIVE' };
    case 'product':
      return { userId, teamId, role: leadRole(teamId), status: 'ACTIVE' };
    case 'community':
      return { userId, teamId, role: leadRole(teamId), status: 'ACTIVE' };
    case 'operations':
      return { userId, teamId, role: leadRole(teamId), status: 'ACTIVE' };
    case 'finance':
      return { userId, teamId, role: leadRole(teamId), status: 'ACTIVE' };
    default: {
      const unreachable: never = teamId;
      return unreachable;
    }
  }
}

export function platformOwnerMemberships(userId: string): TeamMembership[] {
  return TEAM_IDS.map((teamId) => ownerLeadMembership(userId, teamId));
}

export function mergePlatformOwnerMemberships(
  userId: string,
  memberships: readonly TeamMembership[],
): TeamMembership[] {
  const covered = new Set(platformOwnerMemberships(userId).map((item) => item.teamId));
  const extras = memberships.filter((item) => !covered.has(item.teamId));
  return [...platformOwnerMemberships(userId), ...extras];
}

/** Los permisos del owner de plataforma son los de esos roles. Nada de payout ni XP. */
export function platformOwnerPermissions(userId: string): string[] {
  return platformOwnerMemberships(userId).flatMap((membership) => [
    ...permissionsFor(membership.teamId, membership.role),
  ]);
}

export function platformOwnerGrantsExcludedAction(userId: string): boolean {
  const granted = new Set(platformOwnerPermissions(userId));
  return EXCLUDED_TEAM_ACTIONS.some((action) => granted.has(action));
}
