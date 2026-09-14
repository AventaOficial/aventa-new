/**
 * Umbrales V1 del Deal Quality Engine.
 * Alineados con score histórico (habitual ≥12/20) y ML_PRICE_MIN_HISTORY_DAYS.
 * No bajan umbrales de qualification/verifier.
 */
export const DEAL_QUALITY_POLICY_V1 = 'deal_quality_v1' as const;

export const DEAL_QUALITY_RULES_V1 = {
  /** Ahorro vs habitual para señal positiva. */
  belowHabitualPct: 12,
  /** Ahorro vs habitual fuerte. */
  belowHabitualStrongPct: 20,
  /** Cerca del mínimo 90d (gap % sobre el mínimo). */
  nearHistoricalLowPct: 5,
  /** samples90d informativos cuando historyReady no viene. */
  minHistorySamplesHint: 4,
} as const;
