import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildAutonomousInput,
  canonicalShadowSource,
  decideAutonomous,
  getAutonomousDecisionMetrics,
  lookupDuplicateForShadow,
  observeAutonomousDecision,
  observeIngestShadow,
  resetAutonomousDecisionMetrics,
  type AutonomousDecisionInput,
} from '@/lib/autonomous';
import type { MonetizationReadinessResult } from '@/lib/moderation/monetizationReadiness';
import type { DealCheckResult, DealVerifierChecks, DealVerifierResult } from '@/lib/verifier/types';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';

const AMAZON_URL = 'https://www.amazon.com.mx/dp/B0TESTASI1';
const WEAK_URL = 'https://www.amazon.com.mx/';

function pass(detail: string): DealCheckResult {
  return { status: 'pass', detail };
}
function unknown(detail: string): DealCheckResult {
  return { status: 'unknown', detail };
}

function verifierDuplicateUnknown(): DealVerifierResult {
  const checks: DealVerifierChecks = {
    price: pass('Precios coherentes'),
    discount: pass('Descuento 50% dentro de rango'),
    duplicate: unknown('duplicate_not_checked'),
    seller: pass('Amazon rating 4.7 (120 reviews)'),
    availability: unknown('Disponibilidad no verificada (sin fetch extra)'),
    quality: pass('Calidad básica OK'),
    risk: pass('Sin señales de riesgo fuertes'),
  };
  return {
    decision: 'auto_approve',
    score: 85,
    confidence: 0.91,
    reasons: ['Score 85 ≥ umbral auto-approve (78)'],
    checks,
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
  };
}

const readyMonetization: MonetizationReadinessResult = {
  status: 'ready',
  label: 'Lista',
  detail: 'Aventa puede monetizar este enlace.',
};

function perfectInput(over: Partial<AutonomousDecisionInput> = {}): AutonomousDecisionInput {
  return {
    verifier: verifierDuplicateUnknown(),
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

const shadowConfig: Pick<
  BotIngestConfig,
  'autoApproveMinScore' | 'autoApproveRequireImage' | 'autoApproveEnabled'
> = {
  autoApproveMinScore: 78,
  autoApproveRequireImage: true,
  autoApproveEnabled: true,
};

function goodMeta(over: Partial<ParsedOfferMetadata> = {}): ParsedOfferMetadata {
  return {
    canonicalUrl: AMAZON_URL,
    title: 'Laptop gaming RTX sólida para oficina',
    store: 'Amazon',
    imageUrl: 'https://m.media-amazon.com/images/I/xx.jpg',
    discountPrice: 12000,
    originalPrice: 24000,
    discountPercent: 50,
    signals: {
      soldQuantity: 500,
      ratingAverage: 4.7,
      ratingCount: 120,
      categoryId: 'MLM1648',
      effectiveDiscountPercent: 50,
      savingsVsHabitualPct: 22,
    },
    ...over,
  };
}

function ingestFile(name: string): string {
  return readFileSync(join(process.cwd(), 'lib/bots/ingest', name), 'utf8');
}

describe('FASE 4.2 — duplicate check real en shadow', () => {
  beforeEach(() => {
    resetAutonomousDecisionMetrics();
  });

  it('1. duplicate confirmado → AUTO_REJECT shadow', () => {
    const r = decideAutonomous(
      perfectInput({
        shadowDuplicate: {
          status: 'fail',
          detail: 'Duplicado de oferta existente (offer-1)',
          matchId: 'offer-1',
        },
      })
    );
    expect(r.decision).toBe('AUTO_REJECT');
    expect(r.checks.duplicate.status).toBe('fail');
  });

  it('2. duplicate no encontrado → duplicate pass', async () => {
    const lookup = await lookupDuplicateForShadow(null, AMAZON_URL, {
      find: async () => null,
    });
    expect(lookup.status).toBe('pass');
    expect(lookup.matchId).toBeNull();
  });

  it('3. detector no disponible → HUMAN_REVIEW', async () => {
    const lookup = await lookupDuplicateForShadow(null, AMAZON_URL);
    expect(lookup.status).toBe('unknown');
    expect(lookup.detail).toBe('duplicate_check_unavailable');
    const r = decideAutonomous(perfectInput({ shadowDuplicate: lookup }));
    expect(r.decision).toBe('HUMAN_REVIEW');
  });

  it('4. detector lanza error → HUMAN_REVIEW', async () => {
    const lookup = await lookupDuplicateForShadow(null, AMAZON_URL, {
      find: async () => {
        throw new Error('db down');
      },
    });
    expect(lookup.status).toBe('unknown');
    expect(lookup.detail).toMatch(/duplicate_check_error/);
    const r = decideAutonomous(perfectInput({ shadowDuplicate: lookup }));
    expect(r.decision).toBe('HUMAN_REVIEW');
    expect(r.decision).not.toBe('AUTO_APPROVE');
  });

  it('5. candidato perfecto + duplicate pass → AUTO_APPROVE shadow', () => {
    const r = decideAutonomous(
      perfectInput({
        shadowDuplicate: { status: 'pass', detail: 'Sin duplicado en pre-check', matchId: null },
      })
    );
    expect(r.decision).toBe('AUTO_APPROVE');
    expect(r.checks.duplicate.status).toBe('pass');
  });

  it('6. candidato perfecto + duplicate unknown → HUMAN_REVIEW', () => {
    const r = decideAutonomous(
      perfectInput({
        shadowDuplicate: { status: 'unknown', detail: 'duplicate_not_checked', matchId: null },
      })
    );
    expect(r.decision).toBe('HUMAN_REVIEW');
  });

  it('7. duplicate fail nunca puede producir AUTO_APPROVE', () => {
    const r = decideAutonomous(
      perfectInput({
        verifier: { ...verifierDuplicateUnknown(), decision: 'auto_approve', ingestDecision: 'auto_approve' },
        shadowDuplicate: {
          status: 'fail',
          detail: 'Duplicado de oferta existente (x)',
          matchId: 'x',
        },
      })
    );
    expect(r.decision).not.toBe('AUTO_APPROVE');
    expect(r.decision).toBe('AUTO_REJECT');
  });

  it('8. mismo candidato + mismo duplicate result → decisión determinista', () => {
    const input = perfectInput({
      shadowDuplicate: { status: 'pass', detail: 'Sin duplicado en pre-check', matchId: null },
    });
    const a = decideAutonomous(input, new Date('2026-01-01T00:00:00.000Z'));
    const b = decideAutonomous(input, new Date('2026-09-08T00:00:00.000Z'));
    expect(fingerprint(a)).toEqual(fingerprint(b));
  });

  it('9. worker ingest recibe duplicate status correctamente', async () => {
    const result = await observeIngestShadow({
      verifier: verifierDuplicateUnknown(),
      meta: goodMeta(),
      source: 'ml_worker',
      config: shadowConfig,
      sourceHealth: 'healthy',
      shadowDuplicate: { status: 'pass', detail: 'Sin duplicado en pre-check', matchId: null },
    });
    expect(result?.checks.duplicate.status).toBe('pass');
    const metrics = getAutonomousDecisionMetrics();
    expect(metrics.bySource.ml_worker.evaluated).toBe(1);
    expect(metrics.duplicatePass).toBe(1);
  });

  it('10. flujo manual / evaluateDealSafe no recibe duplicateChecked', () => {
    for (const file of ['runIngestCycle.ts', 'externalWorker.ts'] as const) {
      const src = ingestFile(file);
      const idx = src.indexOf('evaluateDealSafe(');
      expect(idx).toBeGreaterThan(-1);
      const slice = src.slice(idx, idx + 350);
      expect(slice).not.toMatch(/duplicateChecked/);
      expect(slice).not.toMatch(/duplicateOfferId/);
    }
    const insert = ingestFile('insertIngestedOffer.ts');
    expect(insert).toMatch(/findDuplicateOfferByUrl/);
  });

  it('11. publicación productiva no cambia (ingestDecision intacto)', async () => {
    const verified = verifierDuplicateUnknown();
    expect(verified.ingestDecision).toBe('auto_approve');
    await observeIngestShadow({
      verifier: verified,
      meta: goodMeta(),
      source: 'amazon_asin',
      config: shadowConfig,
      shadowDuplicate: {
        status: 'fail',
        detail: 'Duplicado de oferta existente (offer-9)',
        matchId: 'offer-9',
      },
    });
    expect(verified.ingestDecision).toBe('auto_approve');
    expect(verified.checks.duplicate.status).toBe('unknown');
  });

  it('12. Rewards/Commissions no se importan en el engine', () => {
    const observe = readFileSync(join(process.cwd(), 'lib/autonomous/observe.ts'), 'utf8');
    const decide = readFileSync(join(process.cwd(), 'lib/autonomous/decide.ts'), 'utf8');
    const lookup = readFileSync(join(process.cwd(), 'lib/autonomous/duplicateLookup.ts'), 'utf8');
    for (const src of [observe, decide, lookup]) {
      expect(src).not.toMatch(/lib\/rewards/);
      expect(src).not.toMatch(/lib\/commissions/);
    }
  });

  it('URL débil → unknown (no llama al detector)', async () => {
    let called = 0;
    const lookup = await lookupDuplicateForShadow(null, WEAK_URL, {
      find: async () => {
        called += 1;
        return null;
      },
    });
    expect(called).toBe(0);
    expect(lookup.status).toBe('unknown');
  });

  it('cache evita N+1 en el mismo fingerprint', async () => {
    let called = 0;
    const cache = new Map<string, Awaited<ReturnType<typeof lookupDuplicateForShadow>>>();
    const find = async () => {
      called += 1;
      return null;
    };
    await lookupDuplicateForShadow(null, AMAZON_URL, { cache, find });
    await lookupDuplicateForShadow(null, AMAZON_URL, { cache, find });
    expect(called).toBe(1);
  });

  it('métricas: ml_api se registra como ml_api_legacy', () => {
    expect(canonicalShadowSource('ml_api')).toBe('ml_api_legacy');
    expect(canonicalShadowSource('ml_worker')).toBe('ml_worker');
    expect(canonicalShadowSource('amazon_asin')).toBe('amazon_asin');
    expect(canonicalShadowSource('env_urls')).toBe('env_urls');
    observeAutonomousDecision(
      perfectInput({
        source: 'ml_api',
        shadowDuplicate: { status: 'pass', detail: 'ok', matchId: null },
      })
    );
    const m = getAutonomousDecisionMetrics();
    expect(m.bySource.ml_api_legacy.evaluated).toBe(1);
    expect(m.bySource.ml_api).toBeUndefined();
  });

  it('buildAutonomousInput aplica overlay sin mutar el verifier', () => {
    const verified = verifierDuplicateUnknown();
    const input = buildAutonomousInput({
      verifier: verified,
      meta: goodMeta(),
      source: 'amazon_asin',
      config: shadowConfig,
      sourceHealth: 'healthy',
      shadowDuplicate: { status: 'fail', detail: 'Duplicado de oferta existente (z)', matchId: 'z' },
    });
    const r = decideAutonomous(input);
    expect(r.decision).toBe('AUTO_REJECT');
    expect(verified.checks.duplicate.status).toBe('unknown');
    expect(verified.ingestDecision).toBe('auto_approve');
  });
});
