import type { ParsedOfferMetadata } from './fetchParsedOfferMetadata';
import type { OfferQualitySignals } from './offerQualitySignals';
import type { BotIngestConfig } from './config';

export type ScoreBreakdown = {
  discount: number;
  popularity: number;
  rating: number;
  category: number;
  priceAppeal: number;
  historical: number;
  total: number;
};

export type ScoreDecision = 'auto_approve' | 'pending' | 'reject';

export type ScoreResult = {
  breakdown: ScoreBreakdown;
  decision: ScoreDecision;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function categoryTechScore(categoryId: string | null | undefined, techIds: Set<string>): number {
  if (!categoryId) return 35;
  if (techIds.has(categoryId)) return 100;
  if (/MLM1[0-9]{3}/.test(categoryId)) return 55;
  return 35;
}

/**
 * Puntuación 0–100 y decisión de publicación.
 * `reject` = no insertar (por debajo del umbral mínimo operativo).
 */
export function scoreIngestCandidate(
  meta: ParsedOfferMetadata,
  signals: OfferQualitySignals | undefined,
  config: BotIngestConfig
): ScoreResult {
  const d = clamp(meta.discountPercent, 0, 80);
  const discountPts = clamp((d / 80) * 100, 0, 100);

  const sold = signals?.soldQuantity ?? null;
  let popularityPts = 40;
  if (sold != null && sold > 0) {
    popularityPts = clamp(15 + Math.log10(1 + sold) * 28, 0, 100);
  }

  const avg = signals?.ratingAverage ?? null;
  const count = signals?.ratingCount ?? null;
  let ratingPts = 55;
  if (avg != null && count != null && count >= config.minRatingReviewsCount) {
    ratingPts = clamp(((avg - 3) / 2) * 100, 0, 100);
  } else if (avg != null && count != null && count > 0 && count < config.minRatingReviewsCount) {
    ratingPts = 50 + avg * 6;
    ratingPts = clamp(ratingPts, 0, 85);
  }

  const catPts = categoryTechScore(signals?.categoryId ?? null, config.techCategoryIdSet);

  const price = meta.discountPrice;
  let priceAppeal = 50;
  if (price > 0 && price < 500) priceAppeal = 72;
  else if (price >= 500 && price < 5000) priceAppeal = 88;
  else if (price >= 5000 && price < 25000) priceAppeal = 70;
  else if (price >= 25000) priceAppeal = 55;

  let historicalPts = 50;
  const vsLowest90d = signals?.priceVsLowest90dPct ?? null;
  if (vsLowest90d != null) {
    if (vsLowest90d <= 3) historicalPts = 100;
    else if (vsLowest90d <= 8) historicalPts = 85;
    else if (vsLowest90d <= 15) historicalPts = 65;
    else if (vsLowest90d <= 25) historicalPts = 45;
    else historicalPts = 20;
  }
  if (signals?.suspectedArtificialListPrice) {
    historicalPts = Math.min(historicalPts, 10);
  }

  const w = config.scoreWeights;
  const total = clamp(
    discountPts * w.discount +
      popularityPts * w.popularity +
      ratingPts * w.rating +
      catPts * w.category +
      ((priceAppeal * 0.7) + historicalPts * 0.3) * w.priceAppeal,
    0,
    100
  );

  const breakdown: ScoreBreakdown = {
    discount: Math.round(discountPts),
    popularity: Math.round(popularityPts),
    rating: Math.round(ratingPts),
    category: Math.round(catPts),
    priceAppeal: Math.round(priceAppeal),
    historical: Math.round(historicalPts),
    total: Math.round(total),
  };

  let decision: ScoreDecision = 'pending';
  if (total < config.rejectBelowScore) decision = 'reject';
  else if (total >= config.autoApproveMinScore) decision = 'auto_approve';
  else decision = 'pending';

  if (
    decision === 'reject' &&
    config.forcePendingMinScore != null &&
    total >= config.forcePendingMinScore
  ) {
    decision = 'pending';
  }

  return { breakdown, decision };
}
