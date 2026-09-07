/**
 * Umbrales centralizados del Deal Verifier.
 * Los de score (auto/reject) vienen de BotIngestConfig en runtime.
 */
export const DEAL_VERIFIER_THRESHOLDS = {
  /** Cap de descuento absurdo (alineado con worker). */
  absurdDiscountCap: 85,
  /**
   * Si cardDiscount - effectiveDiscount ≥ este valor (ambos finitos),
   * gap sospechoso → no auto-approve (review).
   */
  discountGapReview: 25,
  /** Longitud mínima de título. */
  minTitleLength: 12,
} as const;

export function confidenceForDecision(
  decision: 'auto_approve' | 'review' | 'reject',
  score: number
): number {
  if (!Number.isFinite(score)) {
    if (decision === 'review') return 0.35;
    if (decision === 'reject') return 0;
    return 0.35;
  }
  if (decision === 'auto_approve') return Math.min(1, 0.7 + score / 400);
  if (decision === 'review') return Math.min(0.69, 0.35 + score / 300);
  return Math.max(0, Math.min(0.34, score / 200));
}
