import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  classifyShadowReasons,
  decideAutonomous,
  getAutonomousDecisionMetrics,
  observeAutonomousDecision,
  resetAutonomousDecisionMetrics,
  type AutonomousDecisionInput,
} from '@/lib/autonomous';
import type { MonetizationReadinessResult } from '@/lib/moderation/monetizationReadiness';
import type { DealCheckResult, DealVerifierChecks, DealVerifierResult } from '@/lib/verifier/types';

function pass(detail: string): DealCheckResult {
  return { status: 'pass', detail };
}
function fail(detail: string): DealCheckResult {
  return { status: 'fail', detail };
}
function unknown(detail: string): DealCheckResult {
  return { status: 'unknown', detail };
}

function checks(over: Partial<DealVerifierChecks> = {}): DealVerifierChecks {
  return {
    price: pass('Precios coherentes'),
    discount: pass('Descuento 50%'),
    duplicate: pass('Sin duplicado'),
    seller: pass('Amazon rating 4.7'),
    availability: unknown('n/a'),
    quality: pass('Calidad OK'),
    risk: pass('Sin riesgo'),
    ...over,
  };
}

function verifier(over: Partial<DealVerifierResult> = {}): DealVerifierResult {
  return {
    decision: 'auto_approve',
    score: 85,
    confidence: 0.91,
    reasons: ['Score 85'],
    checks: checks(),
    breakdown: {
      discount: 62,
      popularity: 80,
      rating: 85,
      category: 100,
      priceAppeal: 70,
      historical: 85,
      total: 85,
    },
    ingestDecision: 'auto_approve',
    duplicateOfferId: null,
    ...over,
  };
}

const ready: MonetizationReadinessResult = {
  status: 'ready',
  label: 'Lista',
  detail: 'ok',
};

function input(over: Partial<AutonomousDecisionInput> = {}): AutonomousDecisionInput {
  return {
    verifier: verifier(),
    thresholds: { autoApproveMinScore: 78, requireImage: true, autoApproveEnabled: true },
    monetization: ready,
    requiresAffiliateValidation: false,
    source: 'amazon_asin',
    sourceHealth: 'healthy',
    existingModerationStatus: null,
    title: 'Laptop gaming RTX sólida para oficina',
    imageUrl: 'https://m.media-amazon.com/images/I/xx.jpg',
    store: 'Amazon',
    price: 12000,
    discountPercent: 50,
    effectiveDiscountPercent: 50,
    suspectedArtificialListPrice: false,
    shadowDuplicate: { status: 'pass', detail: 'ok', matchId: null },
    ...over,
  };
}

describe('classifyShadowReasons', () => {
  it('AUTO_APPROVE → sin códigos (no es bottleneck)', () => {
    const r = decideAutonomous(input());
    expect(r.decision).toBe('AUTO_APPROVE');
    expect(classifyShadowReasons(r)).toEqual([]);
  });

  it('agrupa missing_image de forma determinista', () => {
    const r = decideAutonomous(input({ imageUrl: '' }));
    expect(r.decision).toBe('HUMAN_REVIEW');
    const a = classifyShadowReasons(r);
    const b = classifyShadowReasons(r);
    expect(a).toEqual(b);
    expect(a).toContain('missing_image');
    expect(a.filter((c) => c === 'missing_image')).toHaveLength(1);
  });

  it('HUMAN_REVIEW con múltiples razones → códigos únicos ordenados', () => {
    const r = decideAutonomous(
      input({
        imageUrl: '',
        store: null,
        sourceHealth: 'degraded',
        suspectedArtificialListPrice: true,
        shadowDuplicate: { status: 'unknown', detail: 'duplicate_not_checked', matchId: null },
      })
    );
    expect(r.decision).toBe('HUMAN_REVIEW');
    const codes = classifyShadowReasons(r);
    expect(codes).toContain('missing_image');
    expect(codes).toContain('seller_unknown');
    expect(codes).toContain('duplicate_unknown');
    expect(codes).toContain('artificial_list_price');
    expect(codes).toContain('source_degraded');
    expect(codes).toEqual([...codes].sort((a, b) => {
      const order = [
        'missing_image',
        'seller_unknown',
        'duplicate_unknown',
        'duplicate_confirmed',
        'discount_gap',
        'artificial_list_price',
        'low_score',
        'low_confidence',
        'verifier_review',
        'missing_price',
        'invalid_url',
        'source_degraded',
        'other',
      ];
      return order.indexOf(a) - order.indexOf(b);
    }));
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('duplicate_confirmed y verifier_review / low_score', () => {
    const confirmed = decideAutonomous(
      input({
        shadowDuplicate: { status: 'fail', detail: 'Duplicado de oferta existente (x)', matchId: 'x' },
      })
    );
    expect(confirmed.decision).toBe('AUTO_REJECT');
    expect(classifyShadowReasons(confirmed)).toContain('duplicate_confirmed');

    const review = decideAutonomous(
      input({
        verifier: verifier({
          decision: 'review',
          ingestDecision: 'pending',
          score: 50,
          confidence: 0.4,
        }),
      })
    );
    expect(review.decision).toBe('HUMAN_REVIEW');
    const codes = classifyShadowReasons(review);
    expect(codes).toContain('verifier_review');
    expect(codes).toContain('low_score');
    expect(codes).toContain('low_confidence');
  });

  it('missing_price e invalid_url', () => {
    const price = decideAutonomous(
      input({
        verifier: verifier({
          decision: 'reject',
          ingestDecision: 'reject',
          checks: checks({ price: fail('Precio actual inválido') }),
        }),
      })
    );
    expect(price.decision).toBe('AUTO_REJECT');
    expect(classifyShadowReasons(price)).toContain('missing_price');

    const url = decideAutonomous(
      input({
        verifier: verifier({
          decision: 'reject',
          ingestDecision: 'reject',
          checks: checks({ quality: fail('URL inválida (sin http/https)') }),
        }),
      })
    );
    expect(classifyShadowReasons(url)).toContain('invalid_url');
  });
});

describe('shadow observation samples', () => {
  beforeEach(() => {
    resetAutonomousDecisionMetrics();
  });

  it('AUTO_APPROVE registra sample con score/confidence y sin URL', () => {
    observeAutonomousDecision(input({ source: 'env_urls' }));
    const m = getAutonomousDecisionMetrics();
    expect(m.autoApprove).toBe(1);
    expect(m.avgConfidence).toBe(0.91);
    expect(m.avgScore).toBe(85);
    expect(m.recent).toHaveLength(1);
    expect(m.recent[0]?.decision).toBe('AUTO_APPROVE');
    expect(m.recent[0]?.source).toBe('env_urls');
    expect(m.recent[0]?.reasons).toEqual([]);
    expect(JSON.stringify(m.recent)).not.toMatch(/https?:\/\//);
    expect(JSON.stringify(m.recent)).not.toMatch(/amazon\.com|mercadolibre/);
  });

  it('zero candidates → recent vacío', () => {
    expect(getAutonomousDecisionMetrics().recent).toEqual([]);
    expect(getAutonomousDecisionMetrics().avgScore).toBeNull();
  });

  it('no muta ingestDecision / no toca rewards', () => {
    const verified = verifier();
    observeAutonomousDecision(input({ verifier: verified, imageUrl: '' }));
    expect(verified.ingestDecision).toBe('auto_approve');
    const metrics = readFileSync(join(process.cwd(), 'lib/autonomous/reasonCodes.ts'), 'utf8');
    expect(metrics).not.toMatch(/lib\/rewards|lib\/commissions|lib\/ledger/);
  });
});
