import { roleHasPermission } from '../permissions/grants';
import type { TeamMembership } from '../roles/membership';
import { rulesForTeam } from '../xp/rules/catalog';

/**
 * El panel de progreso existe solo donde hay Team XP real que ganar:
 * el equipo tiene una regla activa y el rol tiene el permiso que esa regla exige.
 * La membresía sola no basta.
 */
export function teamProgressAccess(membership: TeamMembership): boolean {
  if (membership.status !== 'ACTIVE') return false;
  return rulesForTeam(membership.teamId).some(
    (rule) => rule.enabled && roleHasPermission(membership.teamId, membership.role, rule.requiredPermission),
  );
}
