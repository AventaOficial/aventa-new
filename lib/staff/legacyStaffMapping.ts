import type { Role } from '@/lib/admin/roles';
import type { TeamMembership } from '@/lib/team/roles/membership';

/**
 * Equivalencias documentadas staff → Team OS (migración y pruebas).
 * No usar para autorización en producción.
 */
export const STAFF_TO_TEAM_MIGRATION: Partial<
  Record<Role, { teamId: TeamMembership['teamId']; role: string }>
> = {
  moderator: { teamId: 'moderation', role: 'moderator' },
  marketing: { teamId: 'growth', role: 'growth_member' },
  finance: { teamId: 'finance', role: 'finance_viewer' },
  analyst: { teamId: 'operations', role: 'operations_member' },
};

export function syntheticMembershipsForLegacyStaffRole(
  role: Role,
  userId = '00000000-0000-4000-8000-000000000099',
): TeamMembership[] {
  if (role === 'owner') return [];
  if (role === 'gerente') {
    return [{ userId, teamId: 'operations', role: 'operations_lead', status: 'ACTIVE' }];
  }
  if (role === 'admin') {
    return [
      { userId, teamId: 'operations', role: 'operations_lead', status: 'ACTIVE' },
      { userId, teamId: 'moderation', role: 'senior_moderator', status: 'ACTIVE' },
    ];
  }
  const mapped = STAFF_TO_TEAM_MIGRATION[role];
  if (!mapped) return [];
  return [{ userId, teamId: mapped.teamId, role: mapped.role, status: 'ACTIVE' } as TeamMembership];
}
