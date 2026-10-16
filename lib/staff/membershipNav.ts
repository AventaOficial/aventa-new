import type { Role } from '@/lib/admin/roles';
import {
  STAFF_DEPARTMENTS,
  type StaffDepartmentId,
  type StaffDepartmentMeta,
} from '@/lib/staff/permissions';
import {
  canAccessStaffDepartmentFromMemberships,
} from '@/lib/staff/equipoTeamAccess';
import type { TeamMembership } from '@/lib/team/roles/membership';
import { roleHasPermission } from '@/lib/team/permissions/grants';
import { staffHomePathForRole } from '@/lib/staff/roleRouting';

/** UI avanzada de moderación (antes `user_roles.admin` + owner). */
export function canAdvancedModerationFromMemberships(
  memberships: readonly TeamMembership[],
  isOwner: boolean,
): boolean {
  if (isOwner) return true;
  return memberships.some(
    (m) =>
      m.status === 'ACTIVE' &&
      m.teamId === 'moderation' &&
      roleHasPermission('moderation', m.role, 'moderation.metrics.read'),
  );
}

export function listStaffDepartmentsFromMemberships(
  memberships: readonly TeamMembership[],
  isOwner: boolean,
): StaffDepartmentMeta[] {
  return STAFF_DEPARTMENTS.filter((dept) =>
    canAccessStaffDepartmentFromMemberships(memberships, dept.id, isOwner),
  );
}

export function staffNavLabel(memberships: readonly TeamMembership[], isOwner: boolean): string {
  if (isOwner) return 'Fundador (Owner)';
  const teams = new Set(memberships.filter((m) => m.status === 'ACTIVE').map((m) => m.teamId));
  if (teams.size === 0) return 'Colaborador';
  if (teams.size === 1) {
    const only = [...teams][0];
    return only ? only.charAt(0).toUpperCase() + only.slice(1) : 'Colaborador';
  }
  return 'Equipo AVENTA';
}

export function staffHomePathFromMemberships(
  memberships: readonly TeamMembership[],
  isOwner: boolean,
): string {
  if (isOwner) return staffHomePathForRole('owner');
  const depts = listStaffDepartmentsFromMemberships(memberships, isOwner);
  const first = depts.find((d) => d.id !== 'home');
  return first?.href ?? '/equipo';
}

/** Rol de compatibilidad para APIs legacy que aún devuelven `Role`. */
export function compatibilityStaffRole(
  memberships: readonly TeamMembership[],
  isOwner: boolean,
): Role | null {
  if (isOwner) return 'owner';
  if (memberships.some((m) => m.teamId === 'moderation' && m.status === 'ACTIVE')) return 'moderator';
  if (memberships.some((m) => m.teamId === 'growth' && m.status === 'ACTIVE')) return 'marketing';
  if (memberships.some((m) => m.teamId === 'finance' && m.status === 'ACTIVE')) return 'finance';
  if (memberships.some((m) => m.teamId === 'operations' && m.status === 'ACTIVE')) return 'analyst';
  if (memberships.some((m) => m.status === 'ACTIVE')) return 'moderator';
  return null;
}

export function primaryDepartmentId(
  memberships: readonly TeamMembership[],
  isOwner: boolean,
): StaffDepartmentId {
  const depts = listStaffDepartmentsFromMemberships(memberships, isOwner);
  const work = depts.find((d) => d.id !== 'home');
  return work?.id ?? 'home';
}
