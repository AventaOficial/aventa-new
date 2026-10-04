import type { TeamId } from '../roles/teams';

/**
 * Única fuente de niveles de equipo. Solo Team XP; el XP de comunidad no entra.
 * Cada tabla empieza en 0 y crece estrictamente. Cambiar una tabla no requiere tocar la UI.
 */
const DEFAULT_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5200, 6600, 8200, 10000] as const;

export const TEAM_LEVEL_THRESHOLDS: Readonly<Record<TeamId, readonly number[]>> = {
  moderation: DEFAULT_THRESHOLDS,
  hunter: DEFAULT_THRESHOLDS,
  growth: DEFAULT_THRESHOLDS,
  product: DEFAULT_THRESHOLDS,
  community: DEFAULT_THRESHOLDS,
  operations: DEFAULT_THRESHOLDS,
  finance: DEFAULT_THRESHOLDS,
};

export type TeamLevel = {
  teamId: TeamId;
  level: number;
  teamXp: number;
  levelFloor: number;
  nextLevelAt: number | null;
  xpToNext: number | null;
  /** 0..1 dentro del nivel. 1 en el último nivel. */
  progress: number;
};

export function validateLevelThresholds(thresholds: readonly number[]): boolean {
  if (thresholds.length === 0 || thresholds[0] !== 0) return false;
  for (let index = 0; index < thresholds.length; index += 1) {
    const value = thresholds[index];
    if (!Number.isSafeInteger(value) || value < 0) return false;
    if (index > 0 && value <= thresholds[index - 1]) return false;
  }
  return true;
}

/** Determinista y monotónica: más Team XP nunca baja de nivel. */
export function getTeamLevel(
  teamId: TeamId,
  teamXp: number,
  tables: Readonly<Record<TeamId, readonly number[]>> = TEAM_LEVEL_THRESHOLDS,
): TeamLevel {
  const thresholds = tables[teamId];
  if (!validateLevelThresholds(thresholds)) throw new Error(`invalid_level_table:${teamId}`);
  const xp = Number.isFinite(teamXp) && teamXp > 0 ? Math.floor(teamXp) : 0;

  let index = 0;
  while (index + 1 < thresholds.length && xp >= thresholds[index + 1]) index += 1;

  const levelFloor = thresholds[index];
  const nextLevelAt = index + 1 < thresholds.length ? thresholds[index + 1] : null;
  const progress = nextLevelAt === null ? 1 : (xp - levelFloor) / (nextLevelAt - levelFloor);
  return {
    teamId,
    level: index + 1,
    teamXp: xp,
    levelFloor,
    nextLevelAt,
    xpToNext: nextLevelAt === null ? null : nextLevelAt - xp,
    progress,
  };
}
