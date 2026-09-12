/**
 * Reglas de qualification. Independientes de DEAL_VERIFIER_THRESHOLDS.
 * No bajan ni alteran el Verifier / Autonomous.
 */
export const DEAL_QUALIFICATION_RULES = {
  /** original debe ser estrictamente mayor que current para contar como descuento. */
  requireOriginalStrictlyGreater: true,
  /** Price Intel nunca puede producir VERIFIED_DEAL por sí solo. */
  priceIntelCannotVerify: true,
} as const;
