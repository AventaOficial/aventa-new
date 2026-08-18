import type { Role } from '@/lib/admin/roles';
import { canAccessStaffDepartment, type StaffDepartmentId } from '@/lib/staff/permissions';
import type { StaffQueueItem } from '@/lib/staff/workBoard';

/** Sub-rutas de moderación accesibles solo con rol operaciones (sin permiso de moderar). */
export const OPERATIONS_MODERATION_PATHS = [
  '/equipo/moderacion/precio',
  '/equipo/moderacion/agotadas',
] as const;

export const OPERATIONS_HEALTH_PATHS = [
  '/equipo/operaciones/precio',
  '/equipo/operaciones/agotadas',
] as const;

export function healthQueuePath(role: Role, kind: 'precio' | 'agotadas'): string {
  if (canAccessStaffDepartment(role, 'moderacion')) {
    return kind === 'precio' ? '/equipo/moderacion/precio' : '/equipo/moderacion/agotadas';
  }
  return kind === 'precio' ? '/equipo/operaciones/precio' : '/equipo/operaciones/agotadas';
}

export function healthQueueDepartment(role: Role): StaffDepartmentId {
  return canAccessStaffDepartment(role, 'moderacion') ? 'moderacion' : 'operaciones';
}

/**
 * Acceso a rutas bajo `/equipo/*`.
 * Home siempre permitido si el rol entra al hub.
 */
export function canAccessEquipoPath(role: Role | null, pathname: string): boolean {
  if (!role) return false;

  if (pathname === '/equipo' || pathname === '/equipo/') {
    return canAccessStaffDepartment(role, 'home');
  }

  const match = pathname.match(/^\/equipo\/([^/]+)/);
  if (!match) return true;

  const slug = match[1] as StaffDepartmentId;
  const allowed: StaffDepartmentId[] = [
    'moderacion',
    'marketing',
    'contabilidad',
    'operaciones',
    'gerencia',
  ];

  if (!allowed.includes(slug)) return false;
  if (canAccessStaffDepartment(role, slug)) return true;

  if (slug === 'moderacion' && canAccessStaffDepartment(role, 'operaciones')) {
    return OPERATIONS_MODERATION_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  }

  return false;
}

export function filterStaffQueueForRole(queue: StaffQueueItem[], role: Role): StaffQueueItem[] {
  return queue.filter((item) => {
    if (!item.department) return true;
    return canAccessStaffDepartment(role, item.department);
  });
}
