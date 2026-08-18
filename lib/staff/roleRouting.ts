import type { Role } from '@/lib/admin/roles';
import type { StaffDepartmentId } from '@/lib/staff/permissions';

export function roleDefaultDepartment(role: Role): StaffDepartmentId {
  switch (role) {
    case 'moderator':
      return 'moderacion';
    case 'marketing':
      return 'marketing';
    case 'finance':
      return 'contabilidad';
    case 'analyst':
      return 'operaciones';
    case 'gerente':
      return 'gerencia';
    default:
      return 'home';
  }
}

export function staffHomePathForRole(role: Role | null): string {
  if (!role) return '/';
  if (role === 'gerente') return '/equipo/gerencia';
  const dept = roleDefaultDepartment(role);
  if (dept === 'home') return '/equipo';
  return `/equipo/${dept}`;
}
