/**
 * Score de respaldo cuando no hay `ranking_momentum` en BD: **2×up − down** (cada arriba +2, cada abajo −1 en términos de cabezas).
 * Con votos ponderados por nivel, el número mostrado debe venir de `ranking_momentum` (= SUM(value)).
 */
export function computeOfferScore(upvotes: number | null | undefined, downvotes: number | null | undefined): number {
  const up = Number(upvotes ?? 0);
  const down = Number(downvotes ?? 0);
  return 2 * up - down;
}

/** Normaliza contadores para evitar NaN/undefined en UI. */
export function normalizeVoteCounts(
  upvotes: number | null | undefined,
  downvotes: number | null | undefined,
): { up: number; down: number; score: number } {
  const up = Number(upvotes ?? 0);
  const down = Number(downvotes ?? 0);
  return { up, down, score: computeOfferScore(up, down) };
}
