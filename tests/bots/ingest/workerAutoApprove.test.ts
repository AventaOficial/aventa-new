import { describe, it, expect } from 'vitest';
import { shouldAutoApproveWorkerCandidate } from '@/lib/bots/ingest/workerAutoApprove';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';

function cfg(over: Partial<BotIngestConfig> = {}): BotIngestConfig {
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

const goodMeta = {
  canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-123-foo',
  title: 'Audífonos bluetooth con cancelación de ruido',
  store: 'Mercado Libre',
  imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_2X.webp',
  discountPrice: 499,
  originalPrice: 999,
  discountPercent: 50,
  signals: { listingTypeId: 'worker_card' as const },
};

describe('shouldAutoApproveWorkerCandidate', () => {
  it('respeta score clásico auto_approve', () => {
    expect(
      shouldAutoApproveWorkerCandidate({
        config: cfg(),
        decision: 'auto_approve',
        scoreTotal: 80,
        meta: goodMeta,
      })
    ).toBe(true);
  });

  it('aprueba worker con score medio + % + imagen', () => {
    expect(
      shouldAutoApproveWorkerCandidate({
        config: cfg(),
        decision: 'pending',
        scoreTotal: 56,
        meta: goodMeta,
      })
    ).toBe(true);
  });

  it('rechaza sin imagen si se exige', () => {
    expect(
      shouldAutoApproveWorkerCandidate({
        config: cfg(),
        decision: 'pending',
        scoreTotal: 70,
        meta: { ...goodMeta, imageUrl: '' },
      })
    ).toBe(false);
  });

  it('rechaza si AUTO_APPROVE está off', () => {
    expect(
      shouldAutoApproveWorkerCandidate({
        config: cfg({ autoApproveEnabled: false }),
        decision: 'auto_approve',
        scoreTotal: 90,
        meta: goodMeta,
      })
    ).toBe(false);
  });

  it('rechaza descuento bajo el umbral worker', () => {
    expect(
      shouldAutoApproveWorkerCandidate({
        config: cfg(),
        decision: 'pending',
        scoreTotal: 70,
        meta: { ...goodMeta, discountPercent: 20 },
      })
    ).toBe(false);
  });
});
