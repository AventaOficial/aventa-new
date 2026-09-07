import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import * as scoreMod from '@/lib/bots/ingest/scoreIngestCandidate';
import {
  checkDuplicateKnown,
  evaluateDeal,
  evaluateDealSafe,
  resetDealVerifierMetrics,
} from '@/lib/verifier';

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

function goodMeta(over: Partial<ParsedOfferMetadata> = {}): ParsedOfferMetadata {
  return {
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
      listingTypeId: 'worker_card',
    },
    ...over,
  };
}

function mockScore(total: number, decision: 'auto_approve' | 'pending' | 'reject' = 'auto_approve') {
  return vi.spyOn(scoreMod, 'scoreIngestCandidate').mockReturnValue({
    decision,
    breakdown: {
      discount: 50,
      popularity: 50,
      rating: 50,
      category: 50,
      priceAppeal: 50,
      historical: 50,
      total,
    },
  });
}

describe('Deal Verifier — FASE 3.1 hardening', () => {
  beforeEach(() => {
    resetDealVerifierMetrics();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. score NaN → no auto approve', () => {
    mockScore(Number.NaN, 'auto_approve');
    const r = evaluateDeal({
      meta: goodMeta(),
      config: baseConfig(),
      source: 'ml_worker',
      enableWorkerAutoApprove: true,
    });
    expect(r.decision).toBe('review');
    expect(r.reasons.some((x) => x.includes('invalid_score'))).toBe(true);
  });

  it('2. score Infinity → no auto approve', () => {
    mockScore(Number.POSITIVE_INFINITY, 'auto_approve');
    const r = evaluateDeal({
      meta: goodMeta(),
      config: baseConfig(),
      source: 'ml_worker',
      enableWorkerAutoApprove: true,
    });
    expect(r.decision).not.toBe('auto_approve');
    expect(r.reasons.some((x) => x.includes('invalid_score'))).toBe(true);
  });

  it('3. score undefined → no auto approve', () => {
    mockScore(undefined as unknown as number, 'auto_approve');
    const r = evaluateDeal({
      meta: goodMeta(),
      config: baseConfig(),
      source: 'ml_worker',
      enableWorkerAutoApprove: true,
    });
    expect(r.decision).not.toBe('auto_approve');
    expect(r.reasons.some((x) => x.includes('invalid_score'))).toBe(true);
  });

  it('4. duplicate unknown → unknown, no pass', () => {
    const check = checkDuplicateKnown({});
    expect(check.status).toBe('unknown');
    expect(check.detail).toBe('duplicate_not_checked');

    const r = evaluateDeal({
      meta: goodMeta(),
      config: baseConfig(),
      source: 'ml_api',
    });
    expect(r.checks.duplicate.status).toBe('unknown');
    expect(r.checks.duplicate.detail).toBe('duplicate_not_checked');
  });

  it('5. duplicate true → reject', () => {
    const r = evaluateDeal({
      meta: goodMeta(),
      config: baseConfig(),
      source: 'ml_api',
      duplicateOfferId: 'dup-xyz',
      duplicateChecked: true,
    });
    expect(r.decision).toBe('reject');
    expect(r.checks.duplicate.status).toBe('fail');
  });

  it('6. duplicate false comprobado → pass', () => {
    const check = checkDuplicateKnown({ duplicateChecked: true });
    expect(check.status).toBe('pass');

    const r = evaluateDeal({
      meta: goodMeta(),
      config: baseConfig(),
      source: 'ml_api',
      duplicateChecked: true,
    });
    expect(r.checks.duplicate.status).toBe('pass');
    expect(r.decision).toBe('auto_approve');
  });

  it('7. card 68 / effective 5 / artificial false → review/no auto', () => {
    const r = evaluateDeal({
      meta: goodMeta({
        discountPercent: 68,
        discountPrice: 3200,
        originalPrice: 10000,
        signals: {
          listingTypeId: 'worker_card',
          condition: 'new',
          effectiveDiscountPercent: 5,
          soldQuantity: 800,
          ratingAverage: 4.8,
          ratingCount: 200,
          categoryId: 'MLM1648',
        },
      }),
      config: baseConfig(),
      source: 'ml_worker',
      enableWorkerAutoApprove: true,
    });
    expect(r.decision).toBe('review');
    expect(r.checks.discount.status).toBe('warn');
  });

  it('8. card 60 / effective 3 / artificial true → review', () => {
    const r = evaluateDeal({
      meta: goodMeta({
        discountPercent: 60,
        discountPrice: 4000,
        originalPrice: 10000,
        signals: {
          listingTypeId: 'worker_card',
          condition: 'new',
          effectiveDiscountPercent: 3,
          suspectedArtificialListPrice: true,
        },
      }),
      config: baseConfig(),
      source: 'ml_worker',
      enableWorkerAutoApprove: true,
    });
    expect(r.decision).toBe('review');
    expect(r.decision).not.toBe('auto_approve');
    expect(r.decision).not.toBe('reject');
  });

  it('9. card 43 / effective 35 → puede continuar con política normal', () => {
    mockScore(85, 'auto_approve');
    const r = evaluateDeal({
      meta: goodMeta({
        discountPercent: 43,
        discountPrice: 5700,
        originalPrice: 10000,
        signals: {
          soldQuantity: 500,
          ratingAverage: 4.7,
          ratingCount: 120,
          categoryId: 'MLM1648',
          condition: 'new',
          effectiveDiscountPercent: 35,
          savingsVsHabitualPct: 22,
        },
      }),
      config: baseConfig(),
      source: 'ml_api',
    });
    // gap 8 < 25 → sin bloqueo por gap; score alto → auto_approve
    expect(r.checks.discount.status).toBe('pass');
    expect(r.decision).toBe('auto_approve');
  });

  it('10. gap grande → no auto approve', () => {
    mockScore(90, 'auto_approve');
    const r = evaluateDeal({
      meta: goodMeta({
        discountPercent: 70,
        signals: {
          ...goodMeta().signals,
          effectiveDiscountPercent: 10,
          suspectedArtificialListPrice: false,
        },
      }),
      config: baseConfig(),
      source: 'ml_api',
    });
    expect(r.decision).toBe('review');
    expect(r.reasons.some((x) => /suspicious_discount_gap/i.test(x))).toBe(true);
  });

  it('11. artificial + score alto → review', () => {
    mockScore(95, 'auto_approve');
    const r = evaluateDeal({
      meta: goodMeta({
        signals: {
          ...goodMeta().signals,
          effectiveDiscountPercent: 50,
          suspectedArtificialListPrice: true,
        },
      }),
      config: baseConfig(),
      source: 'ml_api',
    });
    expect(r.decision).toBe('review');
  });

  it('12. invalid score + worker upgrade → no auto approve', () => {
    mockScore(Number.NaN, 'pending');
    const r = evaluateDeal({
      meta: goodMeta({
        discountPercent: 55,
        signals: {
          listingTypeId: 'worker_card',
          condition: 'new',
          effectiveDiscountPercent: 55,
        },
      }),
      config: baseConfig(),
      source: 'ml_worker',
      enableWorkerAutoApprove: true,
    });
    expect(r.decision).toBe('review');
    expect(r.reasons.some((x) => x.includes('invalid_score'))).toBe(true);
  });

  it('13. autoApproveEnabled=false → nunca auto approve', () => {
    const r = evaluateDeal({
      meta: goodMeta(),
      config: baseConfig({ autoApproveEnabled: false }),
      source: 'ml_worker',
      enableWorkerAutoApprove: true,
    });
    expect(r.decision).not.toBe('auto_approve');
  });

  it('14. critical failure + artificial → reject', () => {
    const r = evaluateDeal({
      meta: goodMeta({
        title: 'x',
        signals: {
          ...goodMeta().signals,
          suspectedArtificialListPrice: true,
        },
      }),
      config: baseConfig(),
      source: 'ml_api',
    });
    expect(r.decision).toBe('reject');
    expect(r.checks.quality.status).toBe('fail');
  });

  it('15. Verifier exception → fail closed', () => {
    const broken = goodMeta();
    Object.defineProperty(broken, 'discountPercent', {
      get() {
        throw new Error('explode');
      },
    });
    const r = evaluateDealSafe({
      meta: broken,
      config: baseConfig(),
      source: 'ml_api',
    });
    expect(r.decision).toBe('reject');
    expect(r.reasons[0]).toMatch(/fail closed/i);
  });
});
