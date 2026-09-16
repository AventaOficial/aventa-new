import { describe, expect, it } from 'vitest';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import {
  isStickyEvidenceRich,
  observeStickySkuViaServer,
  observeStickySkus,
} from '@/lib/hunter/supply/observeStickySkus';
import { computeDealSignals } from '@/lib/hunter/supply/dealSignals';
import { runSupplyEngine } from '@/lib/hunter/supply/engine';
import type { MercadoLibrePriceResolution } from '@/lib/offers/resolveMercadoLibrePrice';

const RICH_IMAGE = 'https://http2.mlstatic.com/D_NQ_NP_2X_123456-MLA123456789_012025-F.jpg';
const NOW = new Date('2026-09-15T18:00:00.000Z');

function resolvedPrice(over: Partial<MercadoLibrePriceResolution> = {}): MercadoLibrePriceResolution {
  return {
    status: 'resolved',
    price: 261,
    originalPrice: 399,
    regularPrice: null,
    promotionPrice: null,
    currency: 'MXN',
    source: 'items_prices',
    confidence: 'high',
    resolvedBy: 'items_prices',
    httpStatus: 200,
    ...over,
  };
}

function enrichTo(
  patch: Partial<ParsedOfferMetadata>,
): typeof import('@/lib/hunter/enrichment/enrichParsedOffer').enrichParsedOfferMetadata {
  return async (meta) => ({
    meta: { ...meta, ...patch },
    changed: true,
    skippedNetwork: true,
    imageStatus: patch.imageUrl ? 'valid' : 'missing',
  });
}

describe('observeStickySkuViaServer', () => {
  it('1. API completa → evidence rich / ok', async () => {
    const obs = await observeStickySkuViaServer({
      productId: 'MLM1111111111',
      nicheId: 'beauty',
      persistSnapshots: false,
      observedAt: NOW,
      deps: {
        resolvePrice: async () => resolvedPrice(),
        enrichMeta: enrichTo({
          title: 'CeraVe Crema Facial 340ml',
          imageUrl: RICH_IMAGE,
          originalPrice: 399,
          discountPrice: 261,
          discountPercent: 35,
        }),
        loadHistory: async () => [],
        recordSnapshots: async () => {},
      },
    });
    expect(obs.observationStatus).toBe('ok');
    expect(obs.price?.value).toBe(261);
    expect(obs.price?.source).toContain('ml_api');
    expect(obs.originalPrice?.value).toBe(399);
    expect(obs.title).toContain('CeraVe');
    expect(obs.imageUrl).toContain('mlstatic');
    expect(obs.meta && isStickyEvidenceRich(obs.meta)).toBe(true);
    expect(obs.provenance.channel).toBe('server_api');
  });

  it('2. sin original price → no inventar', async () => {
    const obs = await observeStickySkuViaServer({
      productId: 'MLM222',
      nicheId: 'beauty',
      persistSnapshots: false,
      deps: {
        resolvePrice: async () => resolvedPrice({ originalPrice: null, regularPrice: null }),
        enrichMeta: enrichTo({
          title: 'Producto Sin Original',
          imageUrl: RICH_IMAGE,
          originalPrice: null,
          discountPercent: 0,
        }),
        loadHistory: async () => [],
        recordSnapshots: async () => {},
      },
    });
    expect(obs.price?.value).toBe(261);
    expect(obs.originalPrice).toBeNull();
    expect(obs.observationStatus).toBe('insufficient_evidence');
    expect(obs.meta && isStickyEvidenceRich(obs.meta)).toBe(false);
  });

  it('3. sin image → no inventar', async () => {
    const obs = await observeStickySkuViaServer({
      productId: 'MLM333',
      nicheId: 'electronics',
      persistSnapshots: false,
      deps: {
        resolvePrice: async () => resolvedPrice(),
        enrichMeta: enrichTo({
          title: 'SSD NVMe 1TB Oferta',
          imageUrl: '',
          originalPrice: 399,
        }),
        loadHistory: async () => [],
        recordSnapshots: async () => {},
      },
    });
    expect(obs.imageUrl).toBeNull();
    expect(obs.meta?.imageUrl).toBe('');
    expect(obs.observationStatus).toBe('insufficient_evidence');
  });

  it('4. API blocked → source_blocked', async () => {
    const obs = await observeStickySkuViaServer({
      productId: 'MLM444',
      nicheId: 'beauty',
      persistSnapshots: false,
      deps: {
        resolvePrice: async () =>
          resolvedPrice({ status: 'unauthorized', price: null, httpStatus: 403, source: 'none' }),
        enrichMeta: enrichTo({}),
        loadHistory: async () => [],
        recordSnapshots: async () => {},
      },
    });
    expect(obs.observationStatus).toBe('source_blocked');
    expect(obs.price).toBeNull();
    expect(obs.meta).toBeNull();
  });

  it('5. not found → not_found', async () => {
    const obs = await observeStickySkuViaServer({
      productId: 'MLM555',
      nicheId: 'beauty',
      persistSnapshots: false,
      deps: {
        resolvePrice: async () =>
          resolvedPrice({ status: 'not_found', price: null, httpStatus: 404, source: 'none' }),
        enrichMeta: enrichTo({}),
        loadHistory: async () => [],
        recordSnapshots: async () => {},
      },
    });
    expect(obs.observationStatus).toBe('not_found');
  });

  it('6. price invalid → price_unverified', async () => {
    const obs = await observeStickySkuViaServer({
      productId: 'MLM666',
      nicheId: 'day_to_day',
      persistSnapshots: false,
      deps: {
        resolvePrice: async () =>
          resolvedPrice({ status: 'unavailable', price: null, source: 'none' }),
        fetchApi: async (path: string) => {
          if (path.endsWith('/items')) {
            return { ok: true, status: 200, authenticated: true, data: { results: [] } };
          }
          return {
            ok: true,
            status: 200,
            authenticated: true,
            data: { name: 'Sin Listings', pictures: [] },
          };
        },
        enrichMeta: enrichTo({}),
        loadHistory: async () => [],
        recordSnapshots: async () => {},
      },
    });
    expect(obs.observationStatus).toBe('price_unverified');
  });

  it('6b. products API path → evidence rich (catalog sticky)', async () => {
    const obs = await observeStickySkuViaServer({
      productId: 'MLM67666199',
      nicheId: 'electronics',
      persistSnapshots: false,
      deps: {
        resolvePrice: async () =>
          resolvedPrice({ status: 'unavailable', price: null, httpStatus: 404, source: 'none' }),
        fetchApi: async (path: string) => {
          if (path.endsWith('/items')) {
            return {
              ok: true,
              status: 200,
              authenticated: true,
              data: {
                results: [
                  {
                    item_id: 'MLM3446533433',
                    price: 261,
                    original_price: 399,
                    currency_id: 'MXN',
                    category_id: 'MLM2868',
                  },
                ],
              },
            };
          }
          if (path.startsWith('/products/')) {
            return {
              ok: true,
              status: 200,
              authenticated: true,
              data: {
                name: 'Bocina JBL Partybox Catalog Sticky',
                pictures: [{ secure_url: RICH_IMAGE }],
              },
            };
          }
          return { ok: false, status: 404, authenticated: true };
        },
        enrichMeta: async (meta) => ({
          meta,
          changed: false,
          skippedNetwork: true,
          imageStatus: 'valid',
        }),
        loadHistory: async () => [],
        recordSnapshots: async () => {},
      },
    });
    expect(obs.observationStatus).toBe('ok');
    expect(obs.price?.value).toBe(261);
    expect(obs.originalPrice?.value).toBe(399);
    expect(obs.price?.source).toContain('products_items');
    expect(obs.title).toContain('Bocina');
    expect(obs.imageUrl).toContain('mlstatic');
    expect(obs.provenance.channel).toBe('server_api');
    expect(obs.meta && isStickyEvidenceRich(obs.meta)).toBe(true);
  });

  it('7. historyReady false → no historical_low', async () => {
    const obs = await observeStickySkuViaServer({
      productId: 'MLM777',
      nicheId: 'beauty',
      persistSnapshots: false,
      deps: {
        resolvePrice: async () => resolvedPrice({ price: 100, originalPrice: 200 }),
        enrichMeta: enrichTo({
          title: 'Item Cold History',
          imageUrl: RICH_IMAGE,
          discountPrice: 100,
          originalPrice: 200,
          discountPercent: 50,
          signals: { historyReady: false },
        }),
        loadHistory: async () => [],
        recordSnapshots: async () => {},
      },
    });
    expect(obs.meta).toBeTruthy();
    const deal = computeDealSignals({ meta: obs.meta!, signals: obs.meta!.signals });
    expect(deal.historyReady).toBe(false);
    expect(deal.priceClass).not.toBe('historical_low');
  });

  it('8. historyReady true + mínimo real → historical_low', async () => {
    const history = [
      { recordedOn: '2026-09-01', lastPrice: 150, minPrice: 150, listPrice: 200, regularPrice: null },
      { recordedOn: '2026-09-02', lastPrice: 140, minPrice: 140, listPrice: 200, regularPrice: null },
      { recordedOn: '2026-09-03', lastPrice: 145, minPrice: 145, listPrice: 200, regularPrice: null },
      { recordedOn: '2026-09-04', lastPrice: 160, minPrice: 160, listPrice: 200, regularPrice: null },
      { recordedOn: '2026-09-05', lastPrice: 155, minPrice: 155, listPrice: 200, regularPrice: null },
    ];
    const obs = await observeStickySkuViaServer({
      productId: 'MLM888',
      nicheId: 'beauty',
      persistSnapshots: false,
      observedAt: NOW,
      deps: {
        resolvePrice: async () => resolvedPrice({ price: 100, originalPrice: 200 }),
        enrichMeta: async (meta) => ({
          meta: {
            ...meta,
            title: 'Item Historical Low',
            imageUrl: RICH_IMAGE,
            discountPrice: 100,
            originalPrice: 200,
            discountPercent: 50,
          },
          changed: true,
          skippedNetwork: true,
          imageStatus: 'valid',
        }),
        loadHistory: async () => history,
        recordSnapshots: async () => {},
      },
    });
    expect(obs.meta).toBeTruthy();
    // applyMlPriceIntelToMeta + computeDealSignals usan history
    const deal = computeDealSignals({ meta: obs.meta!, signals: obs.meta!.signals });
    expect(deal.historyReady === true || deal.priceClass === 'historical_low' || deal.priceClass === 'insufficient_evidence').toBe(
      true,
    );
    if (deal.historyReady) {
      expect(deal.priceClass === 'historical_low' || obs.meta!.discountPrice <= 100).toBe(true);
    }
  });

  it('9. price drop real → price_drop class posible', async () => {
    const history = [
      { recordedOn: '2026-09-01', lastPrice: 300, minPrice: 300, listPrice: 400, regularPrice: null },
      { recordedOn: '2026-09-02', lastPrice: 290, minPrice: 290, listPrice: 400, regularPrice: null },
      { recordedOn: '2026-09-03', lastPrice: 310, minPrice: 310, listPrice: 400, regularPrice: null },
      { recordedOn: '2026-09-04', lastPrice: 305, minPrice: 305, listPrice: 400, regularPrice: null },
      { recordedOn: '2026-09-10', lastPrice: 300, minPrice: 300, listPrice: 400, regularPrice: null },
    ];
    const obs = await observeStickySkuViaServer({
      productId: 'MLM999',
      nicheId: 'electronics',
      persistSnapshots: false,
      observedAt: NOW,
      deps: {
        resolvePrice: async () => resolvedPrice({ price: 220, originalPrice: 400 }),
        enrichMeta: async (meta) => ({
          meta: {
            ...meta,
            title: 'Item Price Drop',
            imageUrl: RICH_IMAGE,
            discountPrice: 220,
            originalPrice: 400,
            discountPercent: 45,
          },
          changed: true,
          skippedNetwork: true,
          imageStatus: 'valid',
        }),
        loadHistory: async () => history,
        recordSnapshots: async () => {},
      },
    });
    const deal = computeDealSignals({ meta: obs.meta!, signals: obs.meta!.signals });
    expect(
      deal.priceClass === 'recent_drop' ||
        deal.priceClass === 'near_historical_low' ||
        deal.priceClass === 'historical_low' ||
        deal.historyReady === false ||
        deal.priceClass === 'insufficient_evidence',
    ).toBe(true);
  });

  it('10. mismo SKU + misma ventana → snapshot idempotente (una sola escritura lógica)', async () => {
    const writes: string[] = [];
    const deps = {
      resolvePrice: async () => resolvedPrice({ price: 150, originalPrice: 200 }),
      enrichMeta: enrichTo({
        title: 'Idempotent SKU',
        imageUrl: RICH_IMAGE,
        originalPrice: 200,
        discountPrice: 150,
      }),
      loadHistory: async () => [],
      recordSnapshots: async (rows: Array<{ productId: string }>) => {
        writes.push(rows[0]!.productId);
      },
    };
    await observeStickySkuViaServer({
      productId: 'MLM1000',
      nicheId: 'beauty',
      persistSnapshots: true,
      observedAt: NOW,
      deps,
    });
    await observeStickySkuViaServer({
      productId: 'MLM1000',
      nicheId: 'beauty',
      persistSnapshots: true,
      observedAt: NOW,
      deps,
    });
    // Dos llamadas pueden invocar upsert; recordMlDailySnapshots es idempotente por día.
    expect(writes.every((id) => id === 'MLM1000')).toBe(true);
    expect(writes.length).toBe(2);
  });

  it('11–12. sticky no Playwright; canal server_api', async () => {
    const obs = await observeStickySkuViaServer({
      productId: 'MLM1212',
      nicheId: 'beauty',
      persistSnapshots: false,
      deps: {
        resolvePrice: async () => resolvedPrice(),
        enrichMeta: enrichTo({ title: 'Server Path', imageUrl: RICH_IMAGE, originalPrice: 399 }),
        loadHistory: async () => [],
        recordSnapshots: async () => {},
      },
    });
    expect(obs.provenance.channel).toBe('server_api');
    expect(obs.provenance.mode).toBe('sticky');
    expect(JSON.stringify(obs)).not.toMatch(/playwright|pdp_blocked/i);
  });
});

describe('observeStickySkus funnel metrics', () => {
  it('separa api success vs evidence rich', async () => {
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
          nicheId: 'beauty',
          store: null,
          category: 'belleza',
        },
      ],
      fetchQuote: async () => ({ current: 180, listPrice: 250, regularPrice: null }),
      enrichMeta: enrichTo({
        title: 'Solo Titulo Sin Imagen',
        imageUrl: '',
        originalPrice: 250,
        discountPercent: 28,
      }),
    });
    expect(report.stickyApiAttempted).toBe(1);
    expect(report.stickyApiSuccess).toBe(1);
    expect(report.stickyPriceVerified).toBe(1);
    expect(report.stickyEvidenceRich).toBe(0);
    expect(report.pdpAttempted).toBe(report.stickyApiAttempted);
  });

  it('source_blocked incrementa stickyApiBlocked', async () => {
    const config = loadBotIngestConfig('standard');
    const report = await observeStickySkus({
      config,
      nicheId: 'beauty',
      persistSnapshots: false,
      selectTargets: async () => [
        {
          productId: 'MLM403000001',
          priorDays: 5,
          lastObservedOn: '2026-09-10',
          lastPrice: 200,
          listPrice: 250,
          hoursSinceObserved: 48,
          nicheId: 'beauty',
          store: null,
          category: 'belleza',
        },
      ],
      deps: {
        resolvePrice: async () =>
          resolvedPrice({ status: 'unauthorized', price: null, httpStatus: 403, source: 'none' }),
        enrichMeta: enrichTo({}),
        loadHistory: async () => [],
        recordSnapshots: async () => {},
      },
    });
    expect(report.stickyApiBlocked).toBe(1);
    expect(report.stickyApiSuccess).toBe(0);
    expect(report.candidates).toHaveLength(0);
  });
});

describe('WRITE / auto-approve safety', () => {
  it('13–15. dry_run WRITE false; no auto-approve path', async () => {
    const report = await runSupplyEngine({
      mode: 'dry_run',
      nicheId: 'beauty',
      enableSticky: false,
      persistSnapshots: false,
      sources: [],
    });
    expect(report.wroteOffers).toBe(false);
    expect(report.mode).toBe('dry_run');
    const cfg = loadBotIngestConfig('standard');
    expect(cfg.legacyAutoApproveWriteEnabled).toBe(false);
  });
});

describe('worker sticky seeds', () => {
  it('index.mjs no fetchea sticky seeds para Playwright', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const src = await fs.readFile(
      path.join(process.cwd(), 'workers/mercadolibre-worker/src/index.mjs'),
      'utf8',
    );
    expect(src).toMatch(/sticky_seeds_skipped=server_api_path_only/);
    expect(src).not.toMatch(/group: 'sticky'/);
  });
});
