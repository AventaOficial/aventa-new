import { describe, expect, it, afterEach } from 'vitest';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import {
  applyNicheProfileToIngestConfig,
  computeDealSignals,
  moderationPriorityFromDealSignals,
  NICHE_BEAUTY,
  NICHE_DAY_TO_DAY,
  NICHE_ELECTRONICS,
  NICHE_HUNTER_PROFILES,
  parseSupplyEngineMode,
  pickNicheForWave,
  resetSupplyOrchestrationMetrics,
  runSupplyEngine,
  toSupplyCandidate,
  type SupplySource,
} from '@/lib/hunter/supply';
import { communitySupplySource } from '@/lib/hunter/supply/community';

afterEach(() => {
  resetSupplyOrchestrationMetrics();
});

function meta(over: Partial<ParsedOfferMetadata> = {}): ParsedOfferMetadata {
  return {
    canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-1',
    title: 'Perfume test',
    store: 'Mercado Libre',
    imageUrl: 'https://http2.mlstatic.com/x.jpg',
    discountPrice: 799,
    originalPrice: 1299,
    discountPercent: 38,
    signals: {
      historyReady: true,
      priceLowest90d: 799,
      habitual30d: 1199,
      savingsVsHabitualPct: 33,
      effectiveDiscountPercent: 33,
      priceVsLowest90dPct: 0,
      suspectedArtificialListPrice: false,
      categoryId: 'MLM1246',
    },
    ...over,
  };
}

function fakeSource(
  over: Partial<SupplySource> & Pick<SupplySource, 'id'> & { candidates?: ReturnType<typeof toSupplyCandidate>[] },
): SupplySource {
  const candidates = over.candidates ?? [];
  return {
    ...communitySupplySource,
    displayName: over.id,
    family: 'official_api',
    type: 'official_api',
    hunterSourceId: null,
    ingestSourceId: null,
    isEnabled: () => true,
    isConfigured: () => true,
    async collect() {
      return { ok: true, candidates };
    },
    ...over,
  };
}

describe('NicheHunterProfile', () => {
  it('expone exactamente 3 perfiles iniciales enabled', () => {
    expect(NICHE_HUNTER_PROFILES.map((p) => p.id)).toEqual(['beauty', 'electronics', 'day_to_day']);
    expect(NICHE_HUNTER_PROFILES.every((p) => p.enabled)).toBe(true);
  });

  it('rota por wave de forma determinística', () => {
    const a = pickNicheForWave(0)!;
    const b = pickNicheForWave(1)!;
    const c = pickNicheForWave(2)!;
    const d = pickNicheForWave(3)!;
    expect([a.id, b.id, c.id].sort()).toEqual(['beauty', 'day_to_day', 'electronics'].sort());
    expect(d.id).toBe(a.id);
    // mayor prioridad primero
    expect(a.id).toBe('beauty');
  });

  it('aplica nicho a BotIngestConfig sin inventar fuentes', () => {
    const base = loadBotIngestConfig('standard');
    const cfg = applyNicheProfileToIngestConfig(base, NICHE_BEAUTY);
    expect(cfg.mlQueries).toEqual(NICHE_BEAUTY.mlQueries);
    expect(cfg.mlCategoryIds).toEqual(NICHE_BEAUTY.mlCategoryIds);
    expect(cfg.minDiscountPercent).toBe(NICHE_BEAUTY.minDiscountPercent);
    expect(cfg.candidatePoolMax).toBeLessThanOrEqual(base.candidatePoolMax);
    expect(cfg.normalMaxPerRunMax).toBeLessThanOrEqual(NICHE_BEAUTY.insertBudget);
  });

  it('parseSupplyEngineMode default shadow', () => {
    expect(parseSupplyEngineMode(undefined)).toBe('shadow');
    expect(parseSupplyEngineMode('dry_run')).toBe('dry_run');
    expect(parseSupplyEngineMode('enabled')).toBe('enabled');
  });
});

describe('DealSignals', () => {
  it('historical_low solo con historyReady', () => {
    const ready = computeDealSignals({
      meta: meta(),
      signals: meta().signals,
    });
    expect(ready.priceClass).toBe('historical_low');
    expect(ready.historicalLow90d).toBe(799);
    expect(ready.laneHint).toBe('top_deals');

    const weak = computeDealSignals({
      meta: { discountPrice: 799, originalPrice: 1299, discountPercent: 38 },
      signals: { historyReady: false, suspectedArtificialListPrice: false },
    });
    expect(weak.priceClass).toBe('insufficient_evidence');
    expect(weak.historicalLow90d).toBeNull();
    expect(weak.dealScore).toBeLessThanOrEqual(35);
  });

  it('detecta false discount con list artificial', () => {
    const s = computeDealSignals({
      meta: { discountPrice: 999, originalPrice: 1499, discountPercent: 33 },
      signals: {
        historyReady: true,
        habitual30d: 999,
        savingsVsHabitualPct: 0,
        effectiveDiscountPercent: 0,
        suspectedArtificialListPrice: true,
        priceLowest90d: 990,
        priceVsLowest90dPct: 1,
      },
    });
    expect(s.priceClass).toBe('false_discount');
    expect(s.dealScore).toBeLessThanOrEqual(15);
    expect(moderationPriorityFromDealSignals(s)).toBe(4);
  });

  it('electronics profile budgets son razonables', () => {
    expect(NICHE_ELECTRONICS.preferHistoryReady).toBe(true);
    expect(NICHE_DAY_TO_DAY.preferHistoryReady).toBe(false);
    expect(NICHE_ELECTRONICS.priceMax).toBeGreaterThan(NICHE_BEAUTY.priceMax!);
  });
});

describe('Supply Engine orchestrator', () => {
  it('dry_run produce métricas separadas y no escribe ofertas', async () => {
    const url = 'https://articulo.mercadolibre.com.mx/MLM-beauty-1';
    const cand = toSupplyCandidate({
      item: {
        url,
        source: 'ml_api',
        sourceDetail: 'test',
        precomputedMeta: meta({
          canonicalUrl: url,
          signals: {
            ...meta().signals,
            currentPriceProvenance: 'source_explicit',
            originalPriceProvenance: 'source_explicit',
            discountPercentProvenance: 'source_explicit',
          },
        }),
      },
      hunterSourceId: 'ml_api_legacy',
      sourceId: 'ml_api_legacy',
      sourceFamily: 'official_api',
      sourceType: 'official_api',
    });

    const source = fakeSource({ id: 'ml_api_legacy', candidates: [cand] });
    const report = await runSupplyEngine({
      mode: 'dry_run',
      nicheId: 'beauty',
      wave: 0,
      persistSnapshots: false,
      allowWrite: false,
      sources: [source],
      config: applyNicheProfileToIngestConfig(loadBotIngestConfig('standard'), NICHE_BEAUTY),
    });

    expect(report.ok).toBe(true);
    expect(report.wroteOffers).toBe(false);
    expect(report.niche?.id).toBe('beauty');
    expect(report.metrics.discovered).toBe(1);
    expect(report.metrics.unique).toBe(1);
    expect(report.metrics.duplicates).toBe(0);
    expect(report.metrics.historicalLows).toBeGreaterThanOrEqual(1);
    expect(report.metrics.approvalReady).toBeGreaterThanOrEqual(1);
    expect(report.candidates[0]?.deal.priceClass).toBe('historical_low');
    expect(report.ingest).toBeNull();
  });

  it('enabled sin WRITE no inserta', async () => {
    const report = await runSupplyEngine({
      mode: 'enabled',
      nicheId: 'day_to_day',
      allowWrite: false,
      persistSnapshots: false,
      sources: [fakeSource({ id: 'ml_api_legacy' })],
    });
    expect(report.wroteOffers).toBe(false);
    expect(report.note).toMatch(/write blocked/);
  });

  it('aísla fallo de source: engine ok con sourceFailures', async () => {
    const bad: SupplySource = fakeSource({
      id: 'ml_api_legacy',
      async collect() {
        throw new Error('boom');
      },
    });
    const report = await runSupplyEngine({
      mode: 'shadow',
      nicheId: 'electronics',
      persistSnapshots: false,
      sources: [bad],
    });
    expect(report.ok).toBe(true);
    expect(report.metrics.sourceFailures).toBeGreaterThanOrEqual(1);
  });
});
