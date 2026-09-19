/**
 * CazaOfertasss — FASE 0. Contratos del DealScore: determinismo, explicabilidad
 * y gates duros.
 */

import { describe, expect, it } from 'vitest';

import {
  CAZAOFERTAS_SCORE_VERSION,
  DEAL_SCORE_GRADE_THRESHOLDS,
  DEAL_SCORE_MAX,
  DEAL_SCORE_WEIGHTS,
  computeDealScore,
  gradeFromScore,
  totalScoreWeight,
  type DealScoreInput,
} from '@/lib/cazaOfertas';

import { pageClaimEvidence, strongEvidence } from './fixtures';

function baseInput(overrides: Partial<DealScoreInput> = {}): DealScoreInput {
  return {
    discountPercent: 42,
    discountClaimable: true,
    evidence: strongEvidence(),
    sellerTrustClass: 'official_store',
    availability: 'in_stock',
    category: 'electronics',
    evidenceStale: false,
    evidenceUsable: true,
    ...overrides,
  };
}

describe('pesos del score', () => {
  it('los pesos suman exactamente DEAL_SCORE_MAX', () => {
    expect(totalScoreWeight()).toBe(DEAL_SCORE_MAX);
  });

  it('no hay pesos negativos ni cero', () => {
    for (const [component, weight] of Object.entries(DEAL_SCORE_WEIGHTS)) {
      expect(weight, `peso de ${component}`).toBeGreaterThan(0);
    }
  });
});

describe('determinismo', () => {
  it('mismas entradas producen score, grade y razones idénticas', () => {
    const a = computeDealScore(baseInput());
    const b = computeDealScore(baseInput());
    expect(a).toEqual(b);
    // Incluye el orden de las razones: la explicación también es determinista.
    expect(a.reasons.map((r) => r.component)).toEqual(b.reasons.map((r) => r.component));
  });

  it('el orden de las razones es fijo y cubre todos los componentes', () => {
    const { reasons } = computeDealScore(baseInput());
    expect(reasons.map((r) => r.component)).toEqual([
      'discountStrength',
      'historicalPriceConfidence',
      'currentPriceConfidence',
      'evidenceQuality',
      'sellerQuality',
      'availability',
      'categoryRelevance',
      'couponPromotion',
    ]);
  });

  it('cada razón declara peso, puntos obtenidos y detalle legible', () => {
    for (const reason of computeDealScore(baseInput()).reasons) {
      expect(reason.weight).toBeGreaterThan(0);
      expect(reason.earned).toBeGreaterThanOrEqual(0);
      expect(reason.earned).toBeLessThanOrEqual(reason.weight);
      expect(reason.detail.length).toBeGreaterThan(0);
    }
  });

  it('versiona el algoritmo', () => {
    expect(computeDealScore(baseInput()).version).toBe(CAZAOFERTAS_SCORE_VERSION);
  });
});

describe('grades', () => {
  it('umbrales son constantes configurables, no magic numbers', () => {
    expect(gradeFromScore(DEAL_SCORE_GRADE_THRESHOLDS.GREAT_DEAL)).toBe('GREAT_DEAL');
    expect(gradeFromScore(DEAL_SCORE_GRADE_THRESHOLDS.GREAT_DEAL - 1)).toBe('GOOD_DEAL');
    expect(gradeFromScore(DEAL_SCORE_GRADE_THRESHOLDS.GOOD_DEAL)).toBe('GOOD_DEAL');
    expect(gradeFromScore(DEAL_SCORE_GRADE_THRESHOLDS.GOOD_DEAL - 1)).toBe('REJECT');
    expect(gradeFromScore(0)).toBe('REJECT');
  });

  it('oferta fuerte de tienda oficial es GREAT_DEAL', () => {
    const score = computeDealScore(baseInput());
    expect(score.score).toBe(93);
    expect(score.grade).toBe('GREAT_DEAL');
  });

  it('misma oferta con vendedor medio y categoría menos relevante cae a GOOD_DEAL', () => {
    const score = computeDealScore(
      baseInput({
        sellerTrustClass: 'medium',
        availability: 'low_stock',
        category: 'fashion',
        evidence: strongEvidence({ promotionApplied: false }),
      })
    );
    expect(score.score).toBe(79);
    expect(score.grade).toBe('GOOD_DEAL');
  });

  it('el score nunca sale del rango 0–100', () => {
    const max = computeDealScore(
      baseInput({ discountPercent: 99, evidence: strongEvidence({ couponApplied: true }) })
    );
    expect(max.score).toBeLessThanOrEqual(DEAL_SCORE_MAX);
    expect(max.score).toBeGreaterThanOrEqual(0);
  });
});

describe('gates duros', () => {
  const cases: ReadonlyArray<readonly [string, Partial<DealScoreInput>, string]> = [
    ['evidencia inusable', { evidenceUsable: false }, 'gate.evidence_unusable'],
    ['evidencia stale', { evidenceStale: true }, 'gate.evidence_stale'],
    [
      'calidad unusable',
      { evidence: strongEvidence({ evidenceQuality: 'unusable' }) },
      'gate.evidence_quality_unusable',
    ],
    [
      'descuento no reclamable',
      { discountClaimable: false, evidence: pageClaimEvidence(), discountPercent: 0 },
      'gate.discount_not_claimable',
    ],
    ['descuento bajo el mínimo', { discountPercent: 5 }, 'gate.discount_below_minimum'],
    ['sin stock', { availability: 'out_of_stock' }, 'gate.out_of_stock'],
  ];

  for (const [label, overrides, expectedGate] of cases) {
    it(`${label} ⇒ score 0, grade REJECT`, () => {
      const score = computeDealScore(baseInput(overrides));
      expect(score.score).toBe(0);
      expect(score.grade).toBe('REJECT');
      expect(score.gatesFailed).toContain(expectedGate);
      // Un gate fallido no puede acumular puntos por categoría o vendedor.
      expect(score.reasons.every((r) => r.component === 'gate')).toBe(true);
    });
  }

  it('un "X% OFF" auto-declarado no puede producir un grade publicable', () => {
    const score = computeDealScore(
      baseInput({ discountClaimable: false, discountPercent: 0, evidence: pageClaimEvidence() })
    );
    expect(score.grade).toBe('REJECT');
  });
});
