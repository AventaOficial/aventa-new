import { meetsRoleRank } from '../roles/catalog';
import {
  membershipGrantsAccess,
  type TeamMembership,
} from '../roles/membership';
import type { TeamId } from '../roles/teams';
import { permissionTeam, type TeamPermission } from '../permissions/registry';
import { roleHasPermission } from '../permissions/grants';

/**
 * El sujeto lo arma el servidor a partir de la sesión y las membresías.
 * No hay campo de rol, equipo o permiso elegido por el cliente.
 * Esta fase no asigna, cambia ni suspende membresías.
 */
export type AuthzSubject = {
  memberships: readonly TeamMembership[];
};

export type AuthzDenyReason =
  | 'no_membership'
  | 'membership_inactive'
  | 'ambiguous_membership'
  | 'wrong_team'
  | 'missing_permission'
  | 'insufficient_role';

export type AuthzResult =
  | { allowed: true }
  | { allowed: false; reason: AuthzDenyReason };

/** Una membresía de equipo nunca abre `/admin`. */
export function membershipGrantsAdmin(): false {
  return false;
}

function liveMemberships(
  memberships: readonly TeamMembership[],
  teamId: TeamId,
): TeamMembership[] {
  return memberships.filter(
    (membership) =>
      membership.teamId === teamId &&
      (membership.status === 'ACTIVE' || membership.status === 'SUSPENDED'),
  );
}

function resolveMembership(
  memberships: readonly TeamMembership[],
  teamId: TeamId,
): AuthzResult | TeamMembership {
  const live = liveMemberships(memberships, teamId);
  if (live.length > 1) return { allowed: false, reason: 'ambiguous_membership' };
  if (live.length === 0) {
    const historical = memberships.some((membership) => membership.teamId === teamId);
    return {
      allowed: false,
      reason: historical ? 'membership_inactive' : 'no_membership',
    };
  }
  const membership = live[0];
  if (!membership || !membershipGrantsAccess(membership.status)) {
    return { allowed: false, reason: 'membership_inactive' };
  }
  return membership;
}

function isResolvedMembership(
  value: AuthzResult | TeamMembership,
): value is TeamMembership {
  return !('allowed' in value);
}

export function canAccessTeam(subject: AuthzSubject, teamId: TeamId): boolean {
  return isResolvedMembership(resolveMembership(subject.memberships, teamId));
}

export function activeTeamIds(subject: AuthzSubject, teamIds: readonly TeamId[]): TeamId[] {
  return teamIds.filter((teamId) => canAccessTeam(subject, teamId));
}

export function authorizeTeamPermission(
  subject: AuthzSubject,
  teamId: TeamId,
  permission: TeamPermission,
): AuthzResult {
  const resolved = resolveMembership(subject.memberships, teamId);
  if ('allowed' in resolved) return resolved;
  if (permissionTeam(permission) !== teamId) {
    return { allowed: false, reason: 'wrong_team' };
  }
  if (!roleHasPermission(resolved.teamId, resolved.role, permission)) {
    return { allowed: false, reason: 'missing_permission' };
  }
  return { allowed: true };
}

export function authorizeMinimumRole(
  subject: AuthzSubject,
  teamId: TeamId,
  minimumRole: string,
): AuthzResult {
  const resolved = resolveMembership(subject.memberships, teamId);
  if ('allowed' in resolved) return resolved;
  if (!meetsRoleRank(teamId, resolved.role, minimumRole)) {
    return { allowed: false, reason: 'insufficient_role' };
  }
  return { allowed: true };
}
