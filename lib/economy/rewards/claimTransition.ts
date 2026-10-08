/**
 * Transición condicional. Si el estado ya cambió, la segunda petición no gana.
 */

export type TransitionClaim<T extends string> =
  | { ok: true; next: T }
  | { ok: false; reason: 'conflict' };

export function claimEconomicTransition<T extends string>(current: T, expected: T, next: T): TransitionClaim<T> {
  if (current !== expected) return { ok: false, reason: 'conflict' };
  return { ok: true, next };
}
