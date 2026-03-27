/**
 * Única fórmula canónica de score visible en producto.
 * - Voto positivo vale 2
 * - Voto negativo vale -1
 */
export function computeOfferScore(upvotes: number | null | undefined, downvotes: number | null | undefined): number {
  const up = Number(upvotes ?? 0);
  const down = Number(downvotes ?? 0);
  return up * 2 - down;
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
