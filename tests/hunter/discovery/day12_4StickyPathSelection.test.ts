/**
 * Day 12.4 — sticky path selection: attempted vs not attempted vs source blocked.
 * Observability only; routing, DQE, S6.1 and provenance semantics unchanged.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import { isMachinePendingWriteEnabled } from '@/lib/bots/ingest/machineLiveInsertEligibility';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import {
  buildCandidateObservation,
  stickyObserveDiagnostics,
  stickyObserveIneligibility,
} from '@/lib/hunter/discovery/discoveryObservability';
import {
  observeStickySkus,
  observeStickySkuViaServer,
} from '@/lib/hunter/supply/observeStickySkus';
import type { MercadoLibrePriceResolution } from '@/lib/offers/resolveMercadoLibrePrice';

const RICH_IMAGE = 'https://http2.mlstatic.com/D_NQ_NP_2X_123456-MLA123456789_012025-F.jpg';

function priceRes(over: Partial<MercadoLibrePriceResolution>): MercadoLibrePriceResolution {
  return {
    status: 'unavailable',
    price: null,
    originalPrice: null,
    regularPrice: null,
    promotionPrice: null,
    currency: 'MXN',
    source: 'items_prices',
    confidence: 'low',
    resolvedBy: null,
    httpStatus: 404,
    ...over,
  } as MercadoLibrePriceResolution;
}

const passthroughEnrich = async (meta: ParsedOfferMetadata) => ({
  meta,
  changed: false,
  skippedNetwork: true,
  imageStatus: 'valid' as const,
});

const baseDeps = {
  enrichMeta: passthroughEnrich,
  loadHistory: async () => [],
  recordSnapshots: async () => {},
  lookupMeta: async () => null,
};

describe('Day12.4 path selector — exact routing condition', () => {
  it('PM-driven + productId → observe eligible (no ineligibility diag)', () => {
    expect(
      stickyObserveIneligibility({ priceMemoryDriven: true, productId: 'MLM63084226' }),
    ).toBeNull();
  });

  it('PM-driven without productId → not_attempted / missing_product_id', () => {
    expect(stickyObserveIneligibility({ priceMemoryDriven: true, productId: null })).toEqual({
      outcome: 'not_attempted',
      reason: 'missing_product_id',
      httpStatus: null,
    });
  });

  it('not PM-driven → observe not applicable (null), path stays precomputed_only', () => {
    expect(
      stickyObserveIneligibility({ priceMemoryDriven: false, productId: 'MLM63084226' }),
    ).toBeNull();
  });
});

describe('Day12.4 control positive — catalog id reaches products/items', () => {
  it('prices 404 (unavailable) → products/items 200 with original → ok + products_items', async () => {
    const fetchApi = vi.fn(async (path: string) => {
      if (path.endsWith('/items')) {
        return {
          ok: true as const,
          status: 200,
          authenticated: true,
          data: { results: [{ item_id: 'MLM4503400006', price: 1981.73, original_price: 2621 }] },
        };
      }
      return {
        ok: true as const,
        status: 200,
        authenticated: true,
        data: { name: 'Producto catálogo control positivo', pictures: [{ secure_url: RICH_IMAGE }] },
      };
    });
    const obs = await observeStickySkuViaServer({
      productId: 'MLM63084226',
      nicheId: 'continuous_discovery',
      persistSnapshots: false,
      deps: {
        ...baseDeps,
        resolvePrice: async () => priceRes({ status: 'unavailable', httpStatus: 404 }),
        fetchApi,
      },
    });
    expect(obs.meta).not.toBeNull();
    expect(obs.provenance.originalRecoveredVia).toBe('products_items');
    expect(obs.meta?.originalPrice).toBe(2621);
    expect(stickyObserveDiagnostics(obs).outcome).toBe('ok');
  });
});

describe('Day12.4 item id — attempted but source blocked (not "not attempted")', () => {
  it('prices 403 → unauthorized → source_blocked, fail-closed without products fallback', async () => {
    const fetchApi = vi.fn();
    const obs = await observeStickySkuViaServer({
      productId: 'MLM1649534433',
      nicheId: 'continuous_discovery',
      persistSnapshots: false,
      deps: {
        ...baseDeps,
        resolvePrice: async () => priceRes({ status: 'unauthorized', httpStatus: 403 }),
        fetchApi,
      },
    });
    expect(obs.observationStatus).toBe('source_blocked');
    expect(obs.meta).toBeNull();
    expect(obs.price).toBeNull();
    expect(fetchApi).not.toHaveBeenCalled();
    expect(stickyObserveDiagnostics(obs)).toEqual({
      outcome: 'source_blocked',
      reason: 'price_status:unauthorized',
      httpStatus: 403,
    });
  });

  it('item id on products API → 404 → not_found / products_not_found', async () => {
    const obs = await observeStickySkuViaServer({
      productId: 'MLM1649534433',
      nicheId: 'continuous_discovery',
      persistSnapshots: false,
      deps: {
        ...baseDeps,
        resolvePrice: async () => priceRes({ status: 'unavailable', httpStatus: 404 }),
        fetchApi: async () => ({ ok: false as const, status: 404, authenticated: true }),
      },
    });
    expect(obs.observationStatus).toBe('not_found');
    expect(stickyObserveDiagnostics(obs)).toEqual({
      outcome: 'not_found',
      reason: 'products_not_found',
      httpStatus: 404,
    });
  });
});

describe('Day12.4 durable observation fields', () => {
  it('precomputed_only + source_blocked is distinguishable from not attempted', () => {
    const obs = buildCandidateObservation({
      url: 'https://articulo.mercadolibre.com.mx/MLM-1649534433-_JM',
      sourceId: 'sticky_near_ready',
      productId: 'MLM1649534433',
      historyReady: true,
      meta: null,
      acquisitionPath: 'precomputed_only',
      originalRecoveredVia: null,
      observeOutcome: 'source_blocked',
      observeReason: 'price_status:unauthorized',
      observeHttpStatus: 403,
      qualityDecision: 'SUPPRESSED',
      wouldInsert: false,
      dqeDecision: 'NO_VERIFIED_DEAL',
      primaryTerminal: 'PROVENANCE_FAILURE',
      reasonCodes: ['PROVENANCE_MISSING_CURRENT_EVIDENCE'],
      provenanceDiag: null,
    });
    expect(obs.acquisition_path).toBe('precomputed_only');
    expect(obs.observe_outcome).toBe('source_blocked');
    expect(obs.observe_reason).toBe('price_status:unauthorized');
    expect(obs.observe_http_status).toBe(403);
    expect(obs.schema_version).toBe(1);
  });

  it('non-PM candidate → observe fields null', () => {
    const obs = buildCandidateObservation({
      url: 'https://articulo.mercadolibre.com.mx/MLM-1-_JM',
      sourceId: 'ml_api_legacy',
      productId: null,
      historyReady: false,
      meta: null,
      acquisitionPath: 'unknown',
      originalRecoveredVia: null,
      qualityDecision: 'EXTRACTION_FAILED',
      wouldInsert: false,
      dqeDecision: null,
      primaryTerminal: 'EXTRACTION_FAILED',
      reasonCodes: [],
      provenanceDiag: null,
    });
    expect(obs.observe_outcome).toBeNull();
    expect(obs.observe_reason).toBeNull();
    expect(obs.observe_http_status).toBeNull();
  });
});

describe('Day12.4 deadline + Day 12.3 interaction', () => {
  const cycleSrc = readFileSync(
    join(process.cwd(), 'lib/hunter/discovery/continuousDiscoveryCycle.ts'),
    'utf8',
  );

  it('deadline stops enrich before a candidate is observed (never yields precomputed_only)', () => {
    const loopStart = cycleSrc.indexOf('for (const cand of rankedCandidates)');
    const deadlineBreak = cycleSrc.indexOf('stopping enrich', loopStart);
    const enrichCall = cycleSrc.indexOf('await enrichCandidateMeta(', loopStart);
    expect(loopStart).toBeGreaterThan(0);
    expect(deadlineBreak).toBeGreaterThan(loopStart);
    expect(enrichCall).toBeGreaterThan(deadlineBreak);
  });

  it('continuous cycle uses observeStickySkuViaServer, not the snapshotOnly batch', () => {
    expect(cycleSrc).toMatch(/import \{ observeStickySkuViaServer \} from '@\/lib\/hunter\/supply\/observeStickySkus'/);
    expect(cycleSrc).not.toMatch(/\bobserveStickySkus\(/);
  });

  it('title thin + valid price → meta retained (Day 12.3 behavior)', async () => {
    const obs = await observeStickySkuViaServer({
      productId: 'MLM2501022145',
      nicheId: 'continuous_discovery',
      persistSnapshots: false,
      deps: {
        ...baseDeps,
        enrichMeta: async (meta) => ({
          meta: { ...meta, title: '', imageUrl: '' },
          changed: false,
          skippedNetwork: true,
          imageStatus: 'missing' as const,
        }),
        resolvePrice: async () =>
          priceRes({
            status: 'resolved',
            price: 5440.37,
            httpStatus: 200,
            confidence: 'high',
            resolvedBy: 'items_prices',
          }),
        fetchApi: async () => ({ ok: false as const, status: 404, authenticated: true }),
      },
    });
    expect(obs.meta).not.toBeNull();
    expect(obs.meta?.discountPrice).toBe(5440.37);
    expect(obs.meta?.originalPrice).toBeNull();
  });

  it('snapshotOnly (supply batch) — empty title never becomes a supply candidate', async () => {
    const report = await observeStickySkus({
      config: loadBotIngestConfig('standard'),
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
      enrichMeta: async (meta) => ({
        meta: { ...meta, title: '', imageUrl: '' },
        changed: false,
        skippedNetwork: true,
        imageStatus: 'missing',
      }),
      supabase: null,
    });
    expect(report.snapshotOnly).toBe(1);
    expect(report.candidates).toHaveLength(0);
  });
});

describe('Day12.4 safety', () => {
  it('machine pending remains off', () => {
    expect(isMachinePendingWriteEnabled()).toBe(false);
  });
});
