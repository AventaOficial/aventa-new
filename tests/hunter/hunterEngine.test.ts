import { describe, expect, it, beforeEach } from 'vitest';
import {
  applyBreakerTransition,
  cooldownMsForErrorCode,
  shouldAttemptCollect,
  HUNTER_FAILURE_THRESHOLD,
} from '@/lib/hunter/circuitBreaker';
import { defaultHealthRow, resetHunterHealthMemoryForTests } from '@/lib/hunter/healthStore';
import { deriveHuntingLevel, evaluateIsHunting } from '@/lib/hunter/isHunting';
import { dedupeHunterCandidates, ingestItemToCandidate } from '@/lib/hunter/normalize';
import { runHunterCollect } from '@/lib/hunter/engine';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import type { HunterCollectResult, HunterSource } from '@/lib/hunter/types';

function baseConfig(over: Partial<BotIngestConfig> = {}): BotIngestConfig {
  return {
    enabled: true,
    profile: 'standard',
    timezone: 'America/Mexico_City',
    botUserId: null,
    botUserIdTech: null,
    botUserIdStaples: null,
    botUserIdsForQuota: ['00000000-0000-0000-0000-000000000001'],
    normalMaxPerRunMin: 1,
    normalMaxPerRunMax: 3,
    boostMaxOffers: 10,
    boostLocalHourStart: 7,
    boostLocalMinuteEnd: 30,
    morningSustainedEnabled: false,
    morningHourStart: 5,
    morningHourEndExclusive: 11,
    morningMaxPerRunMin: 1,
    morningMaxPerRunMax: 3,
    dailyMaxOffers: 100,
    candidatePoolMax: 48,
    minDiscountPercent: 20,
    autoApproveEnabled: false,
    autoApproveMinScore: 78,
    rejectBelowScore: 42,
    forcePendingMinScore: 58,
    scoreWeights: [1, 1, 1, 1, 1],
    defaultCategory: 'tecnologia',
    urlsFromEnv: [],
    discoverMlEnabled: false,
    mlQueries: [],
    mlCategoryIds: [],
    techCategoryIds: [],
    mlUseDefaultQueries: false,
    mlSearchLimitPerRequest: 50,
    mlMaxCollect: 80,
    mlSortTrending: 'sold_quantity_desc',
    minSoldQuantityMl: 50,
    mlFetchReviews: false,
    mlReviewFetchMax: 18,
    minRatingAverage: 4,
    minRatingReviewsCount: 5,
    titleReGeneric: null,
    titleReSpam: null,
    amazonAsins: [],
    amazonDpBase: 'https://www.amazon.com.mx/dp/',
    amazonSource: 'scrape',
    amazonPaapiEnabled: false,
    amazonPaapiAccessKey: '',
    amazonPaapiSecretKey: '',
    amazonPaapiPartnerTag: '',
    amazonPaapiHost: 'webservices.amazon.com.mx',
    amazonPaapiRegion: 'us-east-1',
    keepaEnabled: false,
    keepaApiKey: '',
    keepaDomainId: 11,
    ...over,
  } as BotIngestConfig;
}

function mockSource(
  id: HunterSource['id'],
  collect: () => Promise<HunterCollectResult>,
  opts?: Partial<HunterSource>
): HunterSource {
  return {
    id,
    ingestSourceId: id === 'ml_api_legacy' ? 'ml_api' : id === 'env_urls' ? 'env_urls' : 'amazon_asin',
    displayName: id,
    priority: opts?.priority ?? 10,
    expectedIntervalMs: 15 * 60 * 1000,
    isEnabled: () => true,
    isAvailable: () => true,
    collect,
    ...opts,
  };
}

beforeEach(() => {
  resetHunterHealthMemoryForTests();
});

describe('hunter circuit breaker', () => {
  it('fuente healthy: success cierra breaker', () => {
    const prev = defaultHealthRow('ml_api_legacy', { consecutiveFailures: 2, breakerState: 'half_open' });
    const next = applyBreakerTransition({
      previous: prev,
      now: new Date(),
      collectOk: true,
      itemsFound: 3,
      probedAsHalfOpen: true,
    });
    expect(next.breakerState).toBe('closed');
    expect(next.consecutiveFailures).toBe(0);
    expect(next.status).toBe('healthy');
  });

  it('403 cuenta como fallo y degrada', () => {
    const prev = defaultHealthRow('ml_api_legacy');
    const next = applyBreakerTransition({
      previous: prev,
      now: new Date(),
      collectOk: false,
      errorCode: '403',
      itemsFound: 0,
      probedAsHalfOpen: false,
    });
    expect(next.consecutiveFailures).toBe(1);
    expect(next.status).toBe('degraded');
    expect(next.breakerState).toBe('closed');
  });

  it('500 usa cooldown corto al abrir', () => {
    expect(cooldownMsForErrorCode('500')).toBe(10 * 60 * 1000);
    expect(cooldownMsForErrorCode('403')).toBe(60 * 60 * 1000);
    expect(cooldownMsForErrorCode('429')).toBe(120 * 60 * 1000);
  });

  it('429 tiene cooldown largo', () => {
    expect(cooldownMsForErrorCode('429')).toBeGreaterThan(cooldownMsForErrorCode('403'));
  });

  it('timeout se trata como fallo de red/tiempo', () => {
    expect(cooldownMsForErrorCode('timeout')).toBe(10 * 60 * 1000);
  });

  it(`abre breaker tras ${HUNTER_FAILURE_THRESHOLD} fallos`, () => {
    let prev = defaultHealthRow('ml_api_legacy');
    for (let i = 0; i < HUNTER_FAILURE_THRESHOLD; i++) {
      const next = applyBreakerTransition({
        previous: prev,
        now: new Date(),
        collectOk: false,
        errorCode: '403',
        itemsFound: 0,
        probedAsHalfOpen: false,
      });
      prev = { ...prev, ...next, lastFailureAt: next.lastFailureAt };
    }
    expect(prev.breakerState).toBe('open');
    expect(prev.status).toBe('down');
    expect(prev.cooldownUntil).toBeTruthy();
  });

  it('cooldown bloquea attempt hasta vencer', () => {
    const now = new Date('2026-09-07T12:00:00Z');
    const health = defaultHealthRow('ml_api_legacy', {
      breakerState: 'open',
      status: 'down',
      cooldownUntil: '2026-09-07T13:00:00Z',
    });
    expect(shouldAttemptCollect(health, now).attempt).toBe(false);
    const later = new Date('2026-09-07T13:00:01Z');
    const gate = shouldAttemptCollect(health, later);
    expect(gate.attempt).toBe(true);
    expect(gate.nextBreaker).toBe('half_open');
  });

  it('half-open: fallo reabre breaker', () => {
    const prev = defaultHealthRow('ml_api_legacy', {
      breakerState: 'half_open',
      consecutiveFailures: 3,
    });
    const next = applyBreakerTransition({
      previous: prev,
      now: new Date(),
      collectOk: false,
      errorCode: '403',
      itemsFound: 0,
      probedAsHalfOpen: true,
    });
    expect(next.breakerState).toBe('open');
    expect(next.cooldownUntil).toBeTruthy();
  });

  it('half-open: éxito recupera a closed', () => {
    const prev = defaultHealthRow('ml_api_legacy', { breakerState: 'half_open', consecutiveFailures: 3 });
    const next = applyBreakerTransition({
      previous: prev,
      now: new Date(),
      collectOk: true,
      itemsFound: 1,
      probedAsHalfOpen: true,
    });
    expect(next.breakerState).toBe('closed');
    expect(next.consecutiveFailures).toBe(0);
  });

  it('zero results sin error NO abre breaker', () => {
    const prev = defaultHealthRow('env_urls', { consecutiveFailures: 0 });
    const next = applyBreakerTransition({
      previous: prev,
      now: new Date(),
      collectOk: true,
      itemsFound: 0,
      softZeroResult: true,
      probedAsHalfOpen: false,
    });
    expect(next.breakerState).toBe('closed');
    expect(next.consecutiveFailures).toBe(0);
    expect(next.status).toBe('degraded');
  });
});

describe('hunter dedupe', () => {
  it('dedupe entre dos fuentes mismo ML id', () => {
    const a = ingestItemToCandidate(
      {
        url: 'https://www.mercadolibre.com.mx/x/p/MLM123456789?wid=MLM123456789',
        source: 'ml_api',
      },
      'ml_api_legacy'
    );
    const b = ingestItemToCandidate(
      {
        url: 'https://articulo.mercadolibre.com.mx/MLM-123456789-foo_JM',
        source: 'ml_worker',
      },
      'ml_worker'
    );
    const out = dedupeHunterCandidates([a, b]);
    expect(out).toHaveLength(1);
  });

  it('dedupe dentro del mismo run', () => {
    const a = ingestItemToCandidate(
      { url: 'https://www.amazon.com.mx/dp/B0TESTASIN', source: 'amazon_asin' },
      'amazon_asin'
    );
    const b = ingestItemToCandidate(
      { url: 'https://www.amazon.com.mx/dp/B0TESTASIN?tag=x', source: 'amazon_asin' },
      'amazon_asin'
    );
    expect(dedupeHunterCandidates([a, b])).toHaveLength(1);
  });
});

describe('hunter engine isolation', () => {
  it('una fuente 403 no aborta las demás', async () => {
    const sources: HunterSource[] = [
      mockSource('ml_api_legacy', async () => ({
        ok: false,
        candidates: [],
        itemsFound: 0,
        errorCode: '403',
        errorMessageSafe: 'forbidden',
      })),
      mockSource(
        'env_urls',
        async () => ({
          ok: true,
          candidates: [
            ingestItemToCandidate(
              {
                url: 'https://www.amazon.com.mx/dp/B0GOODASIN',
                source: 'env_urls',
                sourceDetail: 'manual:url',
              },
              'env_urls'
            ),
          ],
          itemsFound: 1,
        }),
        { priority: 40 }
      ),
    ];

    const result = await runHunterCollect({
      config: baseConfig(),
      rotationWave: 0,
      sources,
      persistHealth: true,
    });

    expect(result.sourceRuns.find((r) => r.sourceId === 'ml_api_legacy')?.ok).toBe(false);
    expect(result.sourceRuns.find((r) => r.sourceId === 'env_urls')?.ok).toBe(true);
    expect(result.items.length).toBe(1);
  });

  it('Amazon sin credenciales = disabled', async () => {
    const result = await runHunterCollect({
      config: baseConfig({
        amazonPaapiEnabled: true,
        amazonSource: 'paapi',
        amazonAsins: ['B0TESTASIN1'],
        amazonPaapiAccessKey: '',
        amazonPaapiSecretKey: '',
        amazonPaapiPartnerTag: '',
      }),
      rotationWave: 0,
      sources: [
        {
          id: 'amazon_paapi',
          ingestSourceId: 'amazon_asin',
          displayName: 'Amazon PA-API',
          priority: 20,
          expectedIntervalMs: 15 * 60 * 1000,
          isEnabled: (ctx) => ctx.config.amazonPaapiEnabled && ctx.config.amazonSource === 'paapi',
          isAvailable: (ctx) =>
            Boolean(
              ctx.config.amazonPaapiAccessKey &&
                ctx.config.amazonPaapiSecretKey &&
                ctx.config.amazonPaapiPartnerTag
            ),
          collect: async () => {
            throw new Error('no debe llamarse');
          },
        },
      ],
      persistHealth: true,
    });
    expect(result.sourceRuns[0]?.skippedDisabled).toBe(true);
    expect(result.healthSnapshot[0]?.status).toBe('disabled');
  });
});

describe('isHunting', () => {
  it('true si otra fuente funciona con found reciente', () => {
    const now = new Date('2026-09-07T12:00:00Z');
    const result = evaluateIsHunting(
      [
        defaultHealthRow('ml_api_legacy', {
          status: 'down',
          breakerState: 'open',
          itemsFound: 0,
        }),
        defaultHealthRow('env_urls', {
          status: 'healthy',
          breakerState: 'closed',
          itemsFound: 2,
          lastSuccessAt: '2026-09-07T11:00:00Z',
          lastRunAt: '2026-09-07T11:00:00Z',
        }),
      ],
      now
    );
    expect(result.isHunting).toBe(true);
  });

  it('false si todas down', () => {
    const now = new Date('2026-09-07T12:00:00Z');
    const result = evaluateIsHunting(
      [
        defaultHealthRow('ml_api_legacy', {
          status: 'down',
          breakerState: 'open',
          cooldownUntil: '2026-09-07T13:00:00Z',
        }),
        defaultHealthRow('env_urls', { status: 'disabled', enabled: false }),
      ],
      now
    );
    expect(result.isHunting).toBe(false);
  });

  it('huntingLevel: healthy / degraded / down', () => {
    expect(deriveHuntingLevel([{ displayStatus: 'healthy' }], true)).toBe('healthy');
    expect(deriveHuntingLevel([{ displayStatus: 'healthy' }], false)).toBe('degraded');
    expect(deriveHuntingLevel([{ displayStatus: 'degraded' }], true)).toBe('degraded');
    expect(deriveHuntingLevel([{ displayStatus: 'down' }, { displayStatus: 'disabled' }], false)).toBe(
      'down'
    );
  });
});

describe('ml_api_legacy partial HTTP fail', () => {
  it('403 sin candidatos → fail-closed; 403 con hits → no tira yield', async () => {
    const { mlApiLegacyFailClosed } = await import('@/lib/hunter/sources/mlApiLegacy');
    expect(mlApiLegacyFailClosed(true, 0)).toBe(true);
    expect(mlApiLegacyFailClosed(true, 4)).toBe(false);
    expect(mlApiLegacyFailClosed(false, 0)).toBe(false);
  });
});
