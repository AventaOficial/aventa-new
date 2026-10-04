import { describe, expect, it } from 'vitest';
import * as authz from '../../lib/team/authz';
import * as permissions from '../../lib/team/permissions';
import * as roles from '../../lib/team/roles';
import {
  TEAM_IDS,
  isTeamId,
  isTeamRole,
  meetsRoleRank,
  type TeamMembership,
} from '../../lib/team/roles';
import {
  EXCLUDED_TEAM_ACTIONS,
  TEAM_PERMISSIONS,
  isTeamPermission,
  permissionAction,
  permissionTeam,
  roleHasPermission,
} from '../../lib/team/permissions';
import {
  activeTeamIds,
  authorizeMinimumRole,
  authorizeTeamPermission,
  canAccessTeam,
  membershipGrantsAdmin,
  type AuthzSubject,
} from '../../lib/team/authz';

function membership(
  partial: Pick<TeamMembership, 'teamId' | 'role' | 'status'> & { userId?: string },
): TeamMembership {
  return {
    userId: partial.userId ?? 'user-a',
    teamId: partial.teamId,
    role: partial.role,
    status: partial.status,
  };
}

function subject(memberships: readonly TeamMembership[]): AuthzSubject {
  return { memberships };
}

const MUTATION_EXPORTS = [
  'assignMembership',
  'changeRole',
  'setStatus',
  'team_assign_member',
  'team_change_role',
  'team_set_status',
];

describe('team catalog', () => {
  it('define los siete equipos y rechaza ids del mosaico CEO y roles globales', () => {
    expect(TEAM_IDS).toEqual([
      'moderation',
      'hunter',
      'growth',
      'product',
      'community',
      'operations',
      'finance',
    ]);
    expect(isTeamId('moderacion')).toBe(false);
    expect(isTeamId('finanzas')).toBe(false);
    expect(isTeamId('admin')).toBe(false);
    expect(isTeamId('owner')).toBe(false);
    expect(roles.everyTeamHasRoles()).toBe(true);
  });

  it('no trata los roles globales como roles de equipo', () => {
    for (const teamId of TEAM_IDS) {
      expect(isTeamRole(teamId, 'owner')).toBe(false);
      expect(isTeamRole(teamId, 'admin')).toBe(false);
      expect(isTeamRole(teamId, 'gerente')).toBe(false);
      expect(isTeamRole(teamId, 'analyst')).toBe(false);
      expect(isTeamRole(teamId, 'marketing')).toBe(false);
      expect(isTeamRole(teamId, 'finance')).toBe(false);
    }
    expect(isTeamRole('moderation', 'moderator')).toBe(true);
    expect(isTeamRole('finance', 'moderator')).toBe(false);
    expect(isTeamRole('hunter', 'hunter_lead')).toBe(true);
  });

  it('ordena el rango dentro del equipo y no cruza equipos', () => {
    expect(meetsRoleRank('moderation', 'moderation_lead', 'moderator')).toBe(true);
    expect(meetsRoleRank('moderation', 'moderator', 'moderation_lead')).toBe(false);
    expect(meetsRoleRank('moderation', 'hunter_lead', 'moderator')).toBe(false);
    expect(meetsRoleRank('growth', 'growth_lead', 'growth_member')).toBe(true);
    expect(meetsRoleRank('growth', 'growth_member', 'growth_lead')).toBe(false);
  });
});

describe('team permissions', () => {
  it('registra solo permisos de equipo y deja fuera dinero e ingesta', () => {
    for (const permission of TEAM_PERMISSIONS) {
      expect(permissionTeam(permission)).not.toBeNull();
      expect(permission.startsWith('admin.')).toBe(false);
    }
    for (const excluded of EXCLUDED_TEAM_ACTIONS) {
      expect(isTeamPermission(excluded)).toBe(false);
    }
    const finance = TEAM_PERMISSIONS.filter((permission) => permission.startsWith('finance.'));
    expect(finance).toEqual(['finance.overview.read', 'finance.xp.grant']);
    expect(finance.filter((permission) => permissionAction(permission) === 'read')).toEqual([
      'finance.overview.read',
    ]);
    expect(roleHasPermission('finance', 'finance_viewer', 'finance.xp.grant')).toBe(false);
    expect(TEAM_PERMISSIONS.some((permission) => /ingest|supply|acquisition|payout|clawback|settlement/.test(permission))).toBe(false);
  });

  it('el rol alto incluye los permisos del rol bajo', () => {
    for (const teamId of TEAM_IDS) {
      const ordered = roles.TEAM_ROLES[teamId];
      for (let index = 1; index < ordered.length; index += 1) {
        const lower = ordered[index - 1];
        const higher = ordered[index];
        if (!lower || !higher) continue;
        for (const permission of roles.rolesForTeam(teamId).length ? permissions.permissionsFor(teamId, lower) : []) {
          expect(roleHasPermission(teamId, higher, permission)).toBe(true);
        }
      }
    }
  });

  it('separa moderación, hunter y finanzas', () => {
    expect(roleHasPermission('moderation', 'moderator', 'moderation.offers.decide')).toBe(true);
    expect(roleHasPermission('moderation', 'moderator', 'moderation.metrics.read')).toBe(false);
    expect(roleHasPermission('moderation', 'senior_moderator', 'moderation.metrics.read')).toBe(true);
    expect(roleHasPermission('moderation', 'moderation_lead', 'moderation.metrics.read')).toBe(true);
    expect(roleHasPermission('hunter', 'hunter', 'hunter.offers.read')).toBe(true);
    expect(roleHasPermission('hunter', 'hunter', 'hunter.batches.decide')).toBe(false);
    expect(roleHasPermission('hunter', 'hunter_lead', 'hunter.batches.decide')).toBe(true);
    expect(roleHasPermission('finance', 'finance_viewer', 'finance.overview.read')).toBe(true);
    expect(roleHasPermission('hunter', 'hunter_lead', 'finance.overview.read')).toBe(false);
  });
});

describe('team authorization', () => {
  const moderator = membership({
    teamId: 'moderation',
    role: 'moderator',
    status: 'ACTIVE',
  });
  const hunter = membership({
    teamId: 'hunter',
    role: 'hunter',
    status: 'ACTIVE',
  });

  it('una membresía no concede admin y no hay mutaciones de autoasignación', () => {
    expect(membershipGrantsAdmin()).toBe(false);
    const exported = [
      ...Object.keys(authz),
      ...Object.keys(permissions),
      ...Object.keys(roles),
    ];
    for (const name of MUTATION_EXPORTS) {
      expect(exported).not.toContain(name);
    }
  });

  it('deja entrar a su equipo y niega el equipo ajeno', () => {
    const user = subject([moderator, hunter]);
    expect(canAccessTeam(user, 'moderation')).toBe(true);
    expect(canAccessTeam(user, 'hunter')).toBe(true);
    expect(canAccessTeam(user, 'finance')).toBe(false);
    expect(activeTeamIds(user, TEAM_IDS)).toEqual(['moderation', 'hunter']);
    expect(authorizeTeamPermission(user, 'moderation', 'moderation.offers.decide')).toEqual({
      allowed: true,
    });
    expect(authorizeTeamPermission(user, 'hunter', 'hunter.offers.read')).toEqual({
      allowed: true,
    });
    expect(authorizeTeamPermission(user, 'finance', 'finance.overview.read')).toEqual({
      allowed: false,
      reason: 'no_membership',
    });
    expect(authorizeTeamPermission(user, 'moderation', 'hunter.offers.read')).toEqual({
      allowed: false,
      reason: 'wrong_team',
    });
  });

  it('niega suspendido, removido y un usuario sin equipos', () => {
    expect(
      canAccessTeam(
        subject([membership({ teamId: 'moderation', role: 'moderator', status: 'SUSPENDED' })]),
        'moderation',
      ),
    ).toBe(false);
    expect(
      authorizeTeamPermission(
        subject([membership({ teamId: 'moderation', role: 'moderation_lead', status: 'SUSPENDED' })]),
        'moderation',
        'moderation.offers.decide',
      ),
    ).toEqual({ allowed: false, reason: 'membership_inactive' });
    expect(
      authorizeTeamPermission(
        subject([membership({ teamId: 'moderation', role: 'moderator', status: 'REMOVED' })]),
        'moderation',
        'moderation.offers.read',
      ),
    ).toEqual({ allowed: false, reason: 'membership_inactive' });
    expect(authorizeTeamPermission(subject([]), 'moderation', 'moderation.offers.read')).toEqual({
      allowed: false,
      reason: 'no_membership',
    });
  });

  it('un historial REMOVED no bloquea una membresía ACTIVE nueva', () => {
    const user = subject([
      membership({ teamId: 'moderation', role: 'moderator', status: 'REMOVED' }),
      membership({ teamId: 'moderation', role: 'senior_moderator', status: 'ACTIVE' }),
    ]);
    expect(authorizeTeamPermission(user, 'moderation', 'moderation.metrics.read')).toEqual({
      allowed: true,
    });
  });

  it('cierra si hay dos membresías vivas del mismo equipo', () => {
    const user = subject([
      membership({ teamId: 'moderation', role: 'moderator', status: 'ACTIVE' }),
      membership({ teamId: 'moderation', role: 'moderation_lead', status: 'SUSPENDED' }),
    ]);
    expect(authorizeTeamPermission(user, 'moderation', 'moderation.offers.read')).toEqual({
      allowed: false,
      reason: 'ambiguous_membership',
    });
  });

  it('niega un permiso que el rol no tiene y un rango insuficiente', () => {
    const user = subject([moderator]);
    expect(authorizeTeamPermission(user, 'moderation', 'moderation.metrics.read')).toEqual({
      allowed: false,
      reason: 'missing_permission',
    });
    expect(authorizeMinimumRole(user, 'moderation', 'senior_moderator')).toEqual({
      allowed: false,
      reason: 'insufficient_role',
    });
    expect(authorizeMinimumRole(user, 'moderation', 'moderator')).toEqual({ allowed: true });
    expect(authorizeMinimumRole(subject([hunter]), 'hunter', 'moderator')).toEqual({
      allowed: false,
      reason: 'insufficient_role',
    });
  });

  it('finanzas solo lee y hunter no decide lotes sin ser líder', () => {
    const finance = subject([
      membership({ teamId: 'finance', role: 'finance_viewer', status: 'ACTIVE' }),
    ]);
    expect(authorizeTeamPermission(finance, 'finance', 'finance.overview.read')).toEqual({
      allowed: true,
    });
    expect(canAccessTeam(finance, 'operations')).toBe(false);

    const hunterMember = subject([hunter]);
    expect(authorizeTeamPermission(hunterMember, 'hunter', 'hunter.batches.decide')).toEqual({
      allowed: false,
      reason: 'missing_permission',
    });
    const lead = subject([
      membership({ teamId: 'hunter', role: 'hunter_lead', status: 'ACTIVE' }),
    ]);
    expect(authorizeTeamPermission(lead, 'hunter', 'hunter.batches.decide')).toEqual({
      allowed: true,
    });
  });
});
