import { beforeEach, describe, expect, it } from 'vitest';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import { applyMlPriceIntelToMeta } from '@/lib/bots/ingest/priceIntel';
import type { MlPriceIntel } from '@/lib/bots/ingest/mlPriceEngine';
import type { MlPriceQuote } from '@/lib/bots/ingest/mlPricesApi';
import {
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
    legacyAutoApproveWriteEnabled: false,
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
    },
    ...over,
  };
}

describe('Deal Verifier — evaluateDeal', () => {
  beforeEach(() => {
    resetDealVerifierMetrics();
  });

  it('1. oferta válida → auto_approve', () => {
    const r = evaluateDeal({
      meta: goodMeta(),
      config: baseConfig(),
      source: 'ml_api',
    });
    expect(r.decision).toBe('auto_approve');
    expect(r.ingestDecision).toBe('auto_approve');
    expect(r.reasons.length).toBeGreaterThan(0);
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  it('2. descuento bajo → reject', () => {
    const r = evaluateDeal({
      meta: goodMeta({ discountPercent: 5 }),
      config: baseConfig({ minDiscountPercent: 20 }),
      source: 'ml_api',
    });
    expect(r.decision).toBe('reject');
    expect(r.checks.discount.status).toBe('fail');
    expect(r.reasons.some((x) => /descuento/i.test(x))).toBe(true);
  });

  it('3. precio actual >= original → reject', () => {
    const r = evaluateDeal({
      meta: goodMeta({ discountPrice: 2000, originalPrice: 2000, discountPercent: 0 }),
      config: baseConfig(),
      source: 'ml_api',
    });
    expect(r.decision).toBe('reject');
    expect(r.checks.price.status).toBe('fail');
  });

  it('4. precio artificial sospechoso → review (no auto_approve)', () => {
    const r = evaluateDeal({
      meta: goodMeta({
        signals: {
          soldQuantity: 500,
          ratingAverage: 4.7,
          ratingCount: 120,
          categoryId: 'MLM1648',
          condition: 'new',
          effectiveDiscountPercent: 50,
          savingsVsHabitualPct: 22,
          suspectedArtificialListPrice: true,
        },
      }),
      config: baseConfig(),
      source: 'ml_api',
    });
    expect(r.decision).toBe('review');
    expect(r.checks.risk.status).toBe('warn');
  });

  it('5. duplicado → reject', () => {
    const r = evaluateDeal({
      meta: goodMeta(),
      config: baseConfig(),
      source: 'ml_api',
      duplicateOfferId: 'offer-dup-1',
    });
    expect(r.decision).toBe('reject');
    expect(r.checks.duplicate.status).toBe('fail');
    expect(r.duplicateOfferId).toBe('offer-dup-1');
  });

  it('6. URL inválida → reject', () => {
    const r = evaluateDeal({
      meta: goodMeta({ canonicalUrl: 'not-a-url' }),
      config: baseConfig(),
      source: 'ml_api',
      url: 'ftp://bad',
    });
    expect(r.decision).toBe('reject');
    expect(r.checks.quality.status).toBe('fail');
  });

  it('7. datos incompletos (título corto) → reject', () => {
    const r = evaluateDeal({
      meta: goodMeta({ title: 'Corto' }),
      config: baseConfig(),
      source: 'ml_api',
    });
    expect(r.decision).toBe('reject');
    expect(r.checks.quality.status).toBe('fail');
  });

  it('8. vendedor/fuente desconocida → no crash (unknown)', () => {
    const r = evaluateDeal({
      meta: goodMeta({ store: '' }),
      config: baseConfig(),
      source: 'unknown_feed',
    });
    expect(r.checks.seller.status).toBe('unknown');
    expect(r.decision).toBeDefined();
    expect(['auto_approve', 'review', 'reject']).toContain(r.decision);
  });

  it('9. ml_worker con discountPercent válido → conservar descuento (post preserve)', () => {
    const card: ParsedOfferMetadata = {
      canonicalUrl: 'https://www.mercadolibre.com.mx/x/p/MLM1234567890',
      title: 'Audífonos bluetooth con cancelación de ruido',
      store: 'Mercado Libre',
      imageUrl: 'https://http2.mlstatic.com/x.jpg',
      discountPrice: 999,
      originalPrice: 2999,
      discountPercent: 67,
      signals: { listingTypeId: 'worker_card', condition: 'new' },
    };
    const intel: MlPriceIntel = {
      lowest30d: null,
      lowest90d: null,
      habitual30d: null,
      current: 999,
      listPrice: 1050,
      regularPrice: 999,
      priceVsLowest90dPct: null,
      savingsVsHabitualPct: null,
      effectiveDiscountPercent: 0,
      suspectedArtificialListPrice: true,
      samples90d: 1,
      historyReady: false,
    };
    const quote: MlPriceQuote = {
      current: 999,
      listPrice: 1050,
      regularPrice: 999,
    };
    const meta = applyMlPriceIntelToMeta(card, { quote, intel }, { preserveLabelDiscount: true });
    expect(meta.discountPercent).toBe(67);

    const r = evaluateDeal({
      meta,
      config: baseConfig(),
      source: 'ml_worker',
      enableWorkerAutoApprove: true,
    });
    expect(meta.discountPercent).toBe(67);
    expect(r.decision).not.toBe('auto_approve');
    expect(r.checks.discount.status).not.toBe('fail');
  });

  it('10. Price Intel efectivo distinto al card → preserveLabelDiscount intacto', () => {
    const card = goodMeta({
      discountPercent: 54,
      discountPrice: 1400,
      originalPrice: 3000,
      signals: { listingTypeId: 'worker_card', condition: 'new' },
    });
    const meta = applyMlPriceIntelToMeta(
      card,
      {
        quote: { current: 1400, listPrice: 1450, regularPrice: 1400 },
        intel: {
          lowest30d: null,
          lowest90d: null,
          habitual30d: null,
          current: 1400,
          listPrice: 1450,
          regularPrice: 1400,
          priceVsLowest90dPct: null,
          savingsVsHabitualPct: null,
          effectiveDiscountPercent: 3,
          suspectedArtificialListPrice: false,
          samples90d: 2,
          historyReady: false,
        },
      },
      { preserveLabelDiscount: true }
    );
    expect(meta.discountPercent).toBe(54);
    expect(meta.signals?.effectiveDiscountPercent).toBe(3);

    const r = evaluateDeal({
      meta,
      config: baseConfig(),
      source: 'ml_worker',
      enableWorkerAutoApprove: true,
    });
    expect(meta.discountPercent).toBe(54);
    expect(r.decision).not.toBe('auto_approve');
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it('11. error interno → fail closed (reject)', () => {
    const broken = goodMeta();
    Object.defineProperty(broken, 'discountPrice', {
      get() {
        throw new Error('boom-interno');
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

  it('12. resultado explicable con reasons', () => {
    const r = evaluateDeal({
      meta: goodMeta({ discountPercent: 8 }),
      config: baseConfig(),
      source: 'ml_api',
    });
    expect(Array.isArray(r.reasons)).toBe(true);
    expect(r.reasons.length).toBeGreaterThan(0);
    expect(r.checks).toHaveProperty('price');
    expect(r.checks).toHaveProperty('discount');
    expect(r.checks).toHaveProperty('duplicate');
    expect(r.checks).toHaveProperty('seller');
    expect(r.checks).toHaveProperty('availability');
    expect(r.checks).toHaveProperty('quality');
    expect(r.checks).toHaveProperty('risk');
  });
});
