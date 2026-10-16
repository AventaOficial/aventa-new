import { describe, expect, it } from 'vitest';
import { subjectHasTeamPermission } from '@/lib/server/collaboratorAuth';
import type { TeamMembership } from '@/lib/team/roles/membership';

const USER = '00000000-0000-4000-8000-000000000001';

function member(
  teamId: TeamMembership['teamId'],
  role: string,
  status: TeamMembership['status'] = 'ACTIVE',
): TeamMembership {
  return { userId: USER, teamId, role, status };
}

describe('collaboratorAuth', () => {
  it('moderador activo puede decidir ofertas', () => {
    const memberships = [member('moderation', 'moderator')];
    expect(subjectHasTeamPermission(memberships, 'moderation.offers.decide')).toBe(true);
  });

  it('membresía suspendida no autoriza', () => {
    const memberships = [member('moderation', 'moderator', 'SUSPENDED')];
    expect(subjectHasTeamPermission(memberships, 'moderation.offers.decide')).toBe(false);
  });

  it('marketing no obtiene permisos de moderación', () => {
    const memberships = [member('growth', 'growth_member')];
    expect(subjectHasTeamPermission(memberships, 'moderation.offers.decide')).toBe(false);
    expect(subjectHasTeamPermission(memberships, 'growth.overview.read')).toBe(true);
  });

  it('operaciones no abre finanzas', () => {
    const memberships = [member('operations', 'operations_member')];
    expect(subjectHasTeamPermission(memberships, 'finance.overview.read')).toBe(false);
    expect(subjectHasTeamPermission(memberships, 'operations.overview.read')).toBe(true);
  });
});
