/**
 * S6.4 — Worker_card score diagnostics (read-only / counterfactual).
 *
 * Does NOT mutate production scoring.
 * Does NOT change weights, thresholds, or gate policy.
 *
 * worker_card effect in scoreIngestCandidate (when sold/rating missing):
 *   popularityPts: 58 vs baseline 40  (+18 component pts)
 *   ratingPts:     60 vs baseline 55  (+5 component pts)
 * DealScore (computeDealSignals) does not read listingTypeId / worker_card.
 */

import type { BotIngestConfig } from './config';
import type { ParsedOfferMetadata } from './fetchParsedOfferMetadata';
import type { OfferQualitySignals } from './offerQualitySignals';
import {
  scoreIngestCandidate,
  type ScoreBreakdown,
  type ScoreDecision,
  type ScoreResult,
} from './scoreIngestCandidate';
import { computeDealScore, type DealScore } from '@/lib/dealIntelligence';
import {
  evaluateMachineCandidateGate,
  type CandidateGateResult,
} from './candidateInsertGate';

export type SignalClass = 'economic' | 'quality' | 'source' | 'popularity_heuristic';

export type ClassifiedSignal = {
  key: string;
  class: SignalClass;
  value: string | number | boolean | null;
  notes?: string;
};

export type WorkerCardContribution = {
  present: boolean;
  /** True when worker_card defaults actually applied (no sold / no usable rating). */
  popularityBoostApplied: boolean;
  ratingBoostApplied: boolean;
  popularityPtsActual: number;
  popularityPtsWithoutWorkerCard: number;
  ratingPtsActual: number;
  ratingPtsWithoutWorkerCard: number;
  /** Approximate contribution to weighted total (diagnostic only). */
  estimatedTotalDelta: number;
};

export type ScoreDecomposition = {
  verifierScore: number;
  verifierDecision: ScoreDecision;
  verifierBreakdown: ScoreBreakdown;
  dealScore: number;
  dealScoreConfidence: number | null;
  dealScoreVersion: string | null;
  dealHistoryReady: boolean;
  economicSignals: ClassifiedSignal[];
  qualitySignals: ClassifiedSignal[];
  sourceSignals: ClassifiedSignal[];
  heuristicSignals: ClassifiedSignal[];
  workerCard: WorkerCardContribution;
  counterfactual: {
    verifierScoreWithoutWorkerCard: number;
    verifierDecisionWithoutWorkerCard: ScoreDecision;
    /** Same DealScore — worker_card does not enter DealScore. */
    dealScoreUnchanged: true;
    dealScore: number;
  };
  gate: {
    qualityDecision: CandidateGateResult['qualityDecision'];
    wouldInsert: boolean;
    reasonCodes: CandidateGateResult['reasonCodes'];
    evidenceLevel: CandidateGateResult['evidenceLevel'];
  };
};

function stripWorkerCardListingType(
  signals: OfferQualitySignals | null | undefined,
): OfferQualitySignals | undefined {
  if (!signals) return undefined;
  const next: OfferQualitySignals = { ...signals };
  if (next.listingTypeId === 'worker_card') {
    delete next.listingTypeId;
  }
  return next;
}

/**
 * Classify existing signals for diagnostics. No new signals invented.
 */
export function classifyCandidateSignals(input: {
  meta: ParsedOfferMetadata;
  signals?: OfferQualitySignals | null;
}): {
  economic: ClassifiedSignal[];
  quality: ClassifiedSignal[];
  source: ClassifiedSignal[];
  heuristic: ClassifiedSignal[];
} {
  const s = input.signals ?? input.meta.signals ?? null;
  const economic: ClassifiedSignal[] = [
    { key: 'salePrice', class: 'economic', value: input.meta.discountPrice },
    { key: 'originalPrice', class: 'economic', value: input.meta.originalPrice },
    { key: 'discountPercent', class: 'economic', value: input.meta.discountPercent },
    {
      key: 'effectiveDiscountPercent',
      class: 'economic',
      value: s?.effectiveDiscountPercent ?? null,
    },
    { key: 'historyReady', class: 'economic', value: s?.historyReady ?? null },
    { key: 'priceLowest90d', class: 'economic', value: s?.priceLowest90d ?? null },
    { key: 'habitual30d', class: 'economic', value: s?.habitual30d ?? null },
    {
      key: 'savingsVsHabitualPct',
      class: 'economic',
      value: s?.savingsVsHabitualPct ?? null,
    },
    {
      key: 'priceVsLowest90dPct',
      class: 'economic',
      value: s?.priceVsLowest90dPct ?? null,
    },
    {
      key: 'suspectedArtificialListPrice',
      class: 'economic',
      value: s?.suspectedArtificialListPrice ?? null,
    },
  ];
  const quality: ClassifiedSignal[] = [
    {
      key: 'imagePresent',
      class: 'quality',
      value: Boolean(input.meta.imageUrl?.trim()),
    },
    {
      key: 'imageProvenance',
      class: 'quality',
      value: s?.imageProvenance ?? null,
    },
    {
      key: 'titleLength',
      class: 'quality',
      value: input.meta.title?.trim().length ?? 0,
    },
    { key: 'store', class: 'quality', value: input.meta.store ?? null },
    { key: 'categoryId', class: 'quality', value: s?.categoryId ?? null },
    { key: 'condition', class: 'quality', value: s?.condition ?? null },
  ];
  const source: ClassifiedSignal[] = [
    {
      key: 'originalPriceProvenance',
      class: 'source',
      value: s?.originalPriceProvenance ?? null,
    },
    {
      key: 'cardDiscountSource',
      class: 'source',
      value: s?.cardDiscountSource ?? null,
    },
    {
      key: 'currentPriceProvenance',
      class: 'source',
      value: s?.currentPriceProvenance ?? null,
    },
    {
      key: 'discountPercentProvenance',
      class: 'source',
      value: s?.discountPercentProvenance ?? null,
    },
  ];
  const heuristic: ClassifiedSignal[] = [
    {
      key: 'listingTypeId',
      class: 'popularity_heuristic',
      value: s?.listingTypeId ?? null,
      notes:
        s?.listingTypeId === 'worker_card'
          ? 'May raise popularity/rating defaults when sold/rating missing'
          : undefined,
    },
    { key: 'soldQuantity', class: 'popularity_heuristic', value: s?.soldQuantity ?? null },
    { key: 'ratingAverage', class: 'popularity_heuristic', value: s?.ratingAverage ?? null },
    { key: 'ratingCount', class: 'popularity_heuristic', value: s?.ratingCount ?? null },
  ];
  return { economic, quality, source, heuristic };
}

function workerCardContributionFrom(
  actual: ScoreResult,
  counterfactual: ScoreResult,
  signals: OfferQualitySignals | null | undefined,
  weights: BotIngestConfig['scoreWeights'],
): WorkerCardContribution {
  const present = signals?.listingTypeId === 'worker_card';
  const soldMissing = signals?.soldQuantity == null || signals.soldQuantity <= 0;
  const ratingMissing =
    signals?.ratingAverage == null ||
    signals?.ratingCount == null ||
    signals.ratingCount <= 0;
  const popularityBoostApplied = present && soldMissing;
  const ratingBoostApplied = present && ratingMissing;
  const popDelta = actual.breakdown.popularity - counterfactual.breakdown.popularity;
  const ratDelta = actual.breakdown.rating - counterfactual.breakdown.rating;
  const estimatedTotalDelta =
    Math.round((popDelta * weights.popularity + ratDelta * weights.rating) * 100) / 100;
  return {
    present,
    popularityBoostApplied,
    ratingBoostApplied,
    popularityPtsActual: actual.breakdown.popularity,
    popularityPtsWithoutWorkerCard: counterfactual.breakdown.popularity,
    ratingPtsActual: actual.breakdown.rating,
    ratingPtsWithoutWorkerCard: counterfactual.breakdown.rating,
    estimatedTotalDelta,
  };
}

/**
 * Full diagnostic decomposition. Gate uses ACTUAL verifier only.
 * Counterfactual is computed separately and never fed into the gate.
 */
export function decomposeIngestScores(input: {
  meta: ParsedOfferMetadata;
  config: BotIngestConfig;
  pdpBlocked?: boolean | null;
  requireOriginalPrice?: boolean;
}): ScoreDecomposition {
  const signals = input.meta.signals ?? null;
  const actual = scoreIngestCandidate(input.meta, signals ?? undefined, input.config);

  const signalsSansWorker = stripWorkerCardListingType(signals);
  const counterfactual = scoreIngestCandidate(
    input.meta,
    signalsSansWorker,
    input.config,
  );

  const deal = computeDealScore({
    meta: {
      discountPrice: input.meta.discountPrice,
      originalPrice: input.meta.originalPrice,
      discountPercent: input.meta.discountPercent,
    },
    signals,
  });

  // Gate always uses actual verifier — never counterfactual.
  const gate = evaluateMachineCandidateGate({
    url: input.meta.canonicalUrl,
    meta: input.meta,
    config: input.config,
    verifierDecision: actual.decision,
    verifierReasons:
      actual.decision === 'reject'
        ? [`score ${actual.breakdown.total} < ${input.config.rejectBelowScore}`]
        : [],
    dealScore: deal,
    pdpBlocked: input.pdpBlocked,
    requireOriginalPrice: input.requireOriginalPrice,
  });

  const classified = classifyCandidateSignals({ meta: input.meta, signals });
  const workerCard = workerCardContributionFrom(
    actual,
    counterfactual,
    signals,
    input.config.scoreWeights,
  );

  return {
    verifierScore: actual.breakdown.total,
    verifierDecision: actual.decision,
    verifierBreakdown: actual.breakdown,
    dealScore: deal.score,
    dealScoreConfidence: deal.confidence,
    dealScoreVersion: deal.version,
    dealHistoryReady: signals?.historyReady === true,
    economicSignals: classified.economic,
    qualitySignals: classified.quality,
    sourceSignals: classified.source,
    heuristicSignals: classified.heuristic,
    workerCard,
    counterfactual: {
      verifierScoreWithoutWorkerCard: counterfactual.breakdown.total,
      verifierDecisionWithoutWorkerCard: counterfactual.decision,
      dealScoreUnchanged: true,
      dealScore: deal.score,
    },
    gate: {
      qualityDecision: gate.qualityDecision,
      wouldInsert: gate.wouldInsert,
      reasonCodes: gate.reasonCodes,
      evidenceLevel: gate.evidenceLevel,
    },
  };
}

/** Safe row for reports — no secrets / HTML. */
export function toWorkerCardDiagnosticRow(
  sourceEventId: string | null,
  url: string,
  decomp: ScoreDecomposition,
): Record<string, unknown> {
  return {
    sourceEventId,
    urlHost: (() => {
      try {
        return new URL(url).hostname;
      } catch {
        return null;
      }
    })(),
    dealScore: decomp.dealScore,
    verifierScore: decomp.verifierScore,
    verifierDecision: decomp.verifierDecision,
    workerCardPresent: decomp.workerCard.present,
    workerCardEstimatedDelta: decomp.workerCard.estimatedTotalDelta,
    popularityPtsActual: decomp.workerCard.popularityPtsActual,
    popularityPtsWithoutWorkerCard: decomp.workerCard.popularityPtsWithoutWorkerCard,
    ratingPtsActual: decomp.workerCard.ratingPtsActual,
    ratingPtsWithoutWorkerCard: decomp.workerCard.ratingPtsWithoutWorkerCard,
    counterfactualVerifierScore: decomp.counterfactual.verifierScoreWithoutWorkerCard,
    counterfactualVerifierDecision: decomp.counterfactual.verifierDecisionWithoutWorkerCard,
    qualityDecision: decomp.gate.qualityDecision,
    wouldInsert: decomp.gate.wouldInsert,
    evidenceLevel: decomp.gate.evidenceLevel,
    historyReady: decomp.dealHistoryReady,
    originalPriceProvenance:
      decomp.sourceSignals.find((s) => s.key === 'originalPriceProvenance')?.value ?? null,
    cardDiscountSource:
      decomp.sourceSignals.find((s) => s.key === 'cardDiscountSource')?.value ?? null,
    imagePresent:
      decomp.qualitySignals.find((s) => s.key === 'imagePresent')?.value ?? null,
  };
}

export type { DealScore };
