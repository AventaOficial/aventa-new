/** Límites de score por nivel (alineados con reputation_level_from_score en Supabase). */
export const REPUTATION_LEVELS = [
  { level: 1, minScore: 0, maxScore: 99, label: 'Nuevo' },
  { level: 2, minScore: 100, maxScore: 399, label: 'Contribuidor' },
  { level: 3, minScore: 400, maxScore: 999, label: 'Cazador Pro' },
  { level: 4, minScore: 1000, maxScore: Infinity, label: 'Elite' },
] as const;

export function getReputationLabel(level: number): string {
  const found = REPUTATION_LEVELS.find((l) => l.level === level);
  return found?.label ?? 'Nuevo';
}

/** Progreso 0..1 dentro del nivel actual (para barra visual). */
export function getReputationProgress(score: number, level: number): number {
  const config = REPUTATION_LEVELS.find((l) => l.level === level);
  if (!config || config.maxScore === Infinity) return 1;
  const span = config.maxScore - config.minScore + 1;
  const inLevel = score - config.minScore;
  return Math.min(1, Math.max(0, inLevel / span));
}
