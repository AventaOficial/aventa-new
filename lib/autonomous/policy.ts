import { DEAL_VERIFIER_THRESHOLDS } from '@/lib/verifier/thresholds';

/**
 * Política explícita del Autonomous Decision Engine.
 * Cambiar este string cuando las reglas de decisión cambien.
 */
export const AUTONOMOUS_DECISION_POLICY_V1 = 'AUTONOMOUS_DECISION_POLICY_V1';

/**
 * Thresholds reutilizados (no inventados). Justificación:
 *
 * - autoApproveMinScore default 78: `BOT_INGEST_AUTO_APPROVE_MIN_SCORE` en
 *   lib/bots/ingest/config.ts. El motor no hardcodea 78: usa el del caller.
 * - minAutoApproveConfidence 0.7: piso de confidenceForDecision('auto_approve')
 *   = min(1, 0.7 + score/400) en lib/verifier/thresholds.ts.
 * - minTitleLength / absurdDiscountCap / discountGapReview: DEAL_VERIFIER_THRESHOLDS.
 * - requireImage: BOT_INGEST_AUTO_APPROVE_REQUIRE_IMAGE (default true).
 * - availability unknown: checkAvailability() siempre es unknown (FASE 3, sin fetch).
 *   V1 no bloquea AUTO_APPROVE por unknown de disponibilidad; fail sí (agotado).
 */
export const AUTONOMOUS_POLICY_V1 = {
  id: AUTONOMOUS_DECISION_POLICY_V1,
  minAutoApproveConfidence: 0.7,
  minTitleLength: DEAL_VERIFIER_THRESHOLDS.minTitleLength,
  absurdDiscountCap: DEAL_VERIFIER_THRESHOLDS.absurdDiscountCap,
  discountGapReview: DEAL_VERIFIER_THRESHOLDS.discountGapReview,
  placeholderImage: '/placeholder.png',
} as const;
