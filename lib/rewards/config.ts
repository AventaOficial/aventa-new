/**
 * Política centralizada — Programa de Recompensas V1 (P0-1).
 * Umbrales de unlock son constantes de código (fail-closed); no hay env opcional
 * que desactive gates. La única env de activación es REWARDS_PROGRAM_ACTIVE.
 */

/** Ofertas aprobadas/publicadas requeridas para desbloquear. */
export const REWARDS_REQUIRED_APPROVED_OFFERS = 15;

/**
 * Votantes positivos DISTINTOS requeridos (no suma de upvotes_count).
 * Nombre histórico conservado por compat de imports; semántica = distinct voters.
 */
export const REWARDS_REQUIRED_POSITIVE_VOTES = 15;

/** Antigüedad mínima de cuenta (días) — hard gate V1. */
export const REWARDS_MIN_ACCOUNT_AGE_DAYS = 7;

/** Tasa mínima de aprobación (0–1) — hard gate V1. */
export const REWARDS_MIN_APPROVAL_RATE = 0.5;

/**
 * Decisiones mínimas (approved + rejected) antes de evaluar approval rate.
 * Menos de esto = fail-closed (datos insuficientes ≠ aprobado).
 */
export const REWARDS_MIN_APPROVAL_DECISIONS = 5;

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

/**
 * P0-1: los gates REWARDS_MIN_* ya no se leen desde env (antes fail-open si ausentes).
 * Política V1 fija en este archivo. Activación monetaria: solo REWARDS_PROGRAM_ACTIVE.
 */

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
