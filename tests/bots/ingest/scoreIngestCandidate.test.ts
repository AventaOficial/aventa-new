import { describe, it, expect } from 'vitest';
import { scoreIngestCandidate } from '@/lib/bots/ingest/scoreIngestCandidate';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';

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

describe('scoreIngestCandidate', () => {
  it('alta señal + tech → auto_approve', () => {
    const cfg = baseConfig();
    const r = scoreIngestCandidate(
      {
        canonicalUrl: 'https://a',
        title: 'Laptop gaming',
        store: 'Mercado Libre',
        imageUrl: 'x',
        discountPrice: 1000,
        originalPrice: 2000,
        discountPercent: 50,
      },
      {
        soldQuantity: 500,
        ratingAverage: 4.7,
        ratingCount: 120,
        categoryId: 'MLM1648',
        condition: 'new',
      },
      cfg
    );
    expect(r.decision).toBe('auto_approve');
    expect(r.breakdown.total).toBeGreaterThanOrEqual(cfg.autoApproveMinScore);
  });

  it('score bajo → reject', () => {
    const cfg = baseConfig({ rejectBelowScore: 50 });
    const r = scoreIngestCandidate(
      {
        canonicalUrl: 'https://a',
        title: 'Cosas varias genéricas',
        store: 'X',
        imageUrl: 'x',
        discountPrice: 99,
        originalPrice: 100,
        discountPercent: 1,
      },
      { soldQuantity: 2, categoryId: 'MLM9999' },
      cfg
    );
    expect(r.decision).toBe('reject');
  });

  it('FORCE_PENDING_MIN_SCORE: iba a reject pero sube a pending', () => {
    const cfg = baseConfig({
      rejectBelowScore: 50,
      forcePendingMinScore: 45,
      autoApproveMinScore: 78,
    });
    const r = scoreIngestCandidate(
      {
        canonicalUrl: 'https://a',
        title: 'Producto con señal media',
        store: 'ML',
        imageUrl: 'x',
        discountPrice: 500,
        originalPrice: 800,
        discountPercent: 22,
      },
      { soldQuantity: 5, ratingAverage: 3.9, ratingCount: 4, categoryId: 'MLM9999' },
      cfg
    );
    expect(r.breakdown.total).toBeLessThan(cfg.rejectBelowScore);
    expect(r.decision).toBe('pending');
  });
});
