import type { TeamId } from './types';

/**
 * A dónde lleva cada tarjeta del Control Center.
 * Siempre a la herramienta real que opera ese dato; nunca a una composición de referencia.
 */
export const CEO_CARD_DRILLDOWN = {
  community: '/admin/metrics',
  users: '/admin/users',
  offers: '/admin/moderation/approved',
  revenue: '/admin/commissions',
  payouts: '/admin/rewards',
  capacity: '/admin/infraestructura',
  goals: '/admin/moderation',
  seasonPrep: '/admin/announcements',
} as const;

/** Herramienta real de cada equipo (la misma a la que apuntan sus alertas). */
export const TEAM_TOOL_HREF: Record<TeamId, string> = {
  moderacion: '/admin/moderation',
  finanzas: '/admin/commissions',
  growth: '/admin/owner/crecimiento',
  producto: '/admin/health',
  hunter: '/admin/hunter',
  comunidad: '/admin/moderation/reports',
  operaciones: '/admin/operaciones',
};
