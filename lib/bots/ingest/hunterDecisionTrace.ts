/**
 * Hunter decision trace — explains WHY a machine candidate passed or failed.
 * Integrates existing Price Intel + DQE + S6.1 signals. Not a parallel scorer.
 */

import type { DealQualityDecision } from '@/lib/hunter/dealQuality';
import type { DealScore } from '@/lib/dealIntelligence';
import type { ParsedOfferMetadata } from './fetchParsedOfferMetadata';
import type { CandidateGateResult } from './candidateInsertGate';

export type HunterFinalLabel = 'GOOD' | 'BAD' | 'UNCERTAIN' | 'INVALID';

export type HunterDecisionTrace = {
  reportedDiscountPercent: number | null;
  verifiedDiscountPercent: number | null;
  /** Price Memory baseline status. */
  historicalBaseline: 'available' | 'INSUFFICIENT_HISTORY';
  /** habitual30d when historyReady; else null. */
  historicalBaselinePrice: number | null;
  currentPrice: number | null;
  /** Distinct prior observation days contributing to intel (excl. today merge). */
  historicalObservationCount: number | null;
  effectiveDiscountPercent: number | null;
  artificialListPrice: boolean;
  originalPriceClass: 'VERIFIED' | 'STORE_REPORTED' | 'INFERRED' | 'UNKNOWN';
  dqeDecision: string | null;
  dqeRecommendedAction: string | null;
  dealScore: number | null;
  s61Decision: string;
  s61ReasonCodes: string[];
  finalLabel: HunterFinalLabel;
  primaryReason: string;
  whyPassedOrFailed: string;
};

function originalPriceClass(meta: ParsedOfferMetadata | null): HunterDecisionTrace['originalPriceClass'] {
  const s = meta?.signals;
  if (!s) return 'UNKNOWN';
  if (s.suspectedArtificialListPrice === true) return 'INFERRED';
  if (s.historyReady === true && s.originalPriceProvenance === 'source_explicit') {
    return 'VERIFIED';
  }
  const p = (s.originalPriceProvenance ?? '').toLowerCase();
  if (p === 'listing_card' || p === 'source_explicit') return 'STORE_REPORTED';
  if (p === 'price_intel_derivation' || p === 'unknown' || !p) return 'UNKNOWN';
  return 'STORE_REPORTED';
}

/**
 * Map gate + DQE outcome to Lab-compatible final label (GOOD/BAD/UNCERTAIN/INVALID).
 * Mint eligibility remains S6.1 wouldInsert; this is the explainability layer.
 */
export function labelFromGateAndDqe(input: {
  gate: CandidateGateResult;
  dealQuality?: Pick<DealQualityDecision, 'decision' | 'recommendedAction'> | null;
}): HunterFinalLabel {
  if (input.gate.qualityDecision === 'INVALID') return 'INVALID';
  if (input.gate.qualityDecision === 'DUPLICATE') return 'BAD';
  if (input.gate.wouldInsert && input.gate.qualityDecision === 'VERIFIED_OPPORTUNITY') {
    return 'GOOD';
  }
  const codes = new Set(input.gate.reasonCodes);
  if (
    codes.has('DQE_DISCARD') ||
    codes.has('ARTIFICIAL_LIST_PRICE') ||
    codes.has('EFFECTIVE_DISCOUNT_UNVERIFIED') ||
    codes.has('NO_VERIFIED_DEAL')
  ) {
    return 'BAD';
  }
  if (
    codes.has('INSUFFICIENT_HISTORY') ||
    codes.has('DQE_POTENTIAL_ONLY') ||
    input.dealQuality?.recommendedAction === 'HUMAN_REVIEW' ||
    input.dealQuality?.decision === 'POTENTIAL_DEAL'
  ) {
    return 'UNCERTAIN';
  }
  if (input.gate.qualityDecision === 'SUPPRESSED') return 'BAD';
  return 'UNCERTAIN';
}

export function buildHunterDecisionTrace(input: {
  meta: ParsedOfferMetadata | null;
  gate: CandidateGateResult;
  dealQuality?: DealQualityDecision | null;
  dealScore?: DealScore | null;
}): HunterDecisionTrace {
  const s = input.meta?.signals;
  const reported =
    input.meta?.discountPercent != null && Number.isFinite(input.meta.discountPercent)
      ? Number(input.meta.discountPercent)
      : null;
  const eff = s?.effectiveDiscountPercent;
  const verified =
    typeof eff === 'number' && Number.isFinite(eff) && eff > 0 && s?.suspectedArtificialListPrice !== true
      ? eff
      : s?.historyReady === true && reported != null && s?.suspectedArtificialListPrice !== true
        ? reported
        : null;

  const finalLabel = labelFromGateAndDqe({
    gate: input.gate,
    dealQuality: input.dealQuality ?? null,
  });

  const primaryReason =
    input.gate.reasonCodes[0] ??
    input.dealQuality?.recommendedAction ??
    input.gate.reason;

  return {
    reportedDiscountPercent: reported,
    verifiedDiscountPercent: verified,
    historicalBaseline: s?.historyReady === true ? 'available' : 'INSUFFICIENT_HISTORY',
    historicalBaselinePrice:
      typeof s?.habitual30d === 'number' && Number.isFinite(s.habitual30d) ? s.habitual30d : null,
    currentPrice:
      input.meta?.discountPrice != null && Number.isFinite(input.meta.discountPrice)
        ? Number(input.meta.discountPrice)
        : null,
    historicalObservationCount:
      typeof s?.samples90d === 'number' && Number.isFinite(s.samples90d)
        ? Math.max(0, Math.trunc(s.samples90d))
        : s?.historyReady === true
          ? null
          : 0,
    effectiveDiscountPercent:
      typeof eff === 'number' && Number.isFinite(eff) ? eff : null,
    artificialListPrice: s?.suspectedArtificialListPrice === true,
    originalPriceClass: originalPriceClass(input.meta),
    dqeDecision: input.dealQuality?.decision ?? null,
    dqeRecommendedAction: input.dealQuality?.recommendedAction ?? null,
    dealScore: input.dealScore?.score ?? null,
    s61Decision: input.gate.qualityDecision,
    s61ReasonCodes: [...input.gate.reasonCodes],
    finalLabel,
    primaryReason,
    whyPassedOrFailed: input.gate.reason,
  };
}
