/**
 * Roles AVENTA y permisos por sección.
 * owner: acceso total
 * admin: acceso total
 * moderator: Pendientes, Aprobadas, Rechazadas, Reportes, Usuarios, Logs
 * analyst: Métricas, Health
 */

export const ROLES = ['owner', 'admin', 'moderator', 'analyst'] as const;
export type Role = (typeof ROLES)[number];

export const ADMIN_NAV = {
  moderation: ['owner', 'admin', 'moderator'],
  metrics: ['owner', 'admin', 'analyst'],
  health: ['owner', 'admin', 'analyst'],
} as const;

export function canAccessModeration(role: Role | null): boolean {
  return role !== null && (ADMIN_NAV.moderation as readonly Role[]).includes(role);
}

export function canAccessMetrics(role: Role | null): boolean {
  return role !== null && (ADMIN_NAV.metrics as readonly Role[]).includes(role);
}

export function canAccessHealth(role: Role | null): boolean {
  return role !== null && (ADMIN_NAV.health as readonly Role[]).includes(role);
}

export function canAccessAdmin(role: Role | null): boolean {
  return role !== null;
}
