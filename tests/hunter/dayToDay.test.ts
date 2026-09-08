import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyBreakerTransition, cooldownMsForErrorCode } from '@/lib/hunter/circuitBreaker';
import { defaultHealthRow } from '@/lib/hunter/healthStore';
import { ingestItemToCandidate } from '@/lib/hunter/normalize';
import { runHunterCollect } from '@/lib/hunter/engine';
import { isValidOfferImage } from '@/lib/hunter/enrichment/isValidOfferImage';
import {
  DAY_TO_DAY_SOURCES,
  classifyOfferMonetization,
  configurationStateFor,
  isDayToDayFlagOn,
  isDayToDaySourceId,
  summarizeDayToDaySupply,
} from '@/lib/hunter/dayToDay';
import { HUNTER_SOURCES } from '@/lib/hunter/sources';
import { hunterSourceForIngest } from '@/lib/autonomous';
import { decideAutonomous } from '@/lib/autonomous/decide';
import { evaluateMonetizationReadiness } from '@/lib/moderation/monetizationReadiness';
import { offerRequiresAffiliateValidation, assertOfferReadyForAffiliateApproval } from '@/lib/moderation/approveReadiness';
import { resolveBotInsertPublication } from '@/lib/bots/ingest/resolveBotInsertPublication';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import type { HunterCollectResult, HunterSource } from '@/lib/hunter/types';
import type { AutonomousDecisionInput } from '@/lib/autonomous/types';
import type { DealVerifierResult } from '@/lib/verifier/types';

const WALMART = 'https://www.walmart.com.mx/ip/12345';
const CHEDRAUI = 'https://www.chedraui.com.mx/producto/abc';
const AMAZON = 'https://www.amazon.com.mx/dp/B0TEST1234';

afterEach(() => {
  vi.unstubAllEnvs();
});

function healthPrev(over: Partial<ReturnType<typeof defaultHealthRow>> = {}) {
  return defaultHealthRow('walmart_mx', { enabled: true, status: 'healthy', ...over });
}

function reviewVerifier(): DealVerifierResult {
  return {
    decision: 'review',
    score: 70,
    confidence: 0.7,
    reasons: ['review'],
    checks: {
      price: { status: 'pass', detail: 'ok' },
      discount: { status: 'pass', detail: 'ok' },
      duplicate: { status: 'unknown', detail: 'n/a' },
      seller: { status: 'unknown', detail: 'n/a' },
      availability: { status: 'unknown', detail: 'n/a' },
      quality: { status: 'pass', detail: 'ok' },
      risk: { status: 'pass', detail: 'ok' },
    },
    breakdown: {
      discount: 40,
      popularity: 40,
      rating: 40,
      category: 40,
      priceAppeal: 40,
      historical: 40,
      total: 70,
    },
    ingestDecision: 'pending',
    duplicateOfferId: null,
  };
}

describe('FASE 6 Day-to-Day registry', () => {
  it('1. el registro declara las tres fuentes y ninguna está configurada', () => {
    expect(DAY_TO_DAY_SOURCES.map((s) => s.id)).toEqual([
      'walmart_mx',
      'bodega_aurrera_mx',
      'chedraui_mx',
    ]);
    for (const src of DAY_TO_DAY_SOURCES) {
      expect(src.family).toBe('day_to_day');
      expect(configurationStateFor(src)).toBe('not_configured');
      expect(src.isConfigured?.({ config: {} as never, rotationWave: 0 })).toBe(false);
      expect(src.isAvailable({ config: {} as never, rotationWave: 0 })).toBe(false);
    }
  });

  it('2. enabled por defecto es false (fail-closed)', () => {
    for (const src of DAY_TO_DAY_SOURCES) {
      expect(src.isEnabled({ config: {} as never, rotationWave: 0 })).toBe(false);
    }
    expect(isDayToDayFlagOn('DAY_TO_DAY_WALMART_ENABLED')).toBe(false);
  });

  it('2b. DAY_TO_DAY_WALMART_ENABLED=1 no configura discovery', () => {
    vi.stubEnv('DAY_TO_DAY_WALMART_ENABLED', '1');
    const walmart = DAY_TO_DAY_SOURCES.find((s) => s.id === 'walmart_mx')!;
    expect(walmart.isEnabled({ config: {} as never, rotationWave: 0 })).toBe(true);
    expect(walmart.isConfigured?.({ config: {} as never, rotationWave: 0 })).toBe(false);
    expect(configurationStateFor(walmart)).toBe('not_configured');
  });

  it('3. not_configured no dispara red', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    for (const src of DAY_TO_DAY_SOURCES) {
      const out = await src.collect({ config: {} as never, rotationWave: 0 });
      expect(out.ok).toBe(true);
      expect(out.candidates).toEqual([]);
      expect(out.errorCode).toBe('not_configured');
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('24. flags 0/false/no no encienden', () => {
    for (const value of ['0', 'false', 'no', '', 'YES', '2']) {
      vi.stubEnv('DAY_TO_DAY_WALMART_ENABLED', value);
      expect(isDayToDayFlagOn('DAY_TO_DAY_WALMART_ENABLED')).toBe(false);
    }
  });
});

describe('FASE 6 health vs error', () => {
  it('4. cero resultados no abre el breaker', () => {
    const out = applyBreakerTransition({
      previous: healthPrev(),
      now: new Date(),
      collectOk: true,
      itemsFound: 0,
      softZeroResult: true,
      probedAsHalfOpen: false,
    });
    expect(out.breakerState).toBe('closed');
    expect(out.consecutiveFailures).toBe(0);
    expect(out.status).not.toBe('down');
  });

  it('5. 403 es fallo y cooldown largo', () => {
    expect(cooldownMsForErrorCode('403')).toBe(60 * 60 * 1000);
    const out = applyBreakerTransition({
      previous: healthPrev({ consecutiveFailures: 2 }),
      now: new Date(),
      collectOk: false,
      errorCode: '403',
      itemsFound: 0,
      probedAsHalfOpen: false,
    });
    expect(out.status).toBe('down');
    expect(out.breakerState).toBe('open');
  });

  it('6. timeout es fallo', () => {
    expect(cooldownMsForErrorCode('timeout')).toBe(10 * 60 * 1000);
    const out = applyBreakerTransition({
      previous: healthPrev({ consecutiveFailures: 2 }),
      now: new Date(),
      collectOk: false,
      errorCode: 'timeout',
      itemsFound: 0,
      probedAsHalfOpen: false,
    });
    expect(out.breakerState).toBe('open');
  });

  it('7. 429 es fallo y cooldown mayor', () => {
    expect(cooldownMsForErrorCode('429')).toBeGreaterThan(cooldownMsForErrorCode('500'));
    const out = applyBreakerTransition({
      previous: healthPrev({ consecutiveFailures: 2 }),
      now: new Date(),
      collectOk: false,
      errorCode: '429',
      itemsFound: 0,
      probedAsHalfOpen: false,
    });
    expect(out.breakerState).toBe('open');
  });
});

describe('FASE 6 aislamiento', () => {
  it('8. una fuente rota no detiene a las demás', async () => {
    const healthy: HunterSource = {
      id: 'chedraui_mx',
      ingestSourceId: 'chedraui_mx',
      displayName: 'Chedraui',
      priority: 1,
      expectedIntervalMs: 60_000,
      isEnabled: () => true,
      isAvailable: () => true,
      async collect(): Promise<HunterCollectResult> {
        return {
          ok: true,
          candidates: [
            ingestItemToCandidate(
              { url: CHEDRAUI, source: 'chedraui_mx' },
              'chedraui_mx',
              '2026-09-08T00:00:00.000Z'
            ),
          ],
          itemsFound: 1,
        };
      },
    };
    const broken: HunterSource = {
      id: 'walmart_mx',
      ingestSourceId: 'walmart_mx',
      displayName: 'Walmart',
      priority: 2,
      expectedIntervalMs: 60_000,
      isEnabled: () => true,
      isAvailable: () => true,
      async collect(): Promise<HunterCollectResult> {
        throw new Error('boom');
      },
    };

    const result = await runHunterCollect({
      config: loadBotIngestConfig('standard'),
      rotationWave: 0,
      persistHealth: false,
      sources: [broken, healthy],
    });

    expect(result.sourceRuns.find((r) => r.sourceId === 'walmart_mx')?.ok).toBe(false);
    expect(result.sourceRuns.find((r) => r.sourceId === 'chedraui_mx')?.ok).toBe(true);
    expect(result.items.some((i) => i.source === 'chedraui_mx')).toBe(true);
  });

  it('9. HUNTER_SOURCES incluye Day-to-Day y las salta sin error', async () => {
    expect(HUNTER_SOURCES.some((s) => isDayToDaySourceId(s.id))).toBe(true);
    const result = await runHunterCollect({
      config: loadBotIngestConfig('standard'),
      rotationWave: 0,
      persistHealth: false,
      sources: DAY_TO_DAY_SOURCES,
    });
    expect(result.sourceRuns.every((r) => r.skippedDisabled && r.ok)).toBe(true);
    expect(result.items).toEqual([]);
    for (const row of result.healthSnapshot) {
      expect(row.status).toBe('disabled');
      expect(row.lastErrorCode).toBe('not_configured');
    }
  });
});

describe('FASE 6 monetización independiente de source', () => {
  it('11. source y monetization son campos distintos', () => {
    const candidate = ingestItemToCandidate(
      { url: WALMART, source: 'walmart_mx', sourceDetail: 'day_to_day:walmart_mx' },
      'walmart_mx'
    );
    expect(candidate.source).toBe('walmart_mx');
    expect(candidate.rawMetadata.hunterSource).toBe('walmart_mx');
    expect(candidate.rawMetadata.monetizationStatus).toBe('non_affiliate');
  });

  it('12. oferta Walmart sin afiliado es candidata válida', () => {
    vi.stubEnv('WALMART_AFFILIATE_QUERY', '');
    expect(classifyOfferMonetization(WALMART)).toBe('non_affiliate');
    expect(offerRequiresAffiliateValidation(WALMART)).toBe(false);
    expect(assertOfferReadyForAffiliateApproval({ offerUrl: WALMART, linkModOk: false }).ok).toBe(
      true
    );
    const pub = resolveBotInsertPublication({ requestedStatus: 'pending', offerUrl: WALMART });
    expect(pub.status).toBe('pending');
  });

  it('13. oferta con programa de afiliados sigue siendo affiliate', () => {
    vi.stubEnv('AMAZON_ASSOCIATE_TAG', 'aventa-20');
    expect(classifyOfferMonetization(AMAZON)).toBe('affiliate');
    expect(offerRequiresAffiliateValidation(AMAZON)).toBe(true);
  });

  it('URL vacía es unknown, no non_affiliate inventado', () => {
    expect(classifyOfferMonetization('')).toBe('unknown');
    expect(classifyOfferMonetization('no-es-url')).toBe('unknown');
  });
});

describe('FASE 6 pipeline común', () => {
  it('10. normaliza al modelo HunterCandidate / IngestItem', () => {
    const item = {
      url: WALMART,
      source: 'walmart_mx' as const,
      precomputedMeta: {
        canonicalUrl: WALMART,
        title: 'Leche Lala 1L',
        store: 'Walmart',
        imageUrl: 'https://i5.walmartimages.com.mx/producto.jpg',
        discountPrice: 22,
        originalPrice: 28,
        discountPercent: 21,
      },
    };
    const c = ingestItemToCandidate(item, 'walmart_mx');
    expect(c.title).toBe('Leche Lala 1L');
    expect(c.price).toBe(22);
    expect(c.store).toBe('Walmart');
    expect(c.ingestItem.source).toBe('walmart_mx');
    expect(c.rawMetadata.monetizationStatus).toBe('non_affiliate');
  });

  it('16-17. verifier + shadow observan walmart sin publicar', () => {
    const input: AutonomousDecisionInput = {
      verifier: reviewVerifier(),
      thresholds: { autoApproveMinScore: 78, requireImage: true, autoApproveEnabled: true },
      monetization: evaluateMonetizationReadiness({ offerUrl: WALMART }),
      requiresAffiliateValidation: offerRequiresAffiliateValidation(WALMART),
      source: 'walmart_mx',
      sourceHealth: 'healthy',
      existingModerationStatus: null,
      title: 'Leche Lala 1L lista para desayuno',
      imageUrl: 'https://i5.walmartimages.com.mx/producto.jpg',
      store: 'Walmart',
      price: 22,
      discountPercent: 21,
      effectiveDiscountPercent: 21,
      suspectedArtificialListPrice: false,
    };
    const decision = decideAutonomous(input);
    expect(decision.checks.monetization.status).toBe('pass');
    expect(['AUTO_APPROVE', 'HUMAN_REVIEW', 'AUTO_REJECT']).toContain(decision.decision);
    expect(hunterSourceForIngest('walmart_mx')).toBe('walmart_mx');
  });

  it('18. no auto-publish: pending pedido se queda pending', () => {
    expect(
      resolveBotInsertPublication({ requestedStatus: 'pending', offerUrl: WALMART }).status
    ).toBe('pending');
  });

  it('19. legacy auto-approve write permanece OFF por omisión', () => {
    expect(loadBotIngestConfig('standard').legacyAutoApproveWriteEnabled).toBe(false);
  });

  it('20. validación de imagen existente no acepta logos', () => {
    expect(isValidOfferImage('https://www.walmart.com.mx/favicon.ico')).toBe(false);
    expect(isValidOfferImage('https://i5.walmartimages.com.mx/asr/producto.jpg')).toBe(true);
  });

  it('21. provenance de source se conserva', () => {
    const c = ingestItemToCandidate(
      { url: CHEDRAUI, source: 'chedraui_mx', sourceDetail: 'day_to_day:chedraui_mx' },
      'chedraui_mx'
    );
    expect(c.rawMetadata.ingestSource).toBe('chedraui_mx');
    expect(c.rawMetadata.sourceDetail).toBe('day_to_day:chedraui_mx');
  });
});

describe('FASE 6 métricas admin', () => {
  it('23. not_configured no se reporta como down', () => {
    const snap = summarizeDayToDaySupply([]);
    expect(snap.sourcesNotConfigured).toBe(3);
    expect(snap.sourcesConfigured).toBe(0);
    expect(snap.sourcesDown).toBe(0);
    expect(snap.recommendation).toMatch(/no configured sources/i);
    expect(snap.candidates).toBe(0);
  });

  it('métricas de health no inventan inserts', () => {
    const snap = summarizeDayToDaySupply([
      defaultHealthRow('walmart_mx', {
        status: 'disabled',
        itemsFound: 0,
        itemsInserted: 4,
      }),
    ]);
    // Si alguien persistió inserts, se reportan; el catálogo no inventa los otros.
    expect(snap.inserted).toBe(4);
    expect(snap.sources.find((s) => s.id === 'bodega_aurrera_mx')!.itemsInserted).toBe(0);
  });
});
