/**
 * Peso del voto según reputation_level del votante (1–4).
 * Nivel 1: +2 / −2, 2: +4 / −2, 3: +6 / −2, 4: +8 / −2.
 * El voto en contra es −2 en todos los niveles.
 */
export const VOTE_WEIGHT_BY_LEVEL = [
  { up: 2, down: -2 },
  { up: 4, down: -2 },
  { up: 6, down: -2 },
  { up: 8, down: -2 },
] as const;

/**
 * Valores que la API puede persistir y votos ya guardados.
 * Debe coincidir con offer_votes_value_check.
 * 12, −1, −4 y −6 siguen válidos para filas anteriores a este peso.
 */
export const ALLOWED_OFFER_VOTE_VALUES = [2, 4, 6, 8, 12, -1, -2, -4, -6] as const;

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
