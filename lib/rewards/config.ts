/**
 * Política centralizada — Programa de Recompensas V1.
 * Único lugar para cambiar % y umbrales sin reconstruir el sistema.
 */

/** Ofertas aprobadas/publicadas requeridas para desbloquear. */
export const REWARDS_REQUIRED_APPROVED_OFFERS = 15;

/** Votos positivos acumulados (suma entre todas las ofertas del usuario). */
export const REWARDS_REQUIRED_POSITIVE_VOTES = 15;

/** Share creador en basis points (4000 = 40%). */
export const REWARDS_CREATOR_SHARE_BPS = 4000;

/** Mínimo de retiro en centavos MXN ($200). */
export const REWARDS_MIN_PAYOUT_CENTS = 20_000;

/** Días de validación/hold antes de AVAILABLE (recompensa del creador). */
export const REWARDS_HOLD_DAYS = 60;

/** Ventana de atribución producto+clic (días). */
export const REWARDS_CLICK_ATTRIBUTION_WINDOW_DAYS = 7;

/** Versión de términos del programa (alineada con /terms cuando se active). */
export const REWARDS_TERMS_VERSION = '2026-08-30';

export type RewardStatus =
  | 'PENDING'
  | 'VALIDATING'
  | 'AVAILABLE'
  | 'PAID'
  | 'CANCELLED'
  | 'REVERSED';

export type AttributionMethod = 'sub_id' | 'product_click_window' | 'manual';

export type AttributionConfidence = 'high' | 'medium' | 'low' | 'none';

export const REWARD_STATUSES: RewardStatus[] = [
  'PENDING',
  'VALIDATING',
  'AVAILABLE',
  'PAID',
  'CANCELLED',
  'REVERSED',
];

export function platformShareBps(creatorShareBps: number = REWARDS_CREATOR_SHARE_BPS): number {
  return Math.max(0, 10_000 - creatorShareBps);
}

export function splitCommissionCents(
  grossCents: number,
  creatorShareBps: number = REWARDS_CREATOR_SHARE_BPS,
): { creatorCents: number; platformCents: number } {
  const gross = Math.max(0, Math.floor(grossCents));
  const creatorCents = Math.floor((gross * creatorShareBps) / 10_000);
  return { creatorCents, platformCents: gross - creatorCents };
}
