/** Ofertas aprobadas que deben alcanzar el umbral de votos (cada una). */
export const COMMISSION_REQUIRED_OFFERS = 15;
/** Votos positivos mínimos por oferta (columna upvotes_count). */
export const COMMISSION_MIN_UPVOTES_PER_OFFER = 120;
/** Versión de términos al aceptar el programa (debe alinearse con /terms §8). */
export const COMMISSION_TERMS_VERSION = '2026-08-14';

/**
 * % del ingreso afiliado **atribuible** que va al creador (4000 = 40%).
 * Política: docs/POLITICA_COMISIONES_CREADORES.md
 */
export const COMMISSION_DEFAULT_CREATOR_SHARE_BPS = 4000;

/** Mínimo de payout por transferencia (centavos MXN). Bajo esto se acumula / se marca below_minimum. */
export const COMMISSION_MIN_PAYOUT_CENTS = 20_000;

/** Días de retención tras el periodo antes de liquidar (devoluciones de red). */
export const COMMISSION_PAYOUT_HOLD_DAYS = 14;

/** Reglas de reparto mensual (modo dual: no romper pools legacy). */
export const COMMISSION_ALLOCATION_RULES = [
  'attributed_revenue',
  'points_per_qualifying_offer',
] as const;

export type CommissionAllocationRule = (typeof COMMISSION_ALLOCATION_RULES)[number];

/** Default de nuevos pools: pago por comisión atribuida. */
export const COMMISSION_DEFAULT_ALLOCATION_RULE: CommissionAllocationRule = 'attributed_revenue';
