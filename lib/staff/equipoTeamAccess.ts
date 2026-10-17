import { authorizeTeamPermission } from '@/lib/team/authz/authorize';
import { teamHomePermission } from '@/lib/team/config/catalog';
import type { TeamPermission } from '@/lib/team/permissions/registry';
import type { TeamMembership } from '@/lib/team/roles/membership';
import type { TeamId } from '@/lib/team/roles/teams';
import { TEAM_ROLES } from '@/lib/team/roles/catalog';
import type { StaffDepartmentId } from '@/lib/staff/permissions';
import { OPERATIONS_MODERATION_PATHS } from '@/lib/staff/equipoAccess';

const DEPARTMENT_TEAM: Partial<Record<StaffDepartmentId, TeamId>> = {
  moderacion: 'moderation',
  marketing: 'growth',
  contabilidad: 'finance',
  operaciones: 'operations',
};

function hasActiveTeam(memberships: readonly TeamMembership[], teamId: TeamId): boolean {
  return memberships.some((m) => m.teamId === teamId && m.status === 'ACTIVE');
}

function hasTeamHome(memberships: readonly TeamMembership[], teamId: TeamId): boolean {
  const m = memberships.find((item) => item.teamId === teamId && item.status === 'ACTIVE');
  if (!m) return false;
  return authorizeTeamPermission({ memberships }, teamId, teamHomePermission(teamId)).allowed;
}

function isAnyTeamLead(memberships: readonly TeamMembership[]): boolean {
  for (const m of memberships) {
    if (m.status !== 'ACTIVE') continue;
    const roles = TEAM_ROLES[m.teamId];
    if (roles.length < 2) continue;
    if (roles[roles.length - 1] === m.role) return true;
  }
  return false;
}

/**
 * Sustituye `canAccessEquipoPath(role, pathname)` basado en `user_roles`.
 * El sujeto lo arma el servidor desde sesión + `team_memberships`.
 */
export function canAccessEquipoPathFromMemberships(
  memberships: readonly TeamMembership[],
  pathname: string,
  isOwner: boolean,
): boolean {
  if (isOwner) return true;

  const active = memberships.filter((m) => m.status === 'ACTIVE');
  if (active.length === 0) return false;

  if (pathname === '/equipo' || pathname === '/equipo/') {
    return true;
  }

  const match = pathname.match(/^\/equipo\/([^/]+)/);
  if (!match) return true;
  const slug = match[1] as StaffDepartmentId;

  if (slug === 'gerencia') {
    return isAnyTeamLead(active);
  }

  const teamId = DEPARTMENT_TEAM[slug];
  if (!teamId) return false;
  if (!hasActiveTeam(active, teamId)) {
    if (slug === 'moderacion' && hasActiveTeam(active, 'operations')) {
      return OPERATIONS_MODERATION_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
    }
    return false;
  }
  return hasTeamHome(active, teamId);
}

export const DEPARTMENT_ENTRY_PERMISSION: Partial<Record<StaffDepartmentId, TeamPermission>> = {
  moderacion: 'moderation.offers.read',
  marketing: 'growth.overview.read',
  contabilidad: 'finance.overview.read',
  operaciones: 'operations.overview.read',
};

export function canAccessStaffDepartmentFromMemberships(
  memberships: readonly TeamMembership[],
  department: StaffDepartmentId,
  isOwner: boolean,
): boolean {
  if (isOwner) return true;
  if (department === 'home') return memberships.some((m) => m.status === 'ACTIVE');
  if (department === 'gerencia') return isAnyTeamLead(memberships);

  const teamId = DEPARTMENT_TEAM[department];
  const permission = DEPARTMENT_ENTRY_PERMISSION[department];
  if (!teamId || !permission) return false;
  return authorizeTeamPermission({ memberships }, teamId, permission).allowed;
}
