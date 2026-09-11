import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMlApiMock = vi.fn();

vi.mock('@/lib/integrations/mercadolibre/apiClient', () => ({
  fetchMlApi: (...args: unknown[]) => fetchMlApiMock(...args),
}));

vi.mock('@/lib/hunter/mlQuality/metrics', () => ({
  recordMlPriceQuality: vi.fn(),
}));

import {
  clearMercadoLibrePriceCache,
  getMercadoLibrePriceCacheSizeForTests,
  pickExactCatalogItem,
  resolveMercadoLibrePrice,
} from '@/lib/offers/resolveMercadoLibrePrice';
import { applyMlPriceIntelToMeta } from '@/lib/bots/ingest/priceIntel';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';

describe('pickExactCatalogItem', () => {
  it('encuentra exact match por item_id entre múltiples', () => {
    const row = pickExactCatalogItem(
      [
        { item_id: 'MLM111', price: 100 },
        { item_id: 'MLM1413356802', price: 479, currency_id: 'MXN' },
        { item_id: 'MLM999', price: 10 },
      ],
      'MLM1413356802',
    );
    expect(row?.price).toBe(479);
  });

  it('wrong item rejected / no matching → null (nunca el primero)', () => {
    expect(
      pickExactCatalogItem([{ item_id: 'MLM111', price: 100 }], 'MLM1413356802'),
    ).toBeNull();
    expect(pickExactCatalogItem([], 'MLM1413356802')).toBeNull();
  });
});

describe('resolveMercadoLibrePrice', () => {
  beforeEach(() => {
    fetchMlApiMock.mockReset();
    clearMercadoLibrePriceCache();
  });

  it('1. item price resolved via /prices', async () => {
    fetchMlApiMock.mockImplementation(async (path: string) => {
      if (path.includes('/prices')) {
        return {
          ok: true,
          status: 200,
          authenticated: true,
          data: {
            currency_id: 'MXN',
            prices: [
              { type: 'promotion', amount: 397, regular_amount: 800 },
              { type: 'standard', amount: 800 },
            ],
          },
        };
      }
      return { ok: false, status: 404, authenticated: true };
    });
    const r = await resolveMercadoLibrePrice({
      itemId: 'MLM1413356802',
      catalogProductId: 'MLM18625838',
      bypassCache: true,
    });
    expect(r.status).toBe('resolved');
    expect(r.price).toBe(397);
    expect(r.originalPrice).toBe(800);
    expect(r.currency).toBe('MXN');
    expect(r.resolvedBy).toBe('items_prices');
    expect(r.promotionPrice).toBe(397);
    expect(r.regularPrice).toBe(800);
  });

  it('2-6. product items exact match; wrong/no match unavailable', async () => {
    fetchMlApiMock.mockImplementation(async (path: string) => {
      if (path.includes('/prices') || path.includes('/sale_price')) {
        return { ok: false, status: 403, authenticated: true };
      }
      if (path.includes('/products/') && path.endsWith('/items')) {
        return {
          ok: true,
          status: 200,
          authenticated: true,
          data: {
            results: [
              { item_id: 'MLM111', price: 100, currency_id: 'MXN' },
              {
                item_id: 'MLM1413356802',
                price: 479,
                original_price: 559,
                currency_id: 'MXN',
              },
            ],
          },
        };
      }
      return { ok: false, status: 404, authenticated: true };
    });

    const ok = await resolveMercadoLibrePrice({
      itemId: 'MLM1413356802',
      catalogProductId: 'MLM18625838',
      bypassCache: true,
    });
    expect(ok.status).toBe('resolved');
    expect(ok.price).toBe(479);
    expect(ok.originalPrice).toBe(559);
    expect(ok.currency).toBe('MXN');
    expect(ok.resolvedBy).toBe('products_items');

    const missing = await resolveMercadoLibrePrice({
      itemId: 'MLM0000000001',
      catalogProductId: 'MLM18625838',
      bypassCache: true,
    });
    expect(missing.status).toBe('unavailable');
    expect(missing.price).toBeNull();
  });

  it('7-8. price API success then 403 fallback chain', async () => {
    fetchMlApiMock.mockImplementation(async (path: string) => {
      if (path.includes('/prices')) return { ok: false, status: 403, authenticated: true };
      if (path.includes('/sale_price')) return { ok: false, status: 403, authenticated: true };
      if (path.endsWith('/items')) {
        return {
          ok: true,
          status: 200,
          authenticated: true,
          data: {
            results: [{ item_id: 'MLM1', price: 50, currency_id: 'MXN' }],
          },
        };
      }
      return { ok: false, status: 500, authenticated: true };
    });
    const r = await resolveMercadoLibrePrice({
      itemId: 'MLM1',
      catalogProductId: 'MLM9',
      bypassCache: true,
    });
    expect(r.status).toBe('resolved');
    expect(r.price).toBe(50);
  });

  it('9. 401 stays unauthorized when no fallback price', async () => {
    fetchMlApiMock.mockResolvedValue({ ok: false, status: 401, authenticated: true });
    const r = await resolveMercadoLibrePrice({
      itemId: 'MLM1',
      bypassCache: true,
    });
    expect(r.status).toBe('unauthorized');
    expect(r.price).toBeNull();
  });

  it('11. 404 en prices continúa a fallback; sin catálogo → unavailable', async () => {
    fetchMlApiMock.mockImplementation(async (path: string) => {
      if (path.includes('/prices')) return { ok: false, status: 404, authenticated: true };
      if (path.includes('/sale_price')) return { ok: false, status: 404, authenticated: true };
      return { ok: false, status: 404, authenticated: true };
    });
    const r = await resolveMercadoLibrePrice({ itemId: 'MLM1', bypassCache: true });
    expect(r.price).toBeNull();
    expect(['unavailable', 'not_found', 'unauthorized', 'error']).toContain(r.status);
  });

  it('12. 429 → unavailable/error sin inventar precio', async () => {
    fetchMlApiMock.mockResolvedValue({ ok: false, status: 429, authenticated: true });
    const r = await resolveMercadoLibrePrice({ itemId: 'MLM1', bypassCache: true });
    expect(r.price).toBeNull();
    expect(['unavailable', 'unauthorized', 'error']).toContain(r.status);
  });

  it('13. timeout → error', async () => {
    fetchMlApiMock.mockResolvedValue({
      ok: false,
      status: 0,
      authenticated: true,
      timedOut: true,
    });
    const r = await resolveMercadoLibrePrice({ itemId: 'MLM1', bypassCache: true });
    expect(r.price).toBeNull();
  });

  it('14-18. currency / current / regular / promotion / no original', async () => {
    fetchMlApiMock.mockImplementation(async (path: string) => {
      if (path.includes('/prices')) {
        return {
          ok: true,
          status: 200,
          authenticated: true,
          data: {
            currency_id: 'MXN',
            prices: [{ type: 'standard', amount: 120 }],
          },
        };
      }
      return { ok: false, status: 404, authenticated: true };
    });
    const r = await resolveMercadoLibrePrice({ itemId: 'MLM1', bypassCache: true });
    expect(r.currency).toBe('MXN');
    expect(r.price).toBe(120);
    expect(r.originalPrice).toBeNull();
    expect(r.promotionPrice).toBeNull();
  });

  it('19. no price → null never 0', async () => {
    fetchMlApiMock.mockImplementation(async (path: string) => {
      if (path.includes('/prices')) {
        return { ok: true, status: 200, authenticated: true, data: { prices: [] } };
      }
      if (path.includes('/sale_price')) {
        return { ok: true, status: 200, authenticated: true, data: {} };
      }
      return { ok: false, status: 404, authenticated: true };
    });
    const r = await resolveMercadoLibrePrice({
      itemId: 'MLM1',
      catalogProductId: 'MLM2',
      bypassCache: true,
    });
    expect(r.price).toBeNull();
    expect(r.price).not.toBe(0);
  });

  it('23. cache reuse', async () => {
    let calls = 0;
    fetchMlApiMock.mockImplementation(async (path: string) => {
      if (path.includes('/prices')) {
        calls += 1;
        return {
          ok: true,
          status: 200,
          authenticated: true,
          data: { currency_id: 'MXN', prices: [{ type: 'standard', amount: 10 }] },
        };
      }
      return { ok: false, status: 404, authenticated: true };
    });
    const a = await resolveMercadoLibrePrice({ itemId: 'MLM777' });
    const b = await resolveMercadoLibrePrice({ itemId: 'MLM777' });
    expect(a.price).toBe(10);
    expect(b.price).toBe(10);
    expect(calls).toBe(1);
    expect(getMercadoLibrePriceCacheSizeForTests()).toBeGreaterThanOrEqual(1);
  });
});

describe('Price Intel + Verifier posture', () => {
  it('20. Price Intel receives resolved price', () => {
    const meta: ParsedOfferMetadata = {
      title: 'X',
      store: 'Mercado Libre',
      imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_2X_1-O.jpg',
      discountPrice: 479,
      originalPrice: 559,
      discountPercent: 14,
      canonicalUrl: 'https://www.mercadolibre.com.mx/p/MLM18625838?wid=MLM1413356802',
    };
    const next = applyMlPriceIntelToMeta(meta, {
      quote: { current: 479, listPrice: 559, regularPrice: 559 },
      intel: {
        lowest30d: null,
        lowest90d: null,
        habitual30d: null,
        current: 479,
        listPrice: 559,
        regularPrice: 559,
        priceVsLowest90dPct: null,
        savingsVsHabitualPct: null,
        effectiveDiscountPercent: 14,
        suspectedArtificialListPrice: false,
        samples90d: 0,
        historyReady: false,
      },
    });
    expect(next.discountPrice).toBe(479);
    expect(next.originalPrice).toBe(559);
  });

  it('22. no price → never invent auto-approve input', () => {
    const missing = applyMlPriceIntelToMeta(
      {
        title: 'X',
        store: 'Mercado Libre',
        imageUrl: '',
        discountPrice: 0,
        originalPrice: null,
        discountPercent: 0,
        canonicalUrl: 'https://www.mercadolibre.com.mx/p/MLM1',
      },
      {
        quote: { current: 0, listPrice: null, regularPrice: null },
        intel: {
          lowest30d: null,
          lowest90d: null,
          habitual30d: null,
          current: 0,
          listPrice: null,
          regularPrice: null,
          priceVsLowest90dPct: null,
          savingsVsHabitualPct: null,
          effectiveDiscountPercent: null,
          suspectedArtificialListPrice: false,
          samples90d: 0,
          historyReady: false,
        },
      },
    );
    expect(missing.discountPrice).toBe(0);
    // enrichMercadoLibrePriceIntel returns null when current<=0 → no auto path from missing price
  });
});
