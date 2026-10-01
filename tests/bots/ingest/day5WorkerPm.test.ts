/**
 * Day 5 — Worker → Price Memory persistence + OAuth fail-open tests.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';

const recordMock = vi.fn(async () => undefined);

vi.mock('@/lib/bots/ingest/mlPriceEngine', async () => {
  const actual = await vi.importActual<typeof import('@/lib/bots/ingest/mlPriceEngine')>(
    '@/lib/bots/ingest/mlPriceEngine',
  );
  return {
    ...actual,
    recordMlDailySnapshots: (...args: unknown[]) => recordMock(...args),
  };
});

describe('persistPriceMemoryFromWorkerMetas', () => {
  beforeEach(() => {
    recordMock.mockClear();
  });

  it('persists ML identity + price before any DQE concern', async () => {
    const { persistPriceMemoryFromWorkerMetas } = await import(
      '@/lib/bots/ingest/persistWorkerPriceMemory'
    );
    const meta: ParsedOfferMetadata = {
      canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-2177969823-foo-_JM',
      title: 'Organizador',
      store: 'Mercado Libre',
      imageUrl: 'https://http2.mlstatic.com/x.jpg',
      discountPrice: 130.13,
      originalPrice: 175,
      discountPercent: 26,
    };
    const r = await persistPriceMemoryFromWorkerMetas([meta]);
    expect(r.written).toBe(1);
    expect(r.skippedNoIdentity).toBe(0);
    expect(recordMock).toHaveBeenCalledTimes(1);
    const obs = recordMock.mock.calls[0]![0] as Array<{ productId: string; current: number }>;
    expect(obs[0]!.productId).toMatch(/MLM2177969823/i);
    expect(obs[0]!.current).toBe(130.13);
  });

  it('skips homepage / missing identity without throwing', async () => {
    const { persistPriceMemoryFromWorkerMetas } = await import(
      '@/lib/bots/ingest/persistWorkerPriceMemory'
    );
    const meta: ParsedOfferMetadata = {
      canonicalUrl: 'https://www.mercadolibre.com.mx/',
      title: 'Home',
      store: 'Mercado Libre',
      imageUrl: '',
      discountPrice: 10,
      originalPrice: null,
      discountPercent: 0,
    };
    const r = await persistPriceMemoryFromWorkerMetas([meta]);
    expect(r.written).toBe(0);
    expect(r.skippedNoIdentity).toBe(1);
    expect(recordMock).not.toHaveBeenCalled();
  });
});

describe('getValidAccessToken OAuth fail-open', () => {
  it('returns null when token read throws (does not kill caller)', async () => {
    vi.resetModules();
    vi.doMock('@/lib/integrations/mercadolibre/tokenStore', async () => {
      const actual = await vi.importActual<
        typeof import('@/lib/integrations/mercadolibre/tokenStore')
      >('@/lib/integrations/mercadolibre/tokenStore');
      return {
        ...actual,
        getMercadoLibreTokenRow: async () => {
          throw new Error('ML_OAUTH_TOKEN_READ_FAILED');
        },
      };
    });
    vi.doMock('@/lib/integrations/mercadolibre/oauth', async () => {
      const actual = await vi.importActual<typeof import('@/lib/integrations/mercadolibre/oauth')>(
        '@/lib/integrations/mercadolibre/oauth',
      );
      return {
        ...actual,
        isMlOAuthEnabled: () => true,
      };
    });
    const { getValidAccessToken } = await import('@/lib/integrations/mercadolibre/tokenRefresh');
    await expect(getValidAccessToken()).resolves.toBeNull();
  });
});
