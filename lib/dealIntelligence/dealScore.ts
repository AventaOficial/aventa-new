/**
 * DealScore v1 — wraps computeDealSignals. Does not replace DQE/Verifier.
 */

import { computeDealSignals, type DealSignals } from '@/lib/hunter/supply/dealSignals';
import type { OfferQualitySignals } from '@/lib/bots/ingest/offerQualitySignals';
import { DEAL_SCORE_VERSION } from './constants';
import { mayClaimHistoricalLow } from './priceObservation';
import type { DealScore, DealScoreReasonCode, EvidenceReference } from './types';

function mapReasonCodes(signals: DealSignals): DealScoreReasonCode[] {
  const codes: DealScoreReasonCode[] = [];
  for (const r of signals.reasons) {
    if (r.includes('habitual') || r.includes('recent_drop') || r.includes('strong_vs')) {
      codes.push('price_drop');
    } else if (r.includes('90d_low') || r.includes('historical')) {
      codes.push('historical_discount');
    } else if (r.includes('coupon')) {
      codes.push('coupon');
    } else if (r.includes('artificial') || r.includes('false')) {
      codes.push('suspicious_signal');
    } else if (r.includes('insufficient')) {
      codes.push('insufficient_evidence');
    } else if (r.includes('anomaly')) {
      codes.push('suspicious_signal');
    }
  }
  if (!signals.historyReady) codes.push('insufficient_evidence');
  return Array.from(new Set(codes));
}

export function buildDealScoreFromSignals(
  signals: DealSignals,
  opts?: {
    evidence?: EvidenceReference[];
    warnings?: string[];
    identityConfidence?: number;
    sourceConfidence?: number;
  },
): DealScore {
  const warnings = [...(opts?.warnings ?? [])];
  if (!signals.historyReady) warnings.push('insufficient_price_history');
  if (signals.suspectedArtificialListPrice) warnings.push('suspected_artificial_list_price');
  if (signals.missingSignals.includes('verified_coupon')) {
    /* missing coupon is normal — not a warning */
  }

  const historicalLowClaimed =
    mayClaimHistoricalLow(signals.historyReady) &&
    (signals.priceClass === 'historical_low' || signals.priceClass === 'near_historical_low');

  if (!mayClaimHistoricalLow(signals.historyReady) && signals.historicalLow90d != null) {
    // computeDealSignals already nulls lows when !historyReady — belt and suspenders
    warnings.push('historical_low_suppressed_without_evidence');
  }

  let confidence = 0.4;
  if (signals.historyReady) confidence += 0.35;
  if (signals.priceClass === 'historical_low' || signals.priceClass === 'near_historical_low') {
    confidence += 0.1;
  }
  if (signals.suspectedArtificialListPrice) confidence -= 0.25;
  if (opts?.identityConfidence != null) {
    confidence = confidence * 0.7 + opts.identityConfidence * 0.3;
  }
  if (opts?.sourceConfidence != null) {
    confidence = confidence * 0.85 + opts.sourceConfidence * 0.15;
  }
  confidence = Math.max(0, Math.min(1, confidence));

  const evidence: EvidenceReference[] = [
    ...(opts?.evidence ?? []),
    ...signals.reasons.map((r) => ({ kind: 'deal_signal_reason', ref: r })),
  ];

  return {
    score: signals.dealScore,
    confidence,
    reasons: signals.reasons,
    reasonCodes: mapReasonCodes(signals),
    warnings,
    evidence,
    version: DEAL_SCORE_VERSION,
    historicalLowClaimed,
  };
}

/** Deterministic entry: same inputs → same DealScore. */
export function computeDealScore(input: {
  meta: {
    discountPrice?: number | null;
    originalPrice?: number | null;
    discountPercent?: number | null;
  };
  signals?: OfferQualitySignals | null;
  couponAmount?: number | null;
  evidence?: EvidenceReference[];
  identityConfidence?: number;
  sourceConfidence?: number;
}): DealScore {
  const signals = computeDealSignals({
    meta: input.meta,
    signals: input.signals,
    couponAmount: input.couponAmount,
  });
  return buildDealScoreFromSignals(signals, {
    evidence: input.evidence,
    identityConfidence: input.identityConfidence,
    sourceConfidence: input.sourceConfidence,
  });
}
