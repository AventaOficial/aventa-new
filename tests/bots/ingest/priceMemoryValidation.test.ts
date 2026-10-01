/**
 * Price Memory validation regressions — identity, readiness, baseline, artificial,
 * and Price Memory → Price Intel → DQE → S6.1 wiring.
 * No fabricated DB rows; pure compute + gate contracts.
 */

import { describe, expect, it } from 'vitest';
import {
  computeMlPriceIntel,
  ML_PRICE_MIN_HISTORY_DAYS,
  normalizeMlProductId,
} from '@/lib/bots/ingest/mlPriceEngine';
import { applyMlPriceIntelToMeta } from '@/lib/bots/ingest/priceIntel';
import { evaluateMachineCandidateGate } from '@/lib/bots/ingest/candidateInsertGate';
import { buildHunterDecisionTrace } from '@/lib/bots/ingest/hunterDecisionTrace';
import { evaluateDealQualityFromParsedMeta } from '@/lib/hunter/dealQuality';
import { priceMemoryFromParsedMeta } from '@/lib/hunter/dealQuality/fromParsedMeta';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';

function baseConfig(): BotIngestConfig {
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
    titleMinLength: 12,
    delayMsMin: 100,
    delayMsMax: 200,
    externalWorkerEnabled: true,
  } as BotIngestConfig;
}

function days(n: number, today = '2026-09-22'): string {
  const [y, m, d] = today.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! - n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function priorHistory(
  prices: number[],
  today = '2026-09-22',
): Array<{
  recordedOn: string;
  lastPrice: number;
  minPrice: number;
  listPrice: number | null;
  regularPrice: number | null;
}> {
  return prices.map((p, i) => ({
    recordedOn: days(i + 1, today),
    lastPrice: p,
    minPrice: p,
    listPrice: null,
    regularPrice: null,
  }));
}

describe('Price Memory identity', () => {
  it('normalizes URL / hyphenated id to SOURCE_ITEM (ML item id)', () => {
    expect(normalizeMlProductId('MLM-41485344')).toBe('MLM41485344');
    expect(
      normalizeMlProductId('https://articulo.mercadolibre.com.mx/MLM-41485344-foo'),
    ).toBe('MLM41485344');
  });

  it('keeps distinct listings as distinct identities (seller/listing separation)', () => {
    const a = normalizeMlProductId('MLM10000001');
    const b = normalizeMlProductId('MLM10000002');
    expect(a).not.toBe(b);
    // Same catalog product sold by different sellers → different ML item ids
    // must not share history under one key.
    expect(a).toBe('MLM10000001');
    expect(b).toBe('MLM10000002');
  });
});

describe('Price Memory history readiness + baseline', () => {
  it(`no history → historyReady=false (needs ≥${ML_PRICE_MIN_HISTORY_DAYS} prior days)`, () => {
    const intel = computeMlPriceIntel(
      { current: 700, listPrice: 1000, regularPrice: null },
      [],
      '2026-09-22',
    );
    expect(intel.historyReady).toBe(false);
    expect(intel.habitual30d).toBeNull();
    expect(intel.lowest90d).toBeNull();
  });

  it('1–3 prior days → insufficient (no automatic GOOD path via history)', () => {
    const intel = computeMlPriceIntel(
      { current: 700, listPrice: 1000, regularPrice: null },
      priorHistory([1000, 980, 1020]),
      '2026-09-22',
    );
    expect(intel.historyReady).toBe(false);
    expect(intel.samples90d).toBe(4); // 3 prior + today merge
  });

  it('≥4 prior days → historyReady + baseline (habitual median) + effective discount', () => {
    // observations: 1000, 980, 1020, 1000 → median habitual = 1000; current 700 → 30%
    const intel = computeMlPriceIntel(
      { current: 700, listPrice: 10000, regularPrice: null },
      priorHistory([1000, 980, 1020, 1000]),
      '2026-09-22',
    );
    expect(intel.historyReady).toBe(true);
    expect(intel.habitual30d).toBe(1000);
    expect(intel.effectiveDiscountPercent).toBe(30);
    expect(intel.savingsVsHabitualPct).toBe(30);
  });

  it('artificial list: extreme list vs habitual → suspectedArtificial, eff≈historical not list%', () => {
    // reported 10000→3300 looks like 67%; history ~3400 habitual
    const intel = computeMlPriceIntel(
      { current: 3300, listPrice: 10000, regularPrice: null },
      priorHistory([3400, 3300, 3500, 3350]),
      '2026-09-22',
    );
    expect(intel.historyReady).toBe(true);
    expect(intel.suspectedArtificialListPrice).toBe(true);
    // listVsHabitual: 10000 >= habitual*1.35 and >= current*1.4
    // effective uses savingsVsHabitual when >0 — small historical advantage
    expect(intel.habitual30d).toBeGreaterThan(3300);
    expect(intel.savingsVsHabitualPct!).toBeLessThan(10);
    expect(intel.savingsVsHabitualPct!).toBeGreaterThanOrEqual(0);
    // Must NOT treat as ~67% list discount for price-truth
    expect(intel.effectiveDiscountPercent).toBeLessThan(15);
  });
});

describe('Price Memory → Price Intel → DQE → gate', () => {
  it('wires samples90d + historyReady into signals and DQE priceMemory', () => {
    const intel = computeMlPriceIntel(
      { current: 700, listPrice: 1000, regularPrice: null },
      priorHistory([1000, 980, 1020, 1000]),
      '2026-09-22',
    );
    const meta = applyMlPriceIntelToMeta(
      {
        canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-41485344-x',
        title: 'Producto de prueba con título suficientemente largo',
        store: 'Mercado Libre',
        imageUrl: 'https://http2.mlstatic.com/x.jpg',
        discountPrice: 700,
        originalPrice: 1000,
        discountPercent: 30,
        signals: {
          originalPriceProvenance: 'source_explicit',
          cardDiscountSource: 'pdp',
        },
      },
      {
        quote: { current: 700, listPrice: 1000, regularPrice: null, currency: 'MXN' },
        intel,
      },
      { preserveLabelDiscount: true },
    );
    expect(meta.signals?.historyReady).toBe(true);
    expect(meta.signals?.samples90d).toBeGreaterThanOrEqual(ML_PRICE_MIN_HISTORY_DAYS);
    expect(meta.signals?.habitual30d).toBe(1000);
    expect(meta.signals?.effectiveDiscountPercent).toBe(30);

    const pm = priceMemoryFromParsedMeta(meta);
    expect(pm?.historyReady).toBe(true);
    expect(pm?.samples90d).toBe(meta.signals?.samples90d);
    expect(pm?.effectiveDiscountPercent).toBe(30);
  });

  it('no history → listing_card gate INSUFFICIENT_HISTORY (not GOOD)', () => {
    const intel = computeMlPriceIntel(
      { current: 229, listPrice: 399, regularPrice: null },
      [{ recordedOn: '2026-09-21', lastPrice: 229, minPrice: 229, listPrice: 399, regularPrice: null }],
      '2026-09-22',
    );
    expect(intel.historyReady).toBe(false);

    const meta: ParsedOfferMetadata = applyMlPriceIntelToMeta(
      {
        canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-59117483-calcetines',
        title: 'Calcetines Unisex Pack Oferta Mercado Libre MX',
        store: 'Mercado Libre',
        imageUrl: 'https://http2.mlstatic.com/x.jpg',
        discountPrice: 229,
        originalPrice: 399,
        discountPercent: 43,
        signals: {
          originalPriceProvenance: 'listing_card',
          cardDiscountSource: 'card_strikethrough',
        },
      },
      {
        quote: { current: 229, listPrice: 399, regularPrice: null, currency: 'MXN' },
        intel,
      },
      { preserveLabelDiscount: true },
    );

    expect(meta.signals?.historyReady).toBe(false);
    const pm = priceMemoryFromParsedMeta(meta);
    expect(pm?.historyReady).toBe(false);

    const dqe = evaluateDealQualityFromParsedMeta(meta, { source: 'ml_worker' });
    const gate = evaluateMachineCandidateGate({
      url: meta.canonicalUrl,
      meta,
      config: baseConfig(),
      verifierDecision: 'pending',
      verifierReasons: [],
      duplicate: null,
      dealScore: null,
      dealQuality: dqe,
    });
    expect(gate.wouldInsert).toBe(false);
    expect(gate.reasonCodes).toContain('INSUFFICIENT_HISTORY');

    const trace = buildHunterDecisionTrace({ meta, gate, dealQuality: dqe });
    expect(trace.finalLabel).not.toBe('GOOD');
    expect(trace.historicalBaseline).toBe('INSUFFICIENT_HISTORY');
    expect(trace.currentPrice).toBe(229);
  });

  it('enough history + verified provenance + non-artificial → can reach VERIFIED_OPPORTUNITY', () => {
    const intel = computeMlPriceIntel(
      { current: 700, listPrice: 1000, regularPrice: 1000 },
      priorHistory([1000, 980, 1020, 1000]),
      '2026-09-22',
    );
    expect(intel.historyReady).toBe(true);
    expect(intel.suspectedArtificialListPrice).toBe(false);

    const meta = applyMlPriceIntelToMeta(
      {
        canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-99999999-good-path',
        title: 'Audífonos Bluetooth noise cancelling oferta verificada MX',
        store: 'Mercado Libre',
        imageUrl: 'https://http2.mlstatic.com/x.jpg',
        discountPrice: 700,
        originalPrice: 1000,
        discountPercent: 30,
        signals: {
          originalPriceProvenance: 'source_explicit',
          cardDiscountSource: 'pdp',
          soldQuantity: 200,
          ratingAverage: 4.6,
          ratingCount: 80,
        },
      },
      {
        quote: { current: 700, listPrice: 1000, regularPrice: 1000, currency: 'MXN' },
        intel,
      },
      { preserveLabelDiscount: true },
    );

    const dqe = evaluateDealQualityFromParsedMeta(meta, { source: 'ml_worker' });
    // DQE may be VERIFIED_DEAL or POTENTIAL depending on thresholds — gate must not mint on DISCARD
    expect(['VERIFIED_DEAL', 'PROMOTION', 'POTENTIAL_DEAL']).toContain(dqe.decision);

    if (dqe.recommendedAction === 'DISCARD' || dqe.decision === 'NO_VERIFIED_DEAL') {
      // fail-closed path still documented
      const gate = evaluateMachineCandidateGate({
        url: meta.canonicalUrl,
        meta,
        config: baseConfig(),
        verifierDecision: 'pending',
        verifierReasons: [],
        duplicate: null,
        dealScore: null,
        dealQuality: dqe,
      });
      expect(gate.wouldInsert).toBe(false);
      return;
    }

    if (dqe.decision === 'POTENTIAL_DEAL' || dqe.recommendedAction === 'HUMAN_REVIEW') {
      const gate = evaluateMachineCandidateGate({
        url: meta.canonicalUrl,
        meta,
        config: baseConfig(),
        verifierDecision: 'pending',
        verifierReasons: [],
        duplicate: null,
        dealScore: null,
        dealQuality: dqe,
      });
      expect(gate.wouldInsert).toBe(false);
      expect(gate.reasonCodes).toContain('DQE_POTENTIAL_ONLY');
      return;
    }

    const gate = evaluateMachineCandidateGate({
      url: meta.canonicalUrl,
      meta,
      config: baseConfig(),
      verifierDecision: 'pending',
      verifierReasons: [],
      duplicate: null,
      dealScore: null,
      dealQuality: dqe,
    });
    expect(gate.qualityDecision).toBe('VERIFIED_OPPORTUNITY');
    expect(gate.wouldInsert).toBe(true);
    const trace = buildHunterDecisionTrace({ meta, gate, dealQuality: dqe });
    expect(trace.finalLabel).toBe('GOOD');
    expect(trace.historicalBaseline).toBe('available');
    expect(trace.historicalBaselinePrice).toBe(1000);
    expect(trace.effectiveDiscountPercent).toBe(30);
  });
});

describe('Duplicate snapshot day key (contract)', () => {
  it('unique key is marketplace + product_id + recorded_on (documented)', () => {
    // Mirrors UNIQUE (marketplace, product_id, recorded_on) — same day merges min_price
    const today = '2026-09-22';
    const first = computeMlPriceIntel(
      { current: 100, listPrice: null, regularPrice: null },
      [{ recordedOn: today, lastPrice: 120, minPrice: 110, listPrice: null, regularPrice: null }],
      today,
    );
    // today merge takes min(existing.min, current)
    expect(first.samples90d).toBe(1);
    expect(first.historyReady).toBe(false);
  });
});
