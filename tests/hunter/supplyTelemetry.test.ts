import { describe, expect, it } from 'vitest';
import { applyNicheProfileToIngestConfig } from '@/lib/hunter/supply/applyNicheProfile';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import { NICHE_BEAUTY, NICHE_DAY_TO_DAY, NICHE_ELECTRONICS } from '@/lib/hunter/supply/nicheProfiles';
import {
  classifySupplyQuality,
  parseMlSourceDetail,
} from '@/lib/hunter/supply/qualityClass';
import { computeDealSignals } from '@/lib/hunter/supply/dealSignals';
import {
  emptySupplyTelemetryRollup,
  recordSupplyCandidateTelemetry,
  ratesFromCounters,
  topKeysByGoodDeals,
} from '@/lib/hunter/supply/telemetry';

describe('niche isolation', () => {
  it('beauty/day_to_day no heredan techCategoryIds default', () => {
    const base = loadBotIngestConfig('standard');
    expect(base.techCategoryIds.length).toBeGreaterThan(0);
    const beauty = applyNicheProfileToIngestConfig(base, NICHE_BEAUTY);
    const dtd = applyNicheProfileToIngestConfig(base, NICHE_DAY_TO_DAY);
    const elec = applyNicheProfileToIngestConfig(base, NICHE_ELECTRONICS);
    expect(beauty.techCategoryIds).toEqual([]);
    expect(dtd.techCategoryIds).toEqual([]);
    expect(elec.techCategoryIds).toEqual(NICHE_ELECTRONICS.mlCategoryIds);
  });
});

describe('query attribution parse', () => {
  it('parsea sourceDetail ml:hl', () => {
    expect(parseMlSourceDetail('ml:hl:MLM1246|q:perfume mujer oferta|sort:highlights')).toEqual({
      kind: 'hl',
      value: 'MLM1246|q:perfume mujer oferta',
      sort: 'highlights',
      discoveryMode: 'fresh',
    });
  });

  it('parsea seed de ml_worker', () => {
    expect(parseMlSourceDetail('worker:playwright:card|seed:offers_home')).toEqual({
      kind: 'seed',
      value: 'offers_home',
      sort: null,
      discoveryMode: 'fresh',
    });
  });
});

describe('quality buckets', () => {
  it('marca false_discount como rejected', () => {
    const deal = computeDealSignals({
      meta: { discountPrice: 100, originalPrice: 200, discountPercent: 50 },
      signals: {
        historyReady: true,
        suspectedArtificialListPrice: true,
        effectiveDiscountPercent: 0,
        habitual30d: 100,
        savingsVsHabitualPct: 0,
      },
    });
    const q = classifySupplyQuality({
      deal,
      qualification: 'VERIFIED_DEAL',
      verifierDecision: 'review',
    });
    expect(q.bucket).toBe('rejected');
    expect(q.reason).toBe('false_discount');
  });
});

describe('telemetry rollup', () => {
  it('agrega por query y calcula rates', () => {
    const rollup = emptySupplyTelemetryRollup();
    recordSupplyCandidateTelemetry(rollup, {
      nicheId: 'beauty',
      sourceId: 'ml_api_legacy',
      query: 'perfume mujer oferta',
      category: 'MLM1246',
      merchant: 'Mercado Libre',
      isUnique: true,
      isDuplicate: false,
      approvalReady: true,
      bucket: 'excellent',
      priceClass: 'historical_low',
      laneHint: 'top_deals',
    });
    recordSupplyCandidateTelemetry(rollup, {
      nicheId: 'beauty',
      sourceId: 'ml_api_legacy',
      query: 'perfume mujer oferta',
      category: 'MLM1246',
      merchant: 'Mercado Libre',
      isUnique: true,
      isDuplicate: false,
      approvalReady: false,
      bucket: 'filler',
      priceClass: 'insufficient_evidence',
      laneHint: 'none',
    });
    const rates = ratesFromCounters(rollup.byNiche.beauty!);
    expect(rates.approvalReadyRate).toBe(50);
    expect(rates.goodDealsPerDiscovered).toBe(50);
    const top = topKeysByGoodDeals(rollup.byQuery, 3);
    expect(top[0]?.good).toBe(1);
  });
});
