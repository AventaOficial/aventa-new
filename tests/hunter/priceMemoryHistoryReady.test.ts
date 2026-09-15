import { describe, expect, it } from 'vitest';
import { computeMlPriceIntel } from '@/lib/bots/ingest/mlPriceEngine';
import { applyMlPriceIntelToMeta } from '@/lib/bots/ingest/priceIntel';
import { computeDealSignals } from '@/lib/hunter/supply/dealSignals';
import { SUPPLY_DAILY_TARGETS } from '@/lib/hunter/supply/priceMemoryHealth';
import { NICHE_BEAUTY, NICHE_ELECTRONICS, NICHE_DAY_TO_DAY } from '@/lib/hunter/supply/nicheProfiles';

describe('Price Memory historyReady contract', () => {
  it('sin ≥4 días previos: historyReady=false y no inventa lowest90d', () => {
    const today = '2026-09-15';
    const intel = computeMlPriceIntel(
      { current: 100, listPrice: 110, regularPrice: null },
      [
        { recordedOn: '2026-09-14', lastPrice: 120, minPrice: 120, listPrice: 110, regularPrice: null },
        { recordedOn: '2026-09-13', lastPrice: 130, minPrice: 130, listPrice: 110, regularPrice: null },
      ],
      today,
    );
    expect(intel.historyReady).toBe(false);
    expect(intel.lowest90d).toBeNull();

    const meta = applyMlPriceIntelToMeta(
      {
        canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-1',
        title: 'x',
        store: 'Mercado Libre',
        imageUrl: '',
        discountPrice: 100,
        originalPrice: 110,
        discountPercent: 9,
      },
      {
        quote: { current: 100, listPrice: 110, regularPrice: null, currency: 'MXN' },
        intel,
      },
      { preserveLabelDiscount: true },
    );
    const deal = computeDealSignals({ meta, signals: meta.signals });
    expect(deal.historyReady).toBe(false);
    expect(deal.priceClass).toBe('insufficient_evidence');
    expect(deal.historicalLow90d).toBeNull();
  });

  it('lista extrema sin historial → false_discount (no historical_low de etiqueta)', () => {
    const today = '2026-09-15';
    const intel = computeMlPriceIntel(
      { current: 100, listPrice: 200, regularPrice: null },
      [
        { recordedOn: '2026-09-14', lastPrice: 120, minPrice: 120, listPrice: 200, regularPrice: null },
      ],
      today,
    );
    expect(intel.historyReady).toBe(false);
    expect(intel.suspectedArtificialListPrice).toBe(true);
    const meta = applyMlPriceIntelToMeta(
      {
        canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-x',
        title: 'x',
        store: 'Mercado Libre',
        imageUrl: '',
        discountPrice: 100,
        originalPrice: 200,
        discountPercent: 50,
      },
      {
        quote: { current: 100, listPrice: 200, regularPrice: null, currency: 'MXN' },
        intel,
      },
      { preserveLabelDiscount: true },
    );
    const deal = computeDealSignals({ meta, signals: meta.signals });
    expect(deal.priceClass).toBe('false_discount');
  });

  it('marca historical_low solo con historyReady y precio en mínimo de ventana', () => {
    const today = '2026-09-15';
    const history = [
      { recordedOn: '2026-09-14', lastPrice: 150, minPrice: 150, listPrice: 160, regularPrice: null },
      { recordedOn: '2026-09-13', lastPrice: 140, minPrice: 140, listPrice: 160, regularPrice: null },
      { recordedOn: '2026-09-12', lastPrice: 130, minPrice: 130, listPrice: 160, regularPrice: null },
      { recordedOn: '2026-09-11', lastPrice: 120, minPrice: 120, listPrice: 160, regularPrice: null },
    ];
    const intel = computeMlPriceIntel(
      { current: 100, listPrice: 160, regularPrice: null },
      history,
      today,
    );
    expect(intel.historyReady).toBe(true);
    // lowest90d incluye la observación de hoy → mínimo = current
    expect(intel.lowest90d).toBe(100);
    expect(intel.priceVsLowest90dPct).toBe(0);

    const meta = applyMlPriceIntelToMeta(
      {
        canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-2',
        title: 'y',
        store: 'Mercado Libre',
        imageUrl: '',
        discountPrice: 100,
        originalPrice: 160,
        discountPercent: 37,
      },
      {
        quote: { current: 100, listPrice: 160, regularPrice: null, currency: 'MXN' },
        intel,
      },
      { preserveLabelDiscount: true },
    );
    const deal = computeDealSignals({ meta, signals: meta.signals });
    expect(deal.historyReady).toBe(true);
    expect(deal.priceClass).toBe('historical_low');
  });
});

describe('Niche querySpecs', () => {
  it('mlQueries se deriva de querySpecs ordenados por prioridad', () => {
    expect(NICHE_BEAUTY.querySpecs.length).toBeGreaterThan(0);
    expect(NICHE_BEAUTY.mlQueries[0]).toBe('perfume mujer oferta');
    expect(NICHE_ELECTRONICS.querySpecs.some((q) => q.intent === 'brand_product')).toBe(true);
    expect(NICHE_DAY_TO_DAY.mlQueries).toEqual(
      expect.arrayContaining(['papel higienico oferta', 'detergente oferta']),
    );
  });
});

describe('daily targets', () => {
  it('define objetivos conservadores explícitos', () => {
    expect(SUPPLY_DAILY_TARGETS.discovered).toBeGreaterThan(0);
    expect(SUPPLY_DAILY_TARGETS.approvalReady).toBeLessThan(SUPPLY_DAILY_TARGETS.verified);
  });
});
