/**
 * Discovery Experiment v2 — shadow discount taxonomy + what-if + funnel.
 * Observation only: never mints / never changes productive gates.
 */
import { describe, expect, it } from 'vitest';
import {
  aggregateDiscountPathStats,
  auditDiscountGateReason,
  classifyDiscountClass,
  classifyDiscountClassV1,
  classifyDiscountEvidence,
  deriveFunnelDecision,
  simulateWithoutDiscountGate,
  summarizeOpportunities,
  SHADOW_REAL_GOOD_MIN_PCT,
} from '@/lib/hunter/candidateIntelligence';

describe('Discovery Experiment v2 — shadow taxonomy', () => {
  it('REAL_GOOD requires evidence >= 25%', () => {
    expect(SHADOW_REAL_GOOD_MIN_PCT).toBe(25);
    expect(
      classifyDiscountClass({
        salePrice: 75,
        originalPrice: 100,
        discountPct: 25,
      }),
    ).toBe('DISCOUNT_REAL_GOOD');
    expect(
      classifyDiscountClass({
        salePrice: 80,
        originalPrice: 100,
        discountPct: 20,
      }),
    ).toBe('DISCOUNT_REAL_LOW');
  });

  it('UNKNOWN is not a rejection class', () => {
    const c = classifyDiscountEvidence({
      salePrice: 199,
      originalPrice: null,
      discountPct: null,
    });
    expect(c.discountClass).toBe('DISCOUNT_UNKNOWN');
    expect(c.priceEvidence.discountEvidence).toBe('insufficient');
    expect(c.discountConfidence).toBe('none');
    expect(String(c.discountClass)).not.toMatch(/REJECT/);
  });

  it('MISSING_PRICE vs INVALID vs REAL_LOW', () => {
    expect(
      classifyDiscountClass({ salePrice: null, originalPrice: 100 }),
    ).toBe('DISCOUNT_MISSING_PRICE');
    expect(
      classifyDiscountClass({ salePrice: 120, originalPrice: 100 }),
    ).toBe('DISCOUNT_INVALID');
    expect(
      classifyDiscountClass({ salePrice: 95, originalPrice: 100, discountPct: 5 }),
    ).toBe('DISCOUNT_REAL_LOW');
  });

  it('dual-label v1 vs v2 on same input', () => {
    const v2 = classifyDiscountEvidence({
      salePrice: 80,
      originalPrice: 100,
      discountPct: 20,
      minDiscountPercent: 20,
    });
    expect(v2.discountClass).toBe('DISCOUNT_REAL_LOW'); // shadow good min = 25
    expect(v2.discountClassV1).toBe('LOW_DISCOUNT'); // productive min = 20 → at boundary ≤20
    expect(classifyDiscountClassV1({
      salePrice: 50,
      originalPrice: 100,
      discountPct: 50,
      minDiscountPercent: 20,
    })).toBe('OK_ABOVE_MIN');
  });
});

describe('Discovery Experiment v2 — REJECTED_DISCOUNT path audit', () => {
  it('maps productive reasons to distinct paths', () => {
    expect(auditDiscountGateReason('sin precio original verificable').path).toBe(
      'missing_original_price',
    );
    expect(auditDiscountGateReason('sin precio original verificable').productiveDecisionHint).toBe(
      'REJECTED_PRICE',
    );
    expect(auditDiscountGateReason('descuento 12% < mínimo 20%').path).toBe('discount_below_min');
    expect(auditDiscountGateReason('descuento 12% < mínimo 20%').productiveDecisionHint).toBe(
      'REJECTED_DISCOUNT',
    );
    expect(auditDiscountGateReason('descuento 0% — no es oferta').path).toBe('discount_zero');
    expect(auditDiscountGateReason('título marcado como baja calidad').path).toBe(
      'not_discount_gate',
    );
  });

  it('aggregates path stats table rows', () => {
    const rows = [
      {
        reason: 'sin precio original verificable',
        classification: classifyDiscountEvidence({ salePrice: 100, originalPrice: null }),
      },
      {
        reason: 'sin precio original verificable',
        classification: classifyDiscountEvidence({ salePrice: 80, originalPrice: null }),
      },
      {
        reason: 'descuento 10% < mínimo 20%',
        classification: classifyDiscountEvidence({
          salePrice: 90,
          originalPrice: 100,
          discountPct: 10,
        }),
      },
      {
        reason: 'descuento 5% fuera de rango',
        classification: classifyDiscountEvidence({
          salePrice: 95,
          originalPrice: 100,
          discountPct: 5,
        }),
      },
    ];
    const table = aggregateDiscountPathStats(rows);
    expect(table.length).toBeGreaterThanOrEqual(2);
    const missing = table.find((r) => r.reasonPath === 'missing_original_price');
    expect(missing?.count).toBe(2);
    expect(missing?.originalPriceAvailable).toBe(false);
    expect(missing?.currentPriceAvailable).toBe(true);
  });
});

describe('Discovery Experiment v2 — what-if + funnel', () => {
  it('UNKNOWN would continue if discount gate were not killer', () => {
    const hypo = simulateWithoutDiscountGate({
      discountClass: 'DISCOUNT_UNKNOWN',
      currentDecision: 'REJECTED_PRICE',
      reason: 'sin precio original verificable',
      hasTitle: true,
      hasUrl: true,
    });
    expect(hypo.discountGateWasKiller).toBe(true);
    expect(hypo.classBucket).toBe('UNKNOWN');
    expect(hypo.hypotheticalDecision).toBe('WOULD_CONTINUE');
  });

  it('INVALID / MISSING_PRICE stay rejected even without discount gate', () => {
    expect(
      simulateWithoutDiscountGate({
        discountClass: 'DISCOUNT_INVALID',
        currentDecision: 'REJECTED_PRICE',
        reason: 'sin precio original verificable',
        hasTitle: true,
        hasUrl: true,
      }).hypotheticalDecision,
    ).toBe('STILL_REJECTED');
    expect(
      simulateWithoutDiscountGate({
        discountClass: 'DISCOUNT_MISSING_PRICE',
        currentDecision: 'REJECTED_PRICE',
        reason: 'sin precio actual parseable',
        hasTitle: true,
        hasUrl: true,
      }).hypotheticalDecision,
    ).toBe('STILL_REJECTED');
  });

  it('REAL_LOW separated from UNKNOWN in opportunity metrics', () => {
    const summary = summarizeOpportunities([
      {
        discountClass: 'DISCOUNT_REAL_LOW',
        currentDecision: 'REJECTED_DISCOUNT',
        hypotheticalDecision: 'WOULD_CONTINUE',
        discountGateWasKiller: true,
        classBucket: 'REAL_LOW',
        funnelStage: 'DISCOUNT_CLASSIFICATION',
      },
      {
        discountClass: 'DISCOUNT_UNKNOWN',
        currentDecision: 'REJECTED_PRICE',
        hypotheticalDecision: 'WOULD_CONTINUE',
        discountGateWasKiller: true,
        classBucket: 'UNKNOWN',
        funnelStage: 'DISCOUNT_CLASSIFICATION',
      },
      {
        discountClass: 'DISCOUNT_REAL_GOOD',
        currentDecision: 'WOULD_INSERT',
        hypotheticalDecision: 'SAME_AS_CURRENT',
        discountGateWasKiller: false,
        classBucket: 'REAL_GOOD',
        funnelStage: 'WOULD_INSERT',
      },
    ]);
    expect(summary.realLow).toBe(1);
    expect(summary.unknown).toBe(1);
    expect(summary.realGood).toBe(1);
    expect(summary.wouldInsertCurrent).toBe(1);
    expect(summary.wouldInsertIfUnknownPreserved).toBe(1);
    expect(summary.wouldContinueByClass.REAL_LOW).toBe(1);
    expect(summary.wouldContinueByClass.UNKNOWN).toBe(1);
    expect(summary.funnelCuts.discountClassification).toBe(2);
    expect(summary.funnelCuts.wouldInsert).toBe(1);
  });

  it('every funnel decision has explicit stage+reason', () => {
    const f = deriveFunnelDecision({
      decision: 'REJECTED_DISCOUNT',
      reasonCode: 'discount_out_of_range',
      reasonDetail: 'descuento 10% < mínimo 20%',
    });
    expect(f.stage).toBe('DISCOUNT_CLASSIFICATION');
    expect(f.terminal).toBe(true);
    expect(f.reason).toBeTruthy();
  });
});
