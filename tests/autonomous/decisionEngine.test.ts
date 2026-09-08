import { beforeEach, describe, expect, it } from 'vitest';
import {
  AUTONOMOUS_DECISION_POLICY_V1,
  decideAutonomous,
  getAutonomousDecisionMetrics,
  observeAutonomousDecision,
  resetAutonomousDecisionMetrics,
  type AutonomousDecisionInput,
} from '@/lib/autonomous';
import type { MonetizationReadinessResult } from '@/lib/moderation/monetizationReadiness';
import type { DealCheckResult, DealVerifierChecks, DealVerifierResult } from '@/lib/verifier/types';
import { evaluateDeal, resetDealVerifierMetrics } from '@/lib/verifier';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';

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
    discount: pass('Descuento 50% dentro de rango'),
    duplicate: pass('Sin duplicado en pre-check'),
    seller: pass('Amazon rating 4.7 (120 reviews)'),
    availability: unknown('Disponibilidad no verificada (sin fetch extra)'),
    quality: pass('Calidad básica OK'),
    risk: pass('Sin señales de riesgo fuertes'),
    ...over,
  };
}

function verifier(over: Partial<DealVerifierResult> = {}): DealVerifierResult {
  return {
    decision: 'auto_approve',
    score: 85,
    confidence: 0.91,
    reasons: ['Score 85 ≥ umbral auto-approve (78)'],
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

const readyMonetization: MonetizationReadinessResult = {
  status: 'ready',
  label: 'Lista',
  detail: 'Aventa puede monetizar este enlace.',
};

function perfectInput(over: Partial<AutonomousDecisionInput> = {}): AutonomousDecisionInput {
  return {
    verifier: verifier(),
    thresholds: {
      autoApproveMinScore: 78,
      requireImage: true,
      autoApproveEnabled: true,
    },
    monetization: readyMonetization,
    requiresAffiliateValidation: true,
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
    ...over,
  };
}

function fingerprint(result: ReturnType<typeof decideAutonomous>) {
  return {
    decision: result.decision,
    confidence: result.confidence,
    score: result.score,
    reasons: result.reasons,
    checks: result.checks,
    policyVersion: result.policyVersion,
  };
}

function baseConfig(over: Partial<BotIngestConfig> = {}): BotIngestConfig {
  return {
    profile: 'standard',
    enabled: true,
    botUserId: 'x',
    botUserIdTech: null,
    botUserIdStaples: null,
    botAuthorDualMode: false,
    botUserIdsForQuota: ['x'],
    morningSustainedEnabled: false,
    morningHourStart: 5,
    morningHourEndExclusive: 11,
    morningMaxPerRunMin: 2,
    morningMaxPerRunMax: 5,
    timezone: 'America/Mexico_City',
    normalMaxPerRunMin: 1,
    normalMaxPerRunMax: 3,
    boostMaxOffers: 20,
    boostLocalHourStart: 7,
    boostLocalMinuteEnd: 30,
    dailyMaxOffers: 120,
    candidatePoolMax: 40,
    maxPerRun: 5,
    minDiscountPercent: 20,
    category: null,
    urlsFromEnv: [],
    discoverMlEnabled: true,
    mlQueries: [],
    mlCategoryIds: [],
    mlUseDefaultQueries: true,
    mlSearchLimitPerRequest: 50,
    mlMaxCollect: 80,
    mlSortTrending: 'sold_quantity_desc',
    techCategoryIds: ['MLM1648'],
    techCategoryIdSet: new Set(['MLM1648']),
    amazonAsins: [],
    amazonDpBase: 'https://www.amazon.com.mx/dp/',
    amazonSource: 'scrape',
    amazonPaapiEnabled: false,
    amazonPaapiAccessKey: null,
    amazonPaapiSecretKey: null,
    amazonPaapiPartnerTag: null,
    amazonPaapiHost: 'webservices.amazon.com.mx',
    amazonPaapiRegion: 'us-east-1',
    minSoldQuantityMl: 50,
    minRatingAverage: 4,
    minRatingReviewsCount: 5,
    mlFetchReviews: false,
    mlReviewFetchMax: 0,
    keepaEnabled: false,
    keepaApiKey: null,
    keepaDomainId: 11,
    autoApproveEnabled: true,
    autoApproveMinScore: 78,
    autoApproveWorkerMinScore: 55,
    autoApproveWorkerMinDiscountPercent: 28,
    autoApproveRequireImage: true,
    workerMaxPerRun: 10,
    rejectBelowScore: 40,
    forcePendingMinScore: null,
    scoreWeights: {
      discount: 0.28,
      popularity: 0.22,
      rating: 0.2,
      category: 0.15,
      priceAppeal: 0.15,
    },
    titleBlocklistGenericRe: null,
    titleBlocklistSpamRe: null,
    ...over,
  };
}

describe('Autonomous Decision Engine V1', () => {
  beforeEach(() => {
    resetAutonomousDecisionMetrics();
    resetDealVerifierMetrics();
  });

  it('1. candidato perfecto → AUTO_APPROVE', () => {
    const r = decideAutonomous(perfectInput());
    expect(r.decision).toBe('AUTO_APPROVE');
    expect(r.score).toBe(85);
    expect(r.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('2. critical failure → AUTO_REJECT', () => {
    const r = decideAutonomous(
      perfectInput({
        verifier: verifier({
          decision: 'reject',
          ingestDecision: 'reject',
          checks: checks({ quality: fail('URL inválida (sin http/https)') }),
        }),
      })
    );
    expect(r.decision).toBe('AUTO_REJECT');
    expect(r.reasons.some((x) => /URL inválida|Fail crítico|calidad/i.test(x))).toBe(true);
  });

  it('3. duplicate confirmado → AUTO_REJECT', () => {
    const r = decideAutonomous(
      perfectInput({
        verifier: verifier({
          decision: 'reject',
          ingestDecision: 'reject',
          duplicateOfferId: 'offer-1',
          checks: checks({ duplicate: fail('Duplicado de oferta existente (offer-1)') }),
        }),
      })
    );
    expect(r.decision).toBe('AUTO_REJECT');
    expect(r.reasons.join(' ')).toMatch(/Duplicado/);
  });

  it('4. score insuficiente → HUMAN_REVIEW', () => {
    const r = decideAutonomous(
      perfectInput({
        verifier: verifier({
          decision: 'review',
          ingestDecision: 'pending',
          score: 60,
          confidence: 0.55,
        }),
      })
    );
    expect(r.decision).toBe('HUMAN_REVIEW');
    expect(r.reasons.join(' ')).toMatch(/Score 60/i);
  });

  it('5. confidence insuficiente → HUMAN_REVIEW', () => {
    const r = decideAutonomous(
      perfectInput({
        verifier: verifier({ confidence: 0.4 }),
      })
    );
    expect(r.decision).toBe('HUMAN_REVIEW');
    expect(r.reasons.join(' ')).toMatch(/Confidence 0\.4/i);
  });

  it('6. artificial price → HUMAN_REVIEW', () => {
    const r = decideAutonomous(
      perfectInput({
        suspectedArtificialListPrice: true,
        verifier: verifier({
          decision: 'review',
          ingestDecision: 'pending',
          checks: checks({
            discount: warn('Descuento de etiqueta con lista artificial sospechosa — no auto-approve'),
            risk: warn('Price Engine sospecha precio de lista artificial'),
          }),
        }),
      })
    );
    expect(r.decision).toBe('HUMAN_REVIEW');
    expect(r.decision).not.toBe('AUTO_REJECT');
  });

  it('7. monetización pendiente → HUMAN_REVIEW', () => {
    const r = decideAutonomous(
      perfectInput({
        monetization: {
          status: 'needs_attention',
          label: 'Requiere atención',
          detail: 'No se pudo preparar el enlace monetizado.',
        },
      })
    );
    expect(r.decision).toBe('HUMAN_REVIEW');
    expect(r.reasons.join(' ')).toMatch(/monetizado|afiliado/i);
  });

  it('8. seller desconocido → HUMAN_REVIEW', () => {
    const r = decideAutonomous(
      perfectInput({
        store: '',
        verifier: verifier({
          checks: checks({ seller: unknown('Tienda/fuente desconocida') }),
        }),
      })
    );
    expect(r.decision).toBe('HUMAN_REVIEW');
    expect(r.reasons.join(' ')).toMatch(/desconocid/i);
  });

  it('9. imagen insuficiente → HUMAN_REVIEW', () => {
    const r = decideAutonomous(
      perfectInput({
        imageUrl: '/placeholder.png',
        verifier: verifier({
          checks: checks({ quality: warn('Imagen ausente o placeholder') }),
        }),
      })
    );
    expect(r.decision).toBe('HUMAN_REVIEW');
    expect(r.reasons.join(' ')).toMatch(/Imagen/i);
  });

  it('10. fuente degradada → HUMAN_REVIEW', () => {
    const r = decideAutonomous(perfectInput({ sourceHealth: 'degraded' }));
    expect(r.decision).toBe('HUMAN_REVIEW');
    expect(r.reasons.join(' ')).toMatch(/degradada/i);
  });

  it('11. score NaN → NO AUTO_APPROVE', () => {
    const r = decideAutonomous(
      perfectInput({
        verifier: verifier({ score: Number.NaN, decision: 'review', ingestDecision: 'pending' }),
      })
    );
    expect(r.decision).not.toBe('AUTO_APPROVE');
    expect(r.score).toBeNull();
    expect(r.decision).toBe('HUMAN_REVIEW');
  });

  it('12. score Infinity → NO AUTO_APPROVE', () => {
    const r = decideAutonomous(
      perfectInput({
        verifier: verifier({
          score: Number.POSITIVE_INFINITY,
          decision: 'review',
          ingestDecision: 'pending',
        }),
      })
    );
    expect(r.decision).not.toBe('AUTO_APPROVE');
    expect(r.score).toBeNull();
    expect(r.decision).toBe('HUMAN_REVIEW');
  });

  it('13. información desconocida → HUMAN_REVIEW', () => {
    const r = decideAutonomous(
      perfectInput({
        sourceHealth: null,
        verifier: verifier({
          checks: checks({ duplicate: unknown('duplicate_not_checked') }),
        }),
      })
    );
    expect(r.decision).toBe('HUMAN_REVIEW');
  });

  it('14. señales contradictorias → HUMAN_REVIEW', () => {
    const r = decideAutonomous(
      perfectInput({
        verifier: verifier({
          decision: 'auto_approve',
          checks: checks({
            risk: warn('Price Engine sospecha precio de lista artificial'),
          }),
        }),
        suspectedArtificialListPrice: true,
      })
    );
    expect(r.decision).toBe('HUMAN_REVIEW');
    expect(r.checks.contradictions.status).toBe('warn');
  });

  it('15. mismo input → misma decisión', () => {
    const input = perfectInput();
    const a = decideAutonomous(input, new Date('2026-01-01T00:00:00.000Z'));
    const b = decideAutonomous(input, new Date('2026-09-07T12:00:00.000Z'));
    expect(fingerprint(a)).toEqual(fingerprint(b));
    expect(a.generatedAt).not.toBe(b.generatedAt);
    expect(a.decision).toBe(b.decision);
  });

  it('16. policyVersion presente', () => {
    const r = decideAutonomous(perfectInput());
    expect(r.policyVersion).toBe(AUTONOMOUS_DECISION_POLICY_V1);
  });

  it('score bajo sin fail crítico no es AUTO_REJECT', () => {
    const r = decideAutonomous(
      perfectInput({
        verifier: verifier({
          decision: 'reject',
          ingestDecision: 'reject',
          score: 20,
          confidence: 0.1,
        }),
      })
    );
    expect(r.decision).toBe('HUMAN_REVIEW');
  });

  it('shadow observe registra métricas y no lanza', () => {
    const result = observeAutonomousDecision(perfectInput());
    expect(result?.decision).toBe('AUTO_APPROVE');
    const m = getAutonomousDecisionMetrics();
    expect(m.evaluated).toBe(1);
    expect(m.autoApprove).toBe(1);
    expect(m.autonomousPct).toBe(100);
    expect(m.bySource.amazon_asin.autoApprove).toBe(1);
  });

  it('ML típico del verifier (seller/duplicate unknown) no AUTO_APPROVE', () => {
    const meta: ParsedOfferMetadata = {
      canonicalUrl: 'https://www.mercadolibre.com.mx/producto/p/MLM1234567890',
      title: 'Laptop gaming RTX sólida para oficina',
      store: 'Mercado Libre',
      imageUrl: 'https://http2.mlstatic.com/x.jpg',
      discountPrice: 12000,
      originalPrice: 24000,
      discountPercent: 50,
      signals: {
        soldQuantity: 500,
        ratingAverage: 4.7,
        ratingCount: 120,
        categoryId: 'MLM1648',
        condition: 'new',
        effectiveDiscountPercent: 50,
        savingsVsHabitualPct: 22,
      },
    };
    const verified = evaluateDeal({
      meta,
      config: baseConfig(),
      source: 'ml_api',
    });
    expect(verified.decision).toBe('auto_approve');
    const r = decideAutonomous(
      perfectInput({
        verifier: verified,
        source: 'ml_api',
        store: meta.store,
        title: meta.title,
        imageUrl: meta.imageUrl,
        price: meta.discountPrice,
        discountPercent: meta.discountPercent,
        effectiveDiscountPercent: 50,
      })
    );
    expect(r.decision).toBe('HUMAN_REVIEW');
  });
});
