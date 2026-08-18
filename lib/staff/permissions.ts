import type { Role } from '@/lib/admin/roles';
import {
  ADMIN_PANEL_ROLES,
  GERENCIA_ROLES,
  ROLE_PRIORITY,
  STAFF_HUB_ROLES,
  isRole,
  pickEffectiveRole,
} from '@/lib/admin/roles';

export type StaffDepartmentId =
  | 'home'
  | 'moderacion'
  | 'marketing'
  | 'contabilidad'
  | 'operaciones'
  | 'gerencia';

export type StaffDepartmentMeta = {
  id: StaffDepartmentId;
  label: string;
  subtitle: string;
  href: string;
  allowedRoles: Role[];
};

export const STAFF_DEPARTMENTS: StaffDepartmentMeta[] = [
  {
    id: 'home',
    label: 'Inicio',
    subtitle: 'Resumen del día y bienvenida',
    href: '/equipo',
    allowedRoles: [...STAFF_HUB_ROLES],
  },
  {
    id: 'moderacion',
    label: 'Moderación',
    subtitle: 'Cola, reportes y calidad de ofertas',
    href: '/equipo/moderacion',
    allowedRoles: ['owner', 'admin', 'gerente', 'moderator'],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    subtitle: 'Ofertas para video y redes',
    href: '/equipo/marketing',
    allowedRoles: ['owner', 'admin', 'gerente', 'marketing'],
  },
  {
    id: 'contabilidad',
    label: 'Contabilidad',
    subtitle: 'Comisiones, ledger y pagos',
    href: '/equipo/contabilidad',
    allowedRoles: ['owner', 'admin', 'gerente', 'finance'],
  },
  {
    id: 'operaciones',
    label: 'Operaciones',
    subtitle: 'Salud del sitio y alertas',
    href: '/equipo/operaciones',
    allowedRoles: ['owner', 'admin', 'gerente', 'analyst'],
  },
  {
    id: 'gerencia',
    label: 'Gerencia',
    subtitle: 'Supervisión del equipo y SLA',
    href: '/equipo/gerencia',
    allowedRoles: [...GERENCIA_ROLES],
  },
];

export function canAccessStaffHub(role: Role | null): boolean {
  return role !== null && STAFF_HUB_ROLES.includes(role);
}

export function canAccessAdminPanel(role: Role | null): boolean {
  return role !== null && ADMIN_PANEL_ROLES.includes(role);
}

export function canAccessGerencia(role: Role | null): boolean {
  return role !== null && GERENCIA_ROLES.includes(role);
}

export function canAccessStaffDepartment(role: Role | null, department: StaffDepartmentId): boolean {
  if (!role) return false;
  const meta = STAFF_DEPARTMENTS.find((d) => d.id === department);
  if (!meta) return false;
  return meta.allowedRoles.includes(role);
}

export function listStaffDepartmentsForRole(role: Role | null): StaffDepartmentMeta[] {
  if (!role) return [];
  return STAFF_DEPARTMENTS.filter((d) => d.allowedRoles.includes(role));
}

export { ROLE_PRIORITY, isRole, pickEffectiveRole, STAFF_HUB_ROLES, GERENCIA_ROLES, ADMIN_PANEL_ROLES };
