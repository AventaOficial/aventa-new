import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mlCalls: string[] = [];
let abortAfterCalls: { controller: AbortController; after: number } | null = null;

vi.mock('@/lib/integrations/mercadolibre/apiClient', () => ({
  HUNTER_HTTP_TIMEOUT_MS: 12_000,
  ML_API_BASE: 'https://api.mercadolibre.com',
  fetchMlApi: vi.fn(async (path: string) => {
    mlCalls.push(path);
    if (abortAfterCalls && mlCalls.length >= abortAfterCalls.after) {
      abortAfterCalls.controller.abort();
    }
    if (path.startsWith('/products/search')) {
      const results = Array.from({ length: 50 }, (_, i) => ({ id: `MLM${1000 + i}` }));
      return { ok: true, status: 200, authenticated: false, data: { results } };
    }
    if (path.startsWith('/highlights/')) {
      const content = Array.from({ length: 8 }, (_, i) => ({ id: `MLM${2000 + i}` }));
      return { ok: true, status: 200, authenticated: false, data: { content } };
    }
    if (path.startsWith('/sites/MLM/domain_discovery')) {
      return { ok: true, status: 200, authenticated: false, data: [{ category_id: 'MLM1000' }] };
    }
    if (/\/products\/[^/]+\/items$/.test(path)) {
      return { ok: true, status: 200, authenticated: false, data: { results: [] } };
    }
    if (path.startsWith('/products/')) {
      return { ok: true, status: 200, authenticated: false, data: { name: 'Producto de prueba' } };
    }
    return { ok: false, status: 404, authenticated: false };
  }),
}));

vi.mock('@/lib/bots/ingest/ingestHttp', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/bots/ingest/ingestHttp')>()),
  sleep: vi.fn(async () => undefined),
}));

vi.mock('@/lib/hunter/candidateIntelligence/schedulerStateStore', () => ({
  loadSchedulerState: vi.fn(async () => null),
  saveSchedulerState: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(() => ({})),
}));

import { discoverMercadoLibreIngestItems } from '@/lib/bots/ingest/discoverMercadoLibre';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import { runHunterCollect } from '@/lib/hunter/engine';
import { resetHunterHealthMemoryForTests } from '@/lib/hunter/healthStore';
import type { HunterCollectContext, HunterSource } from '@/lib/hunter/types';

function mlConfig() {
  return {
    ...loadBotIngestConfig('standard'),
    discoverMlEnabled: true,
    mlFetchReviews: false,
    mlQueries: ['audifonos', 'licuadora', 'laptop'],
  };
}

describe('bot-ingest: corte cooperativo de la recolección de MercadoLibre', () => {
  beforeEach(() => {
    mlCalls.length = 0;
    abortAfterCalls = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sin señal, una corrida recorre cientos de llamadas serie (no cabe en 300s con latencia real)', async () => {
    await discoverMercadoLibreIngestItems(mlConfig(), new Set(), 0);
    // Cada llamada real cuesta 300ms de pausa + latencia de red de ML.
    expect(mlCalls.length).toBeGreaterThan(300);
  });

  it('con la señal abortada, deja de llamar a ML y devuelve resultado parcial', async () => {
    const controller = new AbortController();
    abortAfterCalls = { controller, after: 20 };

    const result = await discoverMercadoLibreIngestItems(mlConfig(), new Set(), 0, {
      signal: controller.signal,
    });

    expect(mlCalls.length).toBeLessThanOrEqual(21);
    expect(result.skipReasonCounts['ml discovery: soft_deadline']).toBe(1);
    expect(result.skipReasonCounts['ml discovery: highlights_fallback']).toBeUndefined();
  });

  it('una señal ya abortada no hace ninguna llamada de búsqueda', async () => {
    const controller = new AbortController();
    controller.abort();

    await discoverMercadoLibreIngestItems(mlConfig(), new Set(), 0, { signal: controller.signal });

    expect(mlCalls).toEqual([]);
  });
});

describe('bot-ingest: runHunterCollect entrega la señal a las fuentes', () => {
  beforeEach(() => {
    resetHunterHealthMemoryForTests();
  });

  it('la fuente recibe la misma AbortSignal en su contexto', async () => {
    const controller = new AbortController();
    let received: AbortSignal | undefined;
    const source: HunterSource = {
      id: 'ml_api_legacy',
      ingestSourceId: 'ml_api',
      displayName: 'fake',
      priority: 1,
      expectedIntervalMs: 60_000,
      isEnabled: () => true,
      isAvailable: () => true,
      async collect(ctx: HunterCollectContext) {
        received = ctx.signal;
        return { ok: true, candidates: [], itemsFound: 0 };
      },
    };

    await runHunterCollect({
      config: mlConfig(),
      rotationWave: 0,
      sources: [source],
      persistHealth: false,
      budgetMs: 1_000,
      signal: controller.signal,
    });

    expect(received).toBe(controller.signal);
  });
});
