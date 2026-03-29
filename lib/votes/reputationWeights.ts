/**
 * Peso del voto según reputation_level del votante (1–4).
 * Nivel 1: +2 / −1, 2: +4 / −2, 3: +8 / −4, 4: +12 / −6.
 */
export const VOTE_WEIGHT_BY_LEVEL = [
  { up: 2, down: -1 },
  { up: 4, down: -2 },
  { up: 8, down: -4 },
  { up: 12, down: -6 },
] as const;

export type VoteDirection = 'up' | 'down';

export function clampReputationLevel(level: number | null | undefined): 1 | 2 | 3 | 4 {
  const n = Math.floor(Number(level));
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > 4) return 4;
  return n as 1 | 2 | 3 | 4;
}

export function voteWeightPairForLevel(level: number | null | undefined): { up: number; down: number } {
  const idx = clampReputationLevel(level) - 1;
  return VOTE_WEIGHT_BY_LEVEL[idx];
}

export function isUpVoteValue(v: number): boolean {
  return v > 0;
}

/** Misma dirección (ambos arriba o ambos abajo), sin importar magnitud. */
export function sameVoteDirection(a: number, b: number): boolean {
  return (a > 0 && b > 0) || (a < 0 && b < 0);
}
