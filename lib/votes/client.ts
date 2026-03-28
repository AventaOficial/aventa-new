/**
 * Contrato con POST /api/votes: value === 2 (arriba) o -1 (abajo).
 * @see lib/contracts/votes.ts
 */
export const VOTE_API_UP = 2 as const;
export const VOTE_API_DOWN = -1 as const;
export type VoteApiValue = typeof VOTE_API_UP | typeof VOTE_API_DOWN;

export function isVoteApiValue(v: unknown): v is VoteApiValue {
  return v === VOTE_API_UP || v === VOTE_API_DOWN;
}

/**
 * Tras decidir el siguiente estado de UI (1 | -1 | 0), devuelve el payload para la API.
 * Quitar voto: reenviar el mismo value almacenado (la API borra la fila).
 */
export function voteApiValueForTransition(
  nextDisplay: 0 | 1 | -1,
  prevDisplay: 0 | 1 | -1
): VoteApiValue | null {
  if (nextDisplay === 1) return VOTE_API_UP;
  if (nextDisplay === -1) return VOTE_API_DOWN;
  if (prevDisplay === 1) return VOTE_API_UP;
  if (prevDisplay === -1) return VOTE_API_DOWN;
  return null;
}
