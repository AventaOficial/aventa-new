/**
 * Roles AVENTA — panel admin (`/admin`) y hub de equipo (`/equipo`).
 *
 * owner: fundador; acceso total.
 * admin: casi owner; no ve centro de operaciones del fundador.
 * gerente: supervisa al staff en `/equipo/gerencia`; no entra a `/admin`.
 * finance: contabilidad y pagos en `/equipo/contabilidad`.
 * marketing: contenido y ofertas para video en `/equipo/marketing`.
 * moderator: cola de ofertas en `/equipo/moderacion` + `/admin/moderation`.
 * analyst: salud y métricas en `/equipo/operaciones` + `/admin/metrics|health`.
 */

export const ROLES = [
  'owner',
  'admin',
  'gerente',
  'finance',
  'marketing',
  'moderator',
  'analyst',
] as const;

export type Role = (typeof ROLES)[number];

/** Orden de precedencia si un usuario tuviera más de un rol (no debería). */
export const ROLE_PRIORITY: Role[] = [
  'owner',
  'admin',
  'gerente',
  'finance',
  'marketing',
  'moderator',
  'analyst',
];

/** Cualquier rol con acceso al hub externo `/equipo`. */
export const STAFF_HUB_ROLES: Role[] = [...ROLES];

/** Roles que pueden usar `/admin` (gerente, marketing y finance van solo a `/equipo`). */
export const ADMIN_PANEL_ROLES: Role[] = ['owner', 'admin', 'moderator', 'analyst'];

/** Supervisión del equipo. */
export const GERENCIA_ROLES: Role[] = ['owner', 'admin', 'gerente'];

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Fundador (Owner)',
  admin: 'Administrador',
  gerente: 'Gerente',
  finance: 'Contabilidad',
  marketing: 'Marketing',
  moderator: 'Moderador',
  analyst: 'Analista',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: 'Dueño del producto: estrategia, bot, pagos, infra y asignación de roles críticos.',
  admin: 'Operación senior: moderación, usuarios, métricas; no el panel privado del fundador.',
  gerente: 'Supervisa al equipo: SLA, tareas del día y que cada área cumpla.',
  finance: 'Ledger afiliado, pools mensuales y marcar pagos a cazadores.',
  marketing: 'Elige ofertas para video, copy y coordinación de redes.',
  moderator: 'Publica o rechaza ofertas; cierra reportes de la comunidad.',
  analyst: 'Monitorea salud del sitio, precios agotados y métricas de producto.',
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function pickEffectiveRole(roles: Role[]): Role | null {
  let best: Role | null = null;
  let bestIdx = ROLE_PRIORITY.length;
  for (const r of roles) {
    const idx = ROLE_PRIORITY.indexOf(r);
    if (idx >= 0 && idx < bestIdx) {
      bestIdx = idx;
      best = r;
    }
  }
  return best;
}

export const ADMIN_NAV = {
  moderation: ['owner', 'admin', 'moderator'] as const,
  teamBoard: STAFF_HUB_ROLES,
  usersLogs: ['owner', 'admin'] as const,
  team: ['owner', 'admin'] as const,
  announcements: ['owner'] as const,
  metrics: ['owner', 'admin', 'analyst'] as const,
  health: ['owner', 'admin', 'analyst'] as const,
} as const;

export function canAccessModeration(role: Role | null): boolean {
  return role !== null && (ADMIN_NAV.moderation as readonly Role[]).includes(role);
}

export function canAccessTeamBoard(role: Role | null): boolean {
  return role !== null && STAFF_HUB_ROLES.includes(role);
}

export function canAccessUsersLogs(role: Role | null): boolean {
  return role !== null && (ADMIN_NAV.usersLogs as readonly Role[]).includes(role);
}

export function canManageTeam(role: Role | null): boolean {
  return role === 'owner' || role === 'admin';
}

export function canAccessOwnerOperationsPanel(role: Role | null): boolean {
  return role === 'owner';
}

export function canManageAnnouncements(role: Role | null): boolean {
  return role === 'owner';
}

export function canAccessMetrics(role: Role | null): boolean {
  return role !== null && (ADMIN_NAV.metrics as readonly Role[]).includes(role);
}

export function canAccessHealth(role: Role | null): boolean {
  return role !== null && (ADMIN_NAV.health as readonly Role[]).includes(role);
}

/** True si puede usar `/admin` (no incluye gerente, marketing, finance). */
export function canAccessAdmin(role: Role | null): boolean {
  return role !== null && ADMIN_PANEL_ROLES.includes(role);
}

/** Roles que owner/admin pueden asignar desde /admin/team (no owner por API). */
export const ASSIGNABLE_STAFF_ROLES: Role[] = [
  'admin',
  'gerente',
  'finance',
  'marketing',
  'moderator',
  'analyst',
];
