/**
 * Explainable opportunity score — deterministic weights from evidence only.
 *
 * Weights (documented, sum to 1.0 before scaling to 0–100):
 *   priceEvidence    0.35
 *   discountMagnitude 0.30
 *   historySupport   0.20
 *   qualitySignals   0.15
 */

import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import { isLowQualityTitle } from '@/lib/bots/ingest/isLowQualityTitle';
import { isBadgeOnlyCardEvidence } from '@/lib/bots/ingest/mlWorkerPendingGate';
import type {
  OpportunityDecision,
  OpportunityEvidence,
  OpportunityReasonCode,
  OpportunityScore,
} from './types';

export const SCORE_WEIGHTS = {
  priceEvidence: 0.35,
  discountMagnitude: 0.3,
  historySupport: 0.2,
  qualitySignals: 0.15,
} as const;

export const DEFAULT_MIN_DISCOUNT_PERCENT = 20;

export type ScoreOpportunityInput = {
  evidence: OpportunityEvidence;
  title?: string | null;
  minDiscountPercent?: number;
  pdpBlocked?: boolean | null;
  /** Optional ingest config for title blocklist checks (reuses S6 rules). */
  ingestConfig?: Pick<BotIngestConfig, 'titleBlocklistGenericRe' | 'titleBlocklistSpamRe'>;
};

const DEFAULT_TITLE_CONFIG: Pick<
  BotIngestConfig,
  'titleBlocklistGenericRe' | 'titleBlocklistSpamRe'
> = {
  titleBlocklistGenericRe: null,
  titleBlocklistSpamRe: null,
};

function titleFailsQuality(
  title: string,
  ingestConfig?: ScoreOpportunityInput['ingestConfig'],
): boolean {
  return isLowQualityTitle(title, {
    ...DEFAULT_TITLE_CONFIG,
    ...ingestConfig,
  } as BotIngestConfig);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function evidenceLevelScore(level: OpportunityEvidence['evidenceLevel']): number {
  switch (level) {
    case 'history_backed':
      return 1;
    case 'api_verified':
      return 0.85;
    case 'strong_card':
      return 0.65;
    case 'weak_card':
      return 0.25;
    default:
      return 0;
  }
}

function discountComponent(discountPercent: number | null, minRequired: number): number {
  if (discountPercent == null || discountPercent <= 0) return 0;
  if (discountPercent < minRequired) return clamp01(discountPercent / minRequired) * 0.4;
  const capped = Math.min(discountPercent, 60);
  return clamp01(0.5 + (capped - minRequired) / (60 - minRequired) * 0.5);
}

function qualityComponent(evidence: OpportunityEvidence): number {
  let q = 0.4;
  if (evidence.hasImage) q += 0.2;
  const sold = evidence.signals.soldQuantity;
  if (typeof sold === 'number' && sold >= 50) q += 0.15;
  const rating = evidence.signals.ratingAverage;
  if (typeof rating === 'number' && rating >= 4) q += 0.15;
  if (evidence.suspectedArtificialListPrice) q -= 0.35;
  return clamp01(q);
}

function deriveEvidenceLevel(evidence: OpportunityEvidence): OpportunityEvidence['evidenceLevel'] {
  if (evidence.historyReady && evidence.referencePrice?.trusted) return 'history_backed';
  if (evidence.referencePrice?.kind === 'api_quote' && evidence.referencePrice.trusted) {
    return 'api_verified';
  }
  const card = (evidence.signals.cardDiscountSource ?? '').trim().toLowerCase();
  const orig = (evidence.signals.originalPriceProvenance ?? '').trim().toLowerCase();
  if (isBadgeOnlyCardEvidence(card)) return 'weak_card';
  if (orig === 'listing_card' || card === 'card_strikethrough') return 'strong_card';
  if (evidence.referencePrice?.trusted) return 'strong_card';
  if (card || evidence.referencePrice) return 'weak_card';
  return 'none';
}

function collectReasonCodes(input: ScoreOpportunityInput): OpportunityReasonCode[] {
  const codes: OpportunityReasonCode[] = [];
  const { evidence } = input;
  const minDiscount = input.minDiscountPercent ?? DEFAULT_MIN_DISCOUNT_PERCENT;
  const card = evidence.signals.cardDiscountSource ?? null;

  if (evidence.salePrice.amount == null || evidence.salePrice.amount <= 0) {
    codes.push('INVALID_SALE_PRICE');
    return codes;
  }

  if (!evidence.productFingerprint) {
    codes.push('MISSING_IDENTITY');
  }

  if (isBadgeOnlyCardEvidence(card)) {
    codes.push('BADGE_RECONSTRUCTED', 'REFERENCE_UNTRUSTED');
  }

  if (!evidence.referencePrice || evidence.referencePrice.amount == null) {
    codes.push('REFERENCE_UNAVAILABLE');
  } else if (!evidence.referencePrice.trusted) {
    codes.push('REFERENCE_UNTRUSTED');
  }

  if (
    evidence.referencePrice?.trusted &&
    evidence.discountPercent != null &&
    evidence.discountPercent < minDiscount
  ) {
    codes.push('DISCOUNT_BELOW_THRESHOLD');
  }

  if (evidence.suspectedArtificialListPrice) {
    codes.push('ARTIFICIAL_LIST_PRICE');
  }

  if (
    evidence.referencePrice?.trusted === false &&
    candidateDeclaredDiscountRejected(evidence, card)
  ) {
    codes.push('FABRICATED_DISCOUNT');
  }

  if (input.title && titleFailsQuality(input.title, input.ingestConfig)) {
    codes.push('LOW_QUALITY_TITLE');
  }

  const level = evidence.evidenceLevel;
  if (level === 'history_backed') codes.push('HISTORY_BACKED');
  else if (level === 'api_verified') codes.push('API_VERIFIED');
  else if (level === 'strong_card') codes.push('STRONG_CARD_EVIDENCE');
  else if (level === 'weak_card') codes.push('WEAK_CARD_EVIDENCE');
  else if (level === 'none' && !codes.includes('REFERENCE_UNAVAILABLE')) {
    codes.push('PARTIAL_EVIDENCE');
  }

  return codes;
}

function candidateDeclaredDiscountRejected(
  evidence: OpportunityEvidence,
  cardSource: string | null | undefined,
): boolean {
  if (!isBadgeOnlyCardEvidence(cardSource)) return false;
  if (evidence.discountPercent != null && evidence.discountPercent > 0) return true;
  const badge = evidence.signals.cardBadgePercent;
  return typeof badge === 'number' && Number.isFinite(badge) && badge > 0;
}

export function deriveOpportunityDecision(
  score: OpportunityScore,
  evidence: OpportunityEvidence,
  minDiscountPercent: number,
): OpportunityDecision {
  const codes = new Set(score.reasonCodes);
  if (
    codes.has('INVALID_SALE_PRICE') ||
    codes.has('BADGE_RECONSTRUCTED') ||
    codes.has('FABRICATED_DISCOUNT') ||
    codes.has('ARTIFICIAL_LIST_PRICE') ||
    codes.has('LOW_QUALITY_TITLE')
  ) {
    return 'REJECT';
  }

  const hasTrustedReference =
    evidence.referencePrice?.trusted === true && evidence.referencePrice.amount != null;
  const discountOk =
    evidence.discountPercent != null && evidence.discountPercent >= minDiscountPercent;

  if (hasTrustedReference && discountOk && evidence.evidenceLevel !== 'none') {
    if (evidence.evidenceLevel === 'weak_card' && !evidence.historyReady) {
      return 'PARTIAL';
    }
    return 'OPPORTUNITY';
  }

  if (hasTrustedReference || evidence.evidenceLevel !== 'none') {
    return 'PARTIAL';
  }

  return 'REJECT';
}

export function scoreOpportunity(input: ScoreOpportunityInput): OpportunityScore {
  const minDiscount = input.minDiscountPercent ?? DEFAULT_MIN_DISCOUNT_PERCENT;
  const evidence: OpportunityEvidence = {
    ...input.evidence,
    evidenceLevel: input.evidence.evidenceLevel || deriveEvidenceLevel(input.evidence),
  };

  const reasonCodes = collectReasonCodes({ ...input, evidence });

  const priceEvidence = evidenceLevelScore(evidence.evidenceLevel);
  const discountMagnitude = discountComponent(evidence.discountPercent, minDiscount);
  const historySupport = evidence.historyReady ? 1 : evidence.signals.historyReady ? 0.5 : 0;
  const qualitySignals = qualityComponent(evidence);

  const weighted =
    priceEvidence * SCORE_WEIGHTS.priceEvidence +
    discountMagnitude * SCORE_WEIGHTS.discountMagnitude +
    historySupport * SCORE_WEIGHTS.historySupport +
    qualitySignals * SCORE_WEIGHTS.qualitySignals;

  let value = Math.round(weighted * 100);
  if (reasonCodes.includes('BADGE_RECONSTRUCTED')) value = Math.min(value, 15);
  if (reasonCodes.includes('FABRICATED_DISCOUNT')) value = Math.min(value, 10);
  if (reasonCodes.includes('REFERENCE_UNAVAILABLE')) value = Math.min(value, 35);

  let confidence = clamp01(priceEvidence * 0.5 + (evidence.referencePrice?.trusted ? 0.35 : 0.1));
  if (input.pdpBlocked) confidence = clamp01(confidence - 0.05);
  if (evidence.historyReady) confidence = clamp01(confidence + 0.1);

  if (
    deriveOpportunityDecision(
      { value, confidence, reasonCodes, breakdown: { priceEvidence: 0, discountMagnitude: 0, historySupport: 0, qualitySignals: 0 } },
      evidence,
      minDiscount,
    ) === 'OPPORTUNITY'
  ) {
    if (!reasonCodes.includes('VERIFIED_OPPORTUNITY')) {
      reasonCodes.push('VERIFIED_OPPORTUNITY');
    }
  }

  return {
    value,
    confidence: Math.round(confidence * 100) / 100,
    reasonCodes,
    breakdown: {
      priceEvidence: Math.round(priceEvidence * 100),
      discountMagnitude: Math.round(discountMagnitude * 100),
      historySupport: Math.round(historySupport * 100),
      qualitySignals: Math.round(qualitySignals * 100),
    },
  };
}
