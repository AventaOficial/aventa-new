import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  beginAutonomousShadowCycle,
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
function warn(detail: string): DealCheckResult {
  return { status: 'warn', detail };
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

describe('FASE 4.4 shadow metrics', () => {
  beforeEach(() => {
    resetAutonomousDecisionMetrics();
  });

  it('cero candidatos → porcentajes 0 y sin razones', () => {
    const m = getAutonomousDecisionMetrics();
    expect(m.evaluated).toBe(0);
    expect(m.autonomousPct).toBe(0);
    expect(m.autoApprovePct).toBe(0);
    expect(m.humanReviewPct).toBe(0);
    expect(m.autoRejectPct).toBe(0);
    expect(m.avgConfidence).toBe(0);
    expect(m.topReasons).toEqual([]);
    expect(m.bySource).toEqual({});
    expect(m.firstAt).toBeNull();
    expect(m.lastAt).toBeNull();
    expect(m.persistence).toBe('process_memory');
  });

  it('métricas por decisión + autonomousPct', () => {
    observeAutonomousDecision(input());
    observeAutonomousDecision(
      input({
        imageUrl: '',
        verifier: verifier({
          checks: checks({ quality: warn('Imagen ausente o placeholder') }),
        }),
      })
    );
    observeAutonomousDecision(
      input({
        verifier: verifier({
          decision: 'reject',
          ingestDecision: 'reject',
          checks: checks({ quality: fail('Título vacío') }),
        }),
      })
    );

    const m = getAutonomousDecisionMetrics();
    expect(m.evaluated).toBe(3);
    expect(m.autoApprove).toBe(1);
    expect(m.humanReview).toBe(1);
    expect(m.autoReject).toBe(1);
    expect(m.autoApprovePct).toBe(33.3);
    expect(m.humanReviewPct).toBe(33.3);
    expect(m.autoRejectPct).toBe(33.3);
    expect(m.autonomousPct).toBe(66.7);
    expect(m.avgConfidence).toBe(0.91);
    expect(m.imageFound).toBe(2);
    expect(m.imageMissing).toBe(1);
    expect(m.verifier.autoApprove).toBe(2);
    expect(m.verifier.reject).toBe(1);
    expect(m.firstAt).toBeTruthy();
    expect(m.lastAt).toBeTruthy();
  });

  it('agrupa por source (ml_api → legacy, paapi via sourceDetail)', () => {
    observeAutonomousDecision(input({ source: 'ml_api' }));
    observeAutonomousDecision(input({ source: 'amazon_asin' }), { sourceDetail: 'amazon:paapi' });
    observeAutonomousDecision(input({ source: 'ml_worker' }));
    const m = getAutonomousDecisionMetrics();
    expect(m.bySource.ml_api_legacy.evaluated).toBe(1);
    expect(m.bySource.amazon_paapi.evaluated).toBe(1);
    expect(m.bySource.ml_worker.evaluated).toBe(1);
    expect(m.bySource.ml_api).toBeUndefined();
    expect(m.bySource.amazon_asin).toBeUndefined();
  });

  it('razones de HUMAN_REVIEW aparecen en bottlenecks', () => {
    observeAutonomousDecision(
      input({
        imageUrl: '',
        verifier: verifier({
          checks: checks({ quality: warn('Imagen ausente o placeholder') }),
        }),
      })
    );
    const m = getAutonomousDecisionMetrics();
    expect(m.humanReview).toBe(1);
    expect(m.topReasons.some((r) => r.code === 'missing_image' || r.reason === 'missing_image')).toBe(true);
  });

  it('misma secuencia → métricas deterministas (salvo timestamps)', () => {
    const run = () => {
      resetAutonomousDecisionMetrics();
      beginAutonomousShadowCycle(new Date('2026-09-08T00:00:00.000Z'));
      observeAutonomousDecision(input({ source: 'env_urls' }));
      observeAutonomousDecision(
        input({
          source: 'env_urls',
          imageUrl: '',
          verifier: verifier({
            checks: checks({ quality: warn('Imagen ausente o placeholder') }),
          }),
        })
      );
      const m = getAutonomousDecisionMetrics();
      return {
        evaluated: m.evaluated,
        autoApprove: m.autoApprove,
        humanReview: m.humanReview,
        autonomousPct: m.autonomousPct,
        bySource: m.bySource,
        topReasons: m.topReasons,
        currentCycleEvaluated: m.currentCycle.evaluated,
      };
    };
    expect(run()).toEqual(run());
  });

  it('ciclo: lastCycle se conserva al iniciar el siguiente; totales de proceso acumulan', () => {
    beginAutonomousShadowCycle(new Date('2026-09-08T01:00:00.000Z'));
    observeAutonomousDecision(input());
    expect(getAutonomousDecisionMetrics().currentCycle.evaluated).toBe(1);
    beginAutonomousShadowCycle(new Date('2026-09-08T02:00:00.000Z'));
    const after = getAutonomousDecisionMetrics();
    expect(after.evaluated).toBe(1);
    expect(after.currentCycle.evaluated).toBe(0);
    expect(after.lastCycle.evaluated).toBe(1);
    expect(after.lastCycle.autoApprove).toBe(1);
    observeAutonomousDecision(input({ source: 'ml_worker' }));
    const live = getAutonomousDecisionMetrics();
    expect(live.evaluated).toBe(2);
    expect(live.currentCycle.evaluated).toBe(1);
    expect(live.lastCycle.evaluated).toBe(1);
    expect(live.bySource.ml_worker.evaluated).toBe(1);
  });

  it('observe no muta ingestDecision productivo', () => {
    const verified = verifier();
    expect(verified.ingestDecision).toBe('auto_approve');
    observeAutonomousDecision(
      input({
        verifier: verified,
        imageUrl: '',
      })
    );
    expect(verified.ingestDecision).toBe('auto_approve');
    expect(verified.decision).toBe('auto_approve');
  });

  it('observe/metrics no importan rewards ni commissions', () => {
    const observe = readFileSync(join(process.cwd(), 'lib/autonomous/observe.ts'), 'utf8');
    const metrics = readFileSync(join(process.cwd(), 'lib/autonomous/metrics.ts'), 'utf8');
    for (const src of [observe, metrics]) {
      expect(src).not.toMatch(/lib\/rewards/);
      expect(src).not.toMatch(/lib\/commissions/);
      expect(src).not.toMatch(/lib\/ledger/);
    }
  });
});
