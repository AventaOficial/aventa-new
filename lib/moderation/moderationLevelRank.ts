import type { ModerationLevel } from './classifyModerationLevel';

const RANK: Record<ModerationLevel, number> = {
  sprint: 1,
  review: 2,
  enforcement: 3,
};

/** ¿El nivel de la oferta está dentro del máximo permitido para el moderador? */
export function moderationLevelWithinMax(
  level: ModerationLevel,
  maxLevel: ModerationLevel
): boolean {
  return RANK[level] <= RANK[maxLevel];
}
