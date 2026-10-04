import { isTeamId, type TeamId } from '../roles/teams';

/**
 * Permisos de Team OS. Viven en código.
 * Formato: equipo.recurso.acción
 *
 * Finanzas es solo lectura de dinero. Hunter no lanza ingesta, supply ni run-now.
 * `*.xp.grant` existe para Team XP y no está asignado a ningún rol.
 * Ningún permiso abre `/admin`.
 */
export const TEAM_PERMISSIONS = [
  'moderation.offers.read',
  'moderation.offers.decide',
  'moderation.reports.read',
  'moderation.metrics.read',
  'hunter.offers.read',
  'hunter.activity.read',
  'hunter.batches.decide',
  'growth.overview.read',
  'product.overview.read',
  'community.overview.read',
  'operations.overview.read',
  'finance.overview.read',
  'moderation.xp.grant',
  'hunter.xp.grant',
  'growth.xp.grant',
  'product.xp.grant',
  'community.xp.grant',
  'operations.xp.grant',
  'finance.xp.grant',
] as const;

export type TeamPermission = (typeof TEAM_PERMISSIONS)[number];

const PERMISSION_SET: ReadonlySet<string> = new Set(TEAM_PERMISSIONS);

export function isTeamPermission(value: string): value is TeamPermission {
  return PERMISSION_SET.has(value);
}

export function permissionTeam(permission: TeamPermission): TeamId | null {
  const prefix = permission.slice(0, permission.indexOf('.'));
  return isTeamId(prefix) ? prefix : null;
}

export function permissionAction(permission: TeamPermission): string {
  const parts = permission.split('.');
  return parts[parts.length - 1] ?? '';
}

/** Acciones que Team OS no puede expresar. Sirven para fijar el límite en tests. */
export const EXCLUDED_TEAM_ACTIONS = [
  'finance.payout.create',
  'finance.payout.approve',
  'finance.clawback.create',
  'finance.settlement.release',
  'finance.settlement.approve',
  'hunter.ingest.run',
  'hunter.supply.run',
  'hunter.acquisition.run',
] as const;
