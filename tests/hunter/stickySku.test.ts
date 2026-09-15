import { describe, expect, it, vi } from 'vitest';
import { filterStickyByCooldown, DEFAULT_STICKY_SKU_CONFIG } from '@/lib/hunter/supply/stickySku';
import { observeStickySkus } from '@/lib/hunter/supply/observeStickySkus';
import { parseMlSourceDetail } from '@/lib/hunter/supply/qualityClass';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import { computeMlPriceIntel } from '@/lib/bots/ingest/mlPriceEngine';
import { runSupplyEngine, summarizeSupplyEngineReport } from '@/lib/hunter/supply/engine';
import { toSupplyCandidate } from '@/lib/hunter/supply/candidate';
import { communitySupplySource } from '@/lib/hunter/supply/community';
import type { SupplySource } from '@/lib/hunter/supply/types';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';

describe('sticky cooldown', () => {
  it('excluye SKUs observados dentro del cooldown', () => {
    const filtered = filterStickyByCooldown(
      [
        { productId: 'A', hoursSinceObserved: 2 },
        { productId: 'B', hoursSinceObserved: 24 },
      ],
      20,
    );
    expect(filtered.map((t) => t.productId)).toEqual(['B']);
  });

  it('cooldown es configurable y > 0', () => {
    expect(DEFAULT_STICKY_SKU_CONFIG.cooldownHours).toBeGreaterThan(0);
    expect(DEFAULT_STICKY_SKU_CONFIG.maxTargets).toBeGreaterThan(0);
  });
});

describe('sticky vs fresh attribution', () => {
  it('parsea discoveryMode sticky', () => {
    expect(parseMlSourceDetail('ml:sticky:MLM123|niche:beauty|mode:sticky')).toEqual({
      kind: 'sticky',
      value: 'MLM123',
      sort: null,
      discoveryMode: 'sticky',
    });
  });

  it('parsea fresh highlights', () => {
    const p = parseMlSourceDetail('ml:hl:MLM1246|q:perfume|sort:highlights');
    expect(p.discoveryMode).toBe('fresh');
    expect(p.kind).toBe('hl');
  });
});

describe('historyReady contract (sticky intel)', () => {
  it('no inventa historical low sin ≥4 días', () => {
    const intel = computeMlPriceIntel(
      { current: 100, listPrice: 110, regularPrice: null },
      [{ recordedOn: '2026-09-14', lastPrice: 120, minPrice: 120, listPrice: 110, regularPrice: null }],
      '2026-09-15',
    );
    expect(intel.historyReady).toBe(false);
    expect(intel.lowest90d).toBeNull();
  });
});

describe('observeStickySkus discovery-only', () => {
  it('persiste snapshot vía record path y no escribe ofertas (sin insert)', async () => {
    const config = loadBotIngestConfig('standard');
    const report = await observeStickySkus({
      config,
      nicheId: 'beauty',
      persistSnapshots: false,
      selectTargets: async () => [
        {
          productId: 'MLM1111111111',
          priorDays: 5,
          lastObservedOn: '2026-09-10',
          lastPrice: 200,
          listPrice: 250,
          hoursSinceObserved: 48,
        },
      ],
      fetchQuote: async () => ({
        current: 180,
        listPrice: 250,
        regularPrice: null,
      }),
      supabase: null,
    });
    expect(report.stickyCandidates).toBe(1);
    expect(report.stickyObserved).toBe(1);
    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0]!.ingestItem.sourceDetail).toContain('mode:sticky');
    expect(report.candidates[0]!.ingestItem.sourceDetail).toContain('ml:sticky:');
  });

  it('cuenta failure si quote inválido', async () => {
    const config = loadBotIngestConfig('standard');
    const report = await observeStickySkus({
      config,
      nicheId: 'beauty',
      persistSnapshots: false,
      selectTargets: async () => [
        {
          productId: 'MLM2222222222',
          priorDays: 5,
          lastObservedOn: '2026-09-10',
          lastPrice: 10,
          listPrice: null,
          hoursSinceObserved: 48,
        },
      ],
      fetchQuote: async () => ({ current: 0, listPrice: null, regularPrice: null }),
      supabase: null,
    });
    expect(report.stickyFailed).toBe(1);
    expect(report.stickyObserved).toBe(0);
  });
});

describe('worker discovery-only / no WRITE', () => {
  it('Supply Engine dry_run nunca wroteOffers', async () => {
    const meta: ParsedOfferMetadata = {
      canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-9',
      title: 'Test sticky perfume',
      store: 'Mercado Libre',
      imageUrl: 'https://http2.mlstatic.com/x.jpg',
      discountPrice: 100,
      originalPrice: 200,
      discountPercent: 50,
      signals: {
        historyReady: true,
        priceLowest90d: 100,
        habitual30d: 180,
        savingsVsHabitualPct: 44,
        effectiveDiscountPercent: 44,
        priceVsLowest90dPct: 0,
        suspectedArtificialListPrice: false,
      },
    };
    const candidate = toSupplyCandidate({
      item: {
        url: meta.canonicalUrl,
        source: 'ml_api',
        sourceDetail: 'ml:q:perfume|sort:relevance',
        precomputedMeta: meta,
      },
      hunterSourceId: 'ml_api_legacy',
      sourceId: 'ml_api_legacy',
      sourceFamily: 'official_api',
      sourceType: 'official_api',
    });
    const source: SupplySource = {
      ...communitySupplySource,
      id: 'ml_api_legacy',
      displayName: 'ml',
      family: 'official_api',
      type: 'official_api',
      isEnabled: () => true,
      isConfigured: () => true,
      async collect() {
        return { ok: true, candidates: [candidate] };
      },
    };
    const report = await runSupplyEngine({
      mode: 'dry_run',
      nicheId: 'beauty',
      sources: [source],
      enableSticky: false,
      persistSnapshots: false,
      allowWrite: false,
    });
    expect(report.wroteOffers).toBe(false);
    expect(report.mode).toBe('dry_run');
    const summary = summarizeSupplyEngineReport(report);
    expect(summary.wroteOffers).toBe(false);
    expect(summary.stickyVsFresh).toBeDefined();
  });
});

describe('budget defaults', () => {
  it('sticky maxTargets acota presupuesto', () => {
    expect(DEFAULT_STICKY_SKU_CONFIG.maxTargets).toBeLessThanOrEqual(36);
  });
});
