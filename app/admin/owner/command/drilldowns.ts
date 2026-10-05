import type { TeamId } from './types';

/**
 * Cada bloque del CEO abre su vista en /admin/owner/vista.
 * Las herramientas operativas siguen en el menú; estas rutas son el detalle del mosaico.
 */
export const CEO_CARD_DRILLDOWN = {
  community: '/admin/owner/vista/comunidad',
  users: '/admin/owner/vista/usuarios',
  offers: '/admin/owner/vista/ofertas',
  revenue: '/admin/owner/vista/ingresos',
  payouts: '/admin/owner/vista/pagos',
  capacity: '/admin/owner/vista/capacidad',
  goals: '/admin/owner/vista/metas',
  seasonPrep: '/admin/owner/vista/temporada',
  priorities: '/admin/owner/vista/prioridades',
} as const;

/** Cada equipo del mosaico abre su tablero en /admin/owner/vista/equipos. */
export const TEAM_TOOL_HREF: Record<TeamId, string> = {
  moderacion: '/admin/owner/vista/equipos/moderacion',
  finanzas: '/admin/owner/vista/equipos/finanzas',
  growth: '/admin/owner/vista/equipos/growth',
  producto: '/admin/owner/vista/equipos/producto',
  hunter: '/admin/owner/vista/equipos/hunter',
  comunidad: '/admin/owner/vista/equipos/comunidad',
  operaciones: '/admin/owner/vista/equipos/operaciones',
};
