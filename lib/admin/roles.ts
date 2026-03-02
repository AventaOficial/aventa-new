/**
 * Roles AVENTA y permisos por sección.
 * owner: acceso total (moderación + usuarios/logs + métricas/health)
 * admin: igual que owner
 * moderator: solo moderación (Pendientes, Aprobadas, Rechazadas, Comentarios, Reportes). No ve Usuarios, Logs, Métricas, Health.
 * analyst: solo Métricas y Health
 */

export const ROLES = ['owner', 'admin', 'moderator', 'analyst'] as const;
export type Role = (typeof ROLES)[number];

export const ADMIN_NAV = {
  /** Ver pendientes, aprobadas, rechazadas, comentarios, reportes */
  moderation: ['owner', 'admin', 'moderator'],
  /** Ver usuarios y logs (solo owner/admin) */
  usersLogs: ['owner', 'admin'],
  /** Gestionar equipo: ver y editar roles (solo owner) */
  team: ['owner'],
  /** Gestionar avisos del sitio (solo owner) */
  announcements: ['owner'],
  metrics: ['owner', 'admin', 'analyst'],
  health: ['owner', 'admin', 'analyst'],
} as const;

export function canAccessModeration(role: Role | null): boolean {
  return role !== null && (ADMIN_NAV.moderation as readonly Role[]).includes(role);
}

/** Solo owner y admin ven Usuarios y Logs; moderadores no. */
export function canAccessUsersLogs(role: Role | null): boolean {
  return role !== null && (ADMIN_NAV.usersLogs as readonly Role[]).includes(role);
}

/** Solo owner ve Equipo (gestionar moderadores y roles). */
export function canManageTeam(role: Role | null): boolean {
  return role === 'owner';
}

/** Solo owner gestiona avisos del sitio. */
export function canManageAnnouncements(role: Role | null): boolean {
  return role === 'owner';
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
