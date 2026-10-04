/**
 * Catálogo de equipos de Team OS.
 *
 * Estos ids no son los del mosaico CEO (`moderacion`, `finanzas`, …).
 * Pertenecer a un equipo no concede acceso a `/admin`.
 */

export const TEAM_IDS = [
  'moderation',
  'hunter',
  'growth',
  'product',
  'community',
  'operations',
  'finance',
] as const;

export type TeamId = (typeof TEAM_IDS)[number];

export const TEAM_LABELS: Record<TeamId, string> = {
  moderation: 'Moderación',
  hunter: 'Hunter',
  growth: 'Growth',
  product: 'Producto',
  community: 'Comunidad',
  operations: 'Operaciones',
  finance: 'Finanzas',
};

const TEAM_ID_SET: ReadonlySet<string> = new Set(TEAM_IDS);

export function isTeamId(value: string): value is TeamId {
  return TEAM_ID_SET.has(value);
}
