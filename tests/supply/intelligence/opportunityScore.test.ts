import { describe, expect, it } from 'vitest';
import {
  deriveOpportunityDecision,
  scoreOpportunity,
  SCORE_WEIGHTS,
} from '@/lib/supply/intelligence/opportunityScore';
import type { OpportunityEvidence } from '@/lib/supply/intelligence/types';

function evidence(over: Partial<OpportunityEvidence> = {}): OpportunityEvidence {
  return {
    salePrice: {
      amount: 800,
      kind: 'listing_card',
      source: 'candidate',
      observedAt: '2026-01-01T00:00:00.000Z',
      trusted: true,
    },
    referencePrice: {
      amount: 1600,
      kind: 'listing_card',
      source: 'candidate',
      observedAt: '2026-01-01T00:00:00.000Z',
      trusted: true,
    },
    discountPercent: 50,
    evidenceLevel: 'strong_card',
    historyReady: false,
    suspectedArtificialListPrice: false,
    hasImage: true,
    productFingerprint: 'fp:test',
    signals: {
      originalPriceProvenance: 'listing_card',
      cardDiscountSource: 'card_strikethrough',
      soldQuantity: 100,
      ratingAverage: 4.5,
    },
    ...over,
  };
}

describe('S8 opportunityScore', () => {
  it('documents deterministic weights', () => {
    const sum =
      SCORE_WEIGHTS.priceEvidence +
      SCORE_WEIGHTS.discountMagnitude +
      SCORE_WEIGHTS.historySupport +
      SCORE_WEIGHTS.qualitySignals;
    expect(sum).toBeCloseTo(1, 5);
  });

  it('explainable score with reason codes', () => {
    const scored = scoreOpportunity({ evidence: evidence() });
    expect(scored.value).toBeGreaterThan(50);
    expect(scored.reasonCodes).toContain('STRONG_CARD_EVIDENCE');
    expect(scored.breakdown.priceEvidence).toBeGreaterThan(0);
    expect(scored.breakdown.discountMagnitude).toBeGreaterThan(0);
  });

  it('rejects fabricated discount from badge evidence', () => {
    const scored = scoreOpportunity({
      evidence: evidence({
        referencePrice: {
          amount: null,
          kind: 'unavailable',
          source: 'candidate',
          observedAt: '2026-01-01T00:00:00.000Z',
          trusted: false,
        },
        discountPercent: null,
        evidenceLevel: 'weak_card',
        suspectedArtificialListPrice: true,
        signals: {
          cardDiscountSource: 'badge_reconstructed',
          cardBadgePercent: 50,
        },
      }),
      title: 'Good product title with enough length',
    });
    expect(scored.reasonCodes).toContain('BADGE_RECONSTRUCTED');
    expect(scored.reasonCodes).toContain('FABRICATED_DISCOUNT');
    const decision = deriveOpportunityDecision(scored, evidence({
      referencePrice: {
        amount: null,
        kind: 'unavailable',
        source: 'candidate',
        observedAt: '2026-01-01T00:00:00.000Z',
        trusted: false,
      },
      discountPercent: null,
      evidenceLevel: 'weak_card',
      suspectedArtificialListPrice: true,
      signals: { cardDiscountSource: 'badge_reconstructed', cardBadgePercent: 50 },
    }), 20);
    expect(decision).toBe('REJECT');
  });

  it('null reference yields REFERENCE_UNAVAILABLE', () => {
    const scored = scoreOpportunity({
      evidence: evidence({
        referencePrice: null,
        discountPercent: null,
        evidenceLevel: 'none',
      }),
    });
    expect(scored.reasonCodes).toContain('REFERENCE_UNAVAILABLE');
    expect(scored.value).toBeLessThanOrEqual(35);
  });
});
