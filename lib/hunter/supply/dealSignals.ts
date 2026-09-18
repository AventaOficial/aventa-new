/**
 * Deal Signal Engine — señales derivadas de datos YA verificados.
 * No inventa precios efectivos ni historical_low sin historial suficiente.
 * Deal Score ≠ Discount % de etiqueta.
 */

import type { OfferQualitySignals } from '@/lib/bots/ingest/offerQualitySignals';
import { ML_PRICE_MIN_HISTORY_DAYS } from '@/lib/bots/ingest/mlPriceEngine';

export type DealPriceClass =
  | 'historical_low'
  | 'near_historical_low'
  | 'recent_drop'
  | 'normal'
  | 'false_discount'
  | 'insufficient_evidence'
  | 'unknown';

export type DealLaneHint = 'day_to_day' | 'top_deals' | 'anomaly_review' | 'none';

export type DealSignals = {
  currentPrice: number | null;
  originalPrice: number | null;
  labelDiscountPercent: number | null;
  effectiveDiscountPercent: number | null;
  historicalLow90d: number | null;
  historicalHabitual30d: number | null;
  priceVsLowest90dPct: number | null;
  savingsVsHabitualPct: number | null;
  historyReady: boolean;
  minHistoryDaysRequired: number;
  suspectedArtificialListPrice: boolean;
  priceClass: DealPriceClass;
  dealScore: number;
  laneHint: DealLaneHint;
  missingSignals: string[];
  reasons: string[];
};

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Calcula señales de deal a partir de meta + quality signals existentes.
 * Si el historial es insuficiente → INSUFFICIENT_EVIDENCE (no inventa low).
 */
export function computeDealSignals(input: {
  meta: {
    discountPrice?: number | null;
    originalPrice?: number | null;
    discountPercent?: number | null;
  };
  signals?: OfferQualitySignals | null;
  couponAmount?: number | null;
}): DealSignals {
  const meta = input.meta;
  const s = input.signals ?? null;
  const missing: string[] = [];
  const reasons: string[] = [];

  const currentPrice =
    typeof meta.discountPrice === 'number' && Number.isFinite(meta.discountPrice)
      ? meta.discountPrice
      : null;
  const originalPrice =
    typeof meta.originalPrice === 'number' && Number.isFinite(meta.originalPrice)
      ? meta.originalPrice
      : null;
  const labelDiscountPercent =
    typeof meta.discountPercent === 'number' && Number.isFinite(meta.discountPercent)
      ? meta.discountPercent
      : null;

  const historyReady = s?.historyReady === true;
  const artificial = s?.suspectedArtificialListPrice === true;
  const effective =
    typeof s?.effectiveDiscountPercent === 'number' && Number.isFinite(s.effectiveDiscountPercent)
      ? s.effectiveDiscountPercent
      : null;
  const lowest90d =
    typeof s?.priceLowest90d === 'number' && Number.isFinite(s.priceLowest90d)
      ? s.priceLowest90d
      : null;
  const habitual =
    typeof s?.habitual30d === 'number' && Number.isFinite(s.habitual30d) ? s.habitual30d : null;
  const vsLow =
    typeof s?.priceVsLowest90dPct === 'number' && Number.isFinite(s.priceVsLowest90dPct)
      ? s.priceVsLowest90dPct
      : null;
  const vsHab =
    typeof s?.savingsVsHabitualPct === 'number' && Number.isFinite(s.savingsVsHabitualPct)
      ? s.savingsVsHabitualPct
      : null;

  if (!historyReady) missing.push('price_history');
  if (currentPrice == null) missing.push('current_price');
  if (effective == null && !historyReady) missing.push('effective_discount');

  // Cupón: solo si el caller aporta monto verificado (no inventamos).
  const coupon =
    typeof input.couponAmount === 'number' &&
    Number.isFinite(input.couponAmount) &&
    input.couponAmount > 0
      ? input.couponAmount
      : null;
  if (coupon == null) missing.push('verified_coupon');

  let priceClass: DealPriceClass = 'unknown';
  if (currentPrice == null) {
    priceClass = 'unknown';
    reasons.push('missing_current_price');
  } else if (!historyReady) {
    priceClass = 'insufficient_evidence';
    reasons.push('insufficient_price_history');
    if (artificial) {
      priceClass = 'false_discount';
      reasons.push('artificial_list_price_without_history');
    }
  } else if (artificial && (effective == null || effective <= 0)) {
    priceClass = 'false_discount';
    reasons.push('artificial_list_price');
  } else if (vsLow != null && vsLow <= 0) {
    priceClass = 'historical_low';
    reasons.push('at_or_below_90d_low');
  } else if (vsLow != null && vsLow <= 5) {
    priceClass = 'near_historical_low';
    reasons.push('near_90d_low');
  } else if (vsHab != null && vsHab >= 20) {
    priceClass = 'recent_drop';
    reasons.push('strong_vs_habitual');
  } else if (vsHab != null && vsHab >= 12) {
    priceClass = 'recent_drop';
    reasons.push('moderate_vs_habitual');
  } else {
    priceClass = 'normal';
    reasons.push('within_normal_band');
  }

  // Deal score: calidad-ajustada, no % de etiqueta.
  let score = 0;
  if (historyReady && effective != null && effective > 0) {
    score += Math.min(40, effective * 1.2);
  } else if (labelDiscountPercent != null && labelDiscountPercent > 0 && !artificial) {
    score += Math.min(15, labelDiscountPercent * 0.4);
    reasons.push('label_discount_weak_without_history');
  }
  if (priceClass === 'historical_low') score += 30;
  else if (priceClass === 'near_historical_low') score += 22;
  else if (priceClass === 'recent_drop') score += 14;
  if (vsHab != null && vsHab > 0) score += Math.min(15, vsHab * 0.5);
  if (coupon != null && currentPrice != null) {
    const couponPct = (coupon / currentPrice) * 100;
    score += Math.min(10, couponPct * 0.5);
    reasons.push('verified_coupon_applied');
  }
  if (artificial) score = Math.min(score, 25);
  if (priceClass === 'insufficient_evidence') score = Math.min(score, 35);
  if (priceClass === 'false_discount') score = Math.min(score, 15);

  let laneHint: DealLaneHint = 'none';
  const extremeDrop =
    vsHab != null &&
    vsHab >= 35 &&
    currentPrice != null &&
    habitual != null &&
    currentPrice < habitual * 0.55;

  if (priceClass === 'false_discount' || (artificial && (effective ?? 0) <= 0)) {
    laneHint = 'none';
  } else if (extremeDrop && historyReady) {
    laneHint = 'anomaly_review';
    reasons.push('anomaly_candidate_needs_human');
  } else if (priceClass === 'historical_low' || (score >= 70 && historyReady)) {
    laneHint = 'top_deals';
  } else if (score >= 35 || priceClass === 'near_historical_low' || priceClass === 'recent_drop') {
    laneHint = 'day_to_day';
  }

  return {
    currentPrice,
    originalPrice,
    labelDiscountPercent,
    effectiveDiscountPercent: effective,
    historicalLow90d: historyReady ? lowest90d : null,
    historicalHabitual30d: historyReady ? habitual : null,
    priceVsLowest90dPct: historyReady ? vsLow : null,
    savingsVsHabitualPct: historyReady ? vsHab : null,
    historyReady,
    minHistoryDaysRequired: ML_PRICE_MIN_HISTORY_DAYS,
    suspectedArtificialListPrice: artificial,
    priceClass,
    dealScore: clampScore(score),
    laneHint,
    missingSignals: missing,
    reasons,
  };
}

/** Prioridad de moderación sugerida (1=alta). No publica. */
export const DEAL_SCORE_REVIEW_CUTOFFS = {
  /** top_deals lane + score — highest review urgency among scored bots */
  top: 70,
  /** elevated opportunity — prefer earlier review */
  elevated: 55,
  /** below this → weak opportunity signal */
  mid: 35,
} as const;

/** Minimum DealScore confidence to allow priority upgrade (same floor as probable identity). */
export const DEAL_SCORE_PRIORITY_MIN_CONFIDENCE = 0.5;

export function moderationPriorityFromDealSignals(signals: DealSignals): 1 | 2 | 3 | 4 {
  if (signals.laneHint === 'anomaly_review') return 1;
  if (signals.laneHint === 'top_deals' && signals.dealScore >= DEAL_SCORE_REVIEW_CUTOFFS.top) return 1;
  if (signals.dealScore >= DEAL_SCORE_REVIEW_CUTOFFS.elevated) return 2;
  if (signals.dealScore >= DEAL_SCORE_REVIEW_CUTOFFS.mid) return 3;
  return 4;
}
