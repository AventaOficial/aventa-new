/**
 * Day 13.2 — Price Intelligence identity + hunter source progress observability.
 * OBSERVABILITY ONLY: tests prove the traces and that observed outputs, Price Memory
 * writes and hunter results are identical with and without instrumentation.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import type { MercadoLibrePriceResolution } from '@/lib/offers/resolveMercadoLibrePrice';

type PmRow = {
  product_id: string;
  recorded_on: string;
  last_price: number;
  min_price: number;
  list_price: number | null;
  regular_price: number | null;
};

const pm = {
  history: new Map<string, PmRow[]>(),
  upserts: [] as Array<{ product_id: string; last_price: number; list_price: number | null }>,
};

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({
    from: () => {
      const state: { productId: string | null; inIds: string[] | null } = {
        productId: null,
        inIds: null,
      };
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (col: string, v: string) => {
          if (col === 'product_id') state.productId = v;
          return builder;
        },
        in: (_col: string, v: string[]) => {
          state.inIds = v;
          return builder;
        },
        gte: () => builder,
        order: () => builder,
        limit: () => builder,
        upsert: async (rows: PmRow[]) => {
          for (const r of rows) {
            pm.upserts.push({ product_id: r.product_id, last_price: r.last_price, list_price: r.list_price });
          }
          return { error: null };
        },
        then: (resolve: (v: unknown) => void) => {
          if (state.inIds) return resolve({ data: [], error: null });
          const rows = state.productId ? (pm.history.get(state.productId) ?? []) : [];
          return resolve({ data: rows, error: null });
        },
      };
      return builder;
    },
  }),
}));

const resolveMock = vi.fn<(args: unknown) => Promise<MercadoLibrePriceResolution>>();
vi.mock('@/lib/offers/resolveMercadoLibrePrice', async (orig) => {
  const actual = await orig<typeof import('@/lib/offers/resolveMercadoLibrePrice')>();
  return { ...actual, resolveMercadoLibrePrice: (args: unknown) => resolveMock(args) };
});

const { enrichWithPriceIntel } = await import('@/lib/bots/ingest/priceIntel');
const { observeStickySkuViaServer } = await import('@/lib/hunter/supply/observeStickySkus');
const obsMod = await import('@/lib/hunter/discovery/priceIntelObservability');
const {
  aggregatePriceIntelObservations,
  classifyUrlDerivedPriceIntelIdentity,
  createPriceIntelRecorder,
  explicitListingIdFromSignals,
  runObservedSecondPricePass,
} = obsMod;
const { buildCandidateObservation } = await import('@/lib/hunter/discovery/discoveryObservability');
const { runHunterCollect } = await import('@/lib/hunter/engine');
const { resetHunterHealthMemoryForTests } = await import('@/lib/hunter/healthStore');
const { ingestItemToCandidate } = await import('@/lib/hunter/normalize');
const { fetchWithTimeout } = await import('@/lib/server/fetchWithTimeout');
const { raceWithBudget } = await import('@/lib/hunter/discovery/deadlineBudget');
const sp = await import('@/lib/hunter/sourceProgress');

const CAT = 'MLM63084226';
const LST = 'MLM4503400006';
const RICH_IMAGE = 'https://http2.mlstatic.com/D_NQ_NP_2X_123456-MLA123456789_012025-F.jpg';
const CONFIG = { keepaEnabled: false, keepaApiKey: '', supplyNicheId: null } as unknown as BotIngestConfig;

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

function historyRows(id: string, price: number, days: number[]): PmRow[] {
  return days.map((d) => ({
    product_id: id,
    recorded_on: daysAgo(d),
    last_price: price,
    min_price: price,
    list_price: 2621,
    regular_price: null,
  }));
}

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

function productsItemsFetch(listing: string) {
  return async (path: string) => {
    if (path.endsWith('/items')) {
      return {
        ok: true as const,
        status: 200,
        authenticated: true,
        data: { results: [{ item_id: listing, price: 1981.73, original_price: 2621 }] },
      };
    }
    return {
      ok: true as const,
      status: 200,
      authenticated: true,
      data: { name: 'Producto catálogo Day 13.2 fixture', pictures: [{ secure_url: RICH_IMAGE }] },
    };
  };
}

/** Mirrors enrichCandidateMeta: observe (PI #1) then second pass (PI #2). */
async function runStickyFlow(opts: { observed: boolean; tip?: string; stickyResolve?: MercadoLibrePriceResolution }) {
  const recorder = createPriceIntelRecorder();
  const writes: string[] = [];
  const tip = opts.tip ?? CAT;
  const obs = await observeStickySkuViaServer({
    productId: tip,
    nicheId: 'continuous_discovery',
    persistSnapshots: true,
    deps: {
      enrichMeta: passthroughEnrich,
      lookupMeta: async () => null,
      loadHistory: async (id: string) =>
        (pm.history.get(id) ?? []).map((r) => ({
          recordedOn: r.recorded_on,
          lastPrice: r.last_price,
          minPrice: r.min_price,
          listPrice: r.list_price,
          regularPrice: r.regular_price,
        })),
      recordSnapshots: async (rows: Array<{ productId: string }>) => {
        for (const r of rows) writes.push(r.productId);
      },
      resolvePrice: async () => opts.stickyResolve ?? priceRes({ status: 'unavailable', httpStatus: 404 }),
      fetchApi: productsItemsFetch(LST),
    },
    ...(opts.observed
      ? {
          priceIntelObserver: recorder.observerFor('sticky_observe', ({ kind }) => ({
            kind,
            source: 'sticky_observe' as const,
          })),
        }
      : {}),
  });
  if (opts.observed) recorder.markApplied('sticky_observe', obs.meta != null);
  expect(obs.meta).not.toBeNull();
  const explicitListingId = explicitListingIdFromSignals(obs.meta!.signals);
  const meta = opts.observed
    ? await runObservedSecondPricePass({
        meta: obs.meta!,
        recorder,
        acquisitionPath: 'sticky_observe',
        run: (m, observer) => enrichWithPriceIntel(m, CONFIG, { preserveLabelDiscount: true, observer }),
      })
    : await enrichWithPriceIntel(obs.meta!, CONFIG, { preserveLabelDiscount: true });
  return { meta, trace: recorder.finalize({ explicitListingId }), stickyWrites: writes, obs };
}

beforeEach(() => {
  pm.history.clear();
  pm.upserts.length = 0;
  resolveMock.mockReset();
  resolveMock.mockResolvedValue(priceRes({ status: 'unauthorized', httpStatus: 403 }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('forbidden', { status: 403 })),
  );
  resetHunterHealthMemoryForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Day13.2 PI identity — single calculation', () => {
  it('1. product candidate: observe-only flow records exactly one PRODUCT calculation', async () => {
    pm.history.set(CAT, historyRows(CAT, 1981.73, [2, 3, 4, 5, 6]));
    const recorder = createPriceIntelRecorder();
    const obs = await observeStickySkuViaServer({
      productId: CAT,
      nicheId: 'continuous_discovery',
      persistSnapshots: false,
      deps: {
        enrichMeta: passthroughEnrich,
        lookupMeta: async () => null,
        loadHistory: async () => [],
        recordSnapshots: async () => {},
        resolvePrice: async () => priceRes({ status: 'unavailable', httpStatus: 404 }),
        fetchApi: productsItemsFetch(LST),
      },
      priceIntelObserver: recorder.observerFor('sticky_observe', ({ kind }) => ({
        kind,
        source: 'sticky_observe',
      })),
    });
    recorder.markApplied('sticky_observe', obs.meta != null);
    const t = recorder.finalize();
    expect(t.price_intel_calculation_count).toBe(1);
    expect(t.price_intel_identity_kind).toBe('product');
    expect(t.price_intel_identity_id).toBe(CAT);
    expect(t.price_intel_identity_source).toBe('sticky_observe');
    expect(t.price_intel_evidence_kind).toBe('live');
    expect(t.observed_listing_id).toBe(LST);
    expect(t.price_intel_overwrite_detected).toBe(false);
    expect(t.price_intel_overwrite_reason).toBeNull();
    expect(t.price_memory_writes).toEqual([]);
  });

  it('2. listing candidate (explicit mapping, no prior PI): one LISTING calculation', async () => {
    const recorder = createPriceIntelRecorder();
    const meta: ParsedOfferMetadata = {
      canonicalUrl: `https://articulo.mercadolibre.com.mx/MLM-${LST.slice(3)}`,
      title: 'Listing fixture Day 13.2',
      store: 'Mercado Libre',
      imageUrl: RICH_IMAGE,
      discountPrice: 1981.73,
      originalPrice: 2621,
      discountPercent: 24,
      signals: {
        mlCatalogProductId: CAT,
        mlListingItemId: LST,
        mlIdentityMatchMethod: 'catalog_to_listing_via_products_items',
      },
    };
    await runObservedSecondPricePass({
      meta,
      recorder,
      acquisitionPath: 'discovery_evidence_fallback',
      run: (m, observer) => enrichWithPriceIntel(m, CONFIG, { preserveLabelDiscount: true, observer }),
    });
    const t = recorder.finalize({ explicitListingId: explicitListingIdFromSignals(meta.signals) });
    expect(t.price_intel_calculation_count).toBe(1);
    expect(t.price_intel_identity_kind).toBe('listing');
    expect(t.price_intel_identity_id).toBe(LST);
    expect(t.price_intel_identity_source).toBe('identity_mapping');
    expect(t.price_intel_evidence_kind).toBe('fallback');
    expect(t.price_intel_overwrite_detected).toBe(false);
  });
});

describe('Day13.2 PI identity — double enrichment', () => {
  it('3. PRODUCT → LISTING overwrite detected with before/after + PM write trace', async () => {
    pm.history.set(CAT, historyRows(CAT, 1981.73, [2, 3, 4, 5, 6]));
    const { trace: t, stickyWrites } = await runStickyFlow({ observed: true });

    expect(t.price_intel_calculation_count).toBe(2);
    expect(t.price_intel_overwrite_detected).toBe(true);
    expect(t.price_intel_overwrite_reason).toBe('identity_changed');
    expect(t.price_intel_previous_identity_kind).toBe('product');
    expect(t.price_intel_previous_identity_id).toBe(CAT);
    expect(t.price_intel_previous_result_applied).toBe(true);
    expect(t.price_intel_identity_kind).toBe('listing');
    expect(t.price_intel_identity_id).toBe(LST);
    expect(t.price_intel_identity_source).toBe('identity_mapping');
    expect(t.price_intel_evidence_kind).toBe('fallback');
    expect(t.observed_listing_id).toBe(LST);

    expect(t.before_second_pass?.identity_kind).toBe('product');
    expect(t.before_second_pass?.history_ready).toBe(true);
    expect(t.before_second_pass?.habitual30d).toBe(1981.73);
    expect(t.after_second_pass?.identity_kind).toBe('listing');
    expect(t.after_second_pass?.history_ready).toBe(false);
    expect(t.after_second_pass?.habitual30d).toBeNull();
    expect(t.second_pass_changed).toMatchObject({
      identity: true,
      history_ready: true,
      habitual30d: true,
      lowest30d: true,
      lowest90d: true,
      current_price: false,
      original_price: false,
    });

    // 7. Price Memory write observability (writes themselves unchanged).
    expect(stickyWrites).toEqual([CAT]);
    expect(pm.upserts.map((u) => u.product_id)).toEqual([LST]);
    expect(t.price_memory_writes).toEqual([
      expect.objectContaining({
        writer: 'sticky_observe',
        key: CAT,
        key_kind: 'product',
        observed_listing_id: LST,
        evidence_kind: 'live',
        after_price_intel: false,
      }),
      expect.objectContaining({
        writer: 'enrich_with_price_intel',
        key: LST,
        key_kind: 'listing',
        prior_pi_identity_kind: 'product',
        prior_pi_identity_id: CAT,
        evidence_kind: 'fallback',
        after_price_intel: true,
      }),
    ]);
  });

  it('3b. instrumentation does not change meta, PM writes or intel (A/B)', async () => {
    pm.history.set(CAT, historyRows(CAT, 1981.73, [2, 3, 4, 5, 6]));
    const a = await runStickyFlow({ observed: false });
    const upsertsA = [...pm.upserts];
    pm.upserts.length = 0;
    const b = await runStickyFlow({ observed: true });
    expect(b.meta).toEqual(a.meta);
    expect(b.stickyWrites).toEqual(a.stickyWrites);
    expect(pm.upserts).toEqual(upsertsA);
  });

  it('4. LISTING → PRODUCT overwrite detected (identity_changed)', async () => {
    const recorder = createPriceIntelRecorder();
    const first = recorder.observerFor('sticky_observe', ({ kind }) => ({ kind, source: 'sticky_observe' }));
    first.onPriceIntelComputed?.({
      id: LST,
      kind: 'listing',
      writer: 'sticky_observe',
      evidenceKind: 'live',
      observedListingId: LST,
    });
    recorder.markApplied('sticky_observe', true);
    const meta: ParsedOfferMetadata = {
      canonicalUrl: `https://www.mercadolibre.com.mx/p/${CAT}`,
      title: 'x',
      store: 'Mercado Libre',
      imageUrl: '',
      discountPrice: 100,
      originalPrice: 200,
      discountPercent: 50,
      signals: {
        mlCatalogProductId: CAT,
        mlListingItemId: LST,
        mlIdentityMatchMethod: 'catalog_to_listing_via_products_items',
      },
    };
    await runObservedSecondPricePass({
      meta,
      recorder,
      acquisitionPath: 'sticky_observe',
      run: async (m, observer) => {
        observer.onPriceIntelComputed?.({
          id: CAT,
          kind: 'unknown',
          writer: 'enrich_with_price_intel',
          evidenceKind: 'live',
          observedListingId: null,
        });
        return m;
      },
    });
    const t = recorder.finalize();
    expect(t.price_intel_overwrite_detected).toBe(true);
    expect(t.price_intel_overwrite_reason).toBe('identity_changed');
    expect(t.price_intel_previous_identity_kind).toBe('listing');
    expect(t.price_intel_identity_kind).toBe('product');
    expect(t.price_intel_identity_id).toBe(CAT);
  });

  it('5. same identity recalculated (tip = listing, no mapping → kind unknown)', async () => {
    const ITEM = 'MLM1649534433';
    resolveMock.mockResolvedValue(
      priceRes({ status: 'resolved', price: 500, originalPrice: 900, httpStatus: 200, confidence: 'high' }),
    );
    const { trace: t } = await runStickyFlow({
      observed: true,
      tip: ITEM,
      stickyResolve: priceRes({ status: 'resolved', price: 500, originalPrice: 900, httpStatus: 200 }),
    });
    expect(t.price_intel_calculation_count).toBe(2);
    expect(t.price_intel_overwrite_detected).toBe(true);
    expect(t.price_intel_overwrite_reason).toBe('same_identity_recalculated');
    expect(t.price_intel_previous_identity_id).toBe(ITEM);
    expect(t.price_intel_identity_id).toBe(ITEM);
    expect(t.price_intel_identity_kind).toBe('unknown');
    expect(t.price_intel_evidence_kind).toBe('live');
  });

  it('6. unknown identity: no calculation and no explicit signals stay unknown/null', async () => {
    const empty = createPriceIntelRecorder().finalize();
    expect(empty).toMatchObject({
      price_intel_identity_kind: 'unknown',
      price_intel_identity_id: null,
      price_intel_identity_source: 'unknown',
      price_intel_evidence_kind: 'unknown',
      price_intel_calculation_count: 0,
      price_intel_overwrite_detected: false,
      observed_listing_id: null,
    });
    // An 8-digit vs 10-digit id is never used to guess the kind.
    expect(
      classifyUrlDerivedPriceIntelIdentity({ id: CAT, signals: {}, acquisitionPath: 'precomputed_only' }),
    ).toEqual({ kind: 'unknown', source: 'unknown' });
    expect(
      classifyUrlDerivedPriceIntelIdentity({
        id: LST,
        signals: { mlCatalogProductId: CAT, mlListingItemId: LST, mlIdentityMatchMethod: 'exact_item_id' },
        acquisitionPath: 'sticky_observe',
      }),
    ).toEqual({ kind: 'unknown', source: 'sticky_observe' });
  });

  it('7b. a throwing observer never alters the observed flow', async () => {
    pm.history.set(CAT, historyRows(CAT, 1981.73, [2, 3, 4, 5, 6]));
    const plain = await enrichWithPriceIntel(
      { canonicalUrl: `https://articulo.mercadolibre.com.mx/MLM-${LST.slice(3)}`, title: 't', store: 'Mercado Libre', imageUrl: '', discountPrice: 10, originalPrice: 20, discountPercent: 50 },
      CONFIG,
    );
    const boom = () => {
      throw new Error('observer failure');
    };
    const observed = await enrichWithPriceIntel(
      { canonicalUrl: `https://articulo.mercadolibre.com.mx/MLM-${LST.slice(3)}`, title: 't', store: 'Mercado Libre', imageUrl: '', discountPrice: 10, originalPrice: 20, discountPercent: 50 },
      CONFIG,
      { observer: { onQuoteEvidence: boom, onPriceMemoryWriteAttempt: boom, onPriceIntelComputed: boom } },
    );
    expect(observed).toEqual(plain);
  });

  it('aggregate + durable candidate observation carry the trace additively', async () => {
    pm.history.set(CAT, historyRows(CAT, 1981.73, [2, 3, 4, 5, 6]));
    const { trace, meta } = await runStickyFlow({ observed: true });
    const agg = aggregatePriceIntelObservations([trace, null]);
    expect(agg).toMatchObject({
      candidates: 1,
      overwrite_detected: 1,
      identity_changed: 1,
      second_pass_changed_history_ready: 1,
      pm_write_attempts: 2,
      pm_write_attempts_after_price_intel: 1,
      pm_write_attempts_key_differs_from_prior_pi: 1,
    });
    const base = {
      url: meta.canonicalUrl,
      sourceId: 'pm_evidence_backed',
      productId: CAT,
      historyReady: false,
      meta,
      acquisitionPath: 'sticky_observe' as const,
      originalRecoveredVia: 'products_items' as const,
      qualityDecision: 'SUPPRESSED',
      wouldInsert: false,
      dqeDecision: 'VERIFIED_DEAL',
      primaryTerminal: 'INSUFFICIENT_HISTORY' as const,
      reasonCodes: [],
      provenanceDiag: null,
    };
    const without = buildCandidateObservation(base);
    const withTrace = buildCandidateObservation({ ...base, priceIntel: trace });
    expect('price_intel' in without).toBe(false);
    const { price_intel, ...rest } = withTrace;
    expect(rest).toEqual(without);
    expect(price_intel?.price_intel_overwrite_detected).toBe(true);
  });
});

describe('Day13.2 wiring — gates and writers untouched', () => {
  const cycleSrc = readFileSync(
    join(process.cwd(), 'lib/hunter/discovery/continuousDiscoveryCycle.ts'),
    'utf8',
  );
  it('cycle still runs the same second pass (observed, not removed)', () => {
    expect(cycleSrc).toContain('runObservedSecondPricePass({');
    expect(cycleSrc).toContain('enrichWithPriceIntel(m, config, { preserveLabelDiscount: true, observer })');
    expect(cycleSrc).toContain('persistSnapshots: true,');
  });
  it('gate inputs are unchanged: DQE / S6.1 / provenance read the same meta', () => {
    expect(cycleSrc).toContain('evaluateDealQualityFromParsedMeta(meta, {');
    expect(cycleSrc).toContain('evaluateMachineCandidateGate({');
    expect(cycleSrc).toContain('diagnoseProvenanceCompleteness({');
    expect(cycleSrc).toContain("const historyReady = meta.signals?.historyReady === true;");
  });
});

type HunterSourceLike = import('@/lib/hunter/types').HunterSource;
type HunterCollectResultLike = import('@/lib/hunter/types').HunterCollectResult;

function mockSource(
  id: HunterSourceLike['id'],
  collect: () => Promise<HunterCollectResultLike>,
): HunterSourceLike {
  return {
    id,
    ingestSourceId: id === 'ml_api_legacy' ? 'ml_api' : id === 'env_urls' ? 'env_urls' : 'amazon_asin',
    displayName: id,
    priority: 10,
    expectedIntervalMs: 15 * 60 * 1000,
    isEnabled: () => true,
    isAvailable: () => true,
    collect,
  } as HunterSourceLike;
}

function cand(url: string, source: 'ml_api_legacy' | 'env_urls') {
  return ingestItemToCandidate(
    { url, source: source === 'ml_api_legacy' ? 'ml_api' : 'env_urls' },
    source,
  );
}

const HUNTER_CONFIG = { amazonSource: 'scrape' } as unknown as BotIngestConfig;

describe('Day13.2 hunter source progress', () => {
  it('8. normal completion: per-source requests, received, accepted, duplicates', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    const sameUrl = 'https://articulo.mercadolibre.com.mx/MLM-123456789-foo_JM';
    const sources = [
      mockSource('ml_api_legacy', async () => {
        await fetchWithTimeout('https://api.example.test/a');
        await fetchWithTimeout('https://api.example.test/b');
        return {
          ok: true,
          candidates: [cand(sameUrl, 'ml_api_legacy')],
          itemsFound: 1,
          collectedCount: 4,
        };
      }),
      mockSource('env_urls', async () => {
        await fetchWithTimeout('https://api.example.test/c');
        return { ok: true, candidates: [cand(sameUrl, 'env_urls')], itemsFound: 1 };
      }),
    ];
    const progress = sp.createHunterCollectProgress();
    const withProgress = await runHunterCollect({
      config: HUNTER_CONFIG,
      rotationWave: 0,
      sources,
      persistHealth: false,
      progress,
    });
    const snap = sp.snapshotHunterCollectProgress(progress, { plannedSources: ['ml_api_legacy', 'env_urls'] });
    expect(snap.engine_returned).toBe(true);
    expect(snap.outer_deadline_fired).toBe(false);
    const ml = snap.entries.find((e) => e.source === 'ml_api_legacy')!;
    const env = snap.entries.find((e) => e.source === 'env_urls')!;
    expect(ml).toMatchObject({
      status: 'completed',
      candidates_received: 1,
      candidates_accepted: 1,
      candidates_discarded: 3,
      duplicates: 0,
      deadline_status: 'none',
      partial_result_lost: false,
    });
    expect(ml.requests).toMatchObject({ requests_started: 2, requests_completed: 2 });
    expect(env).toMatchObject({ status: 'completed', candidates_received: 1, candidates_accepted: 0, duplicates: 1 });
    expect(env.requests.requests_started).toBe(1);
    expect(typeof ml.elapsed_ms).toBe('number');

    // Same engine output without instrumentation (latency excluded).
    resetHunterHealthMemoryForTests();
    const plain = await runHunterCollect({ config: HUNTER_CONFIG, rotationWave: 0, sources, persistHealth: false });
    const strip = (runs: typeof plain.sourceRuns) => runs.map(({ latencyMs: _l, ...r }) => r);
    expect(strip(withProgress.sourceRuns)).toEqual(strip(plain.sourceRuns));
    expect(withProgress.items).toEqual(plain.items);
    expect(withProgress.stoppedReason).toEqual(plain.stoppedReason);
  });

  it('9. outer soft deadline: in-flight source keeps partial progress (not lost)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    const sources = [
      mockSource('ml_api_legacy', async () => {
        await fetchWithTimeout('https://api.example.test/slow', { timeoutMs: 60_000 });
        return { ok: true, candidates: [], itemsFound: 0 };
      }),
    ];
    const progress = sp.createHunterCollectProgress();
    const abort = new AbortController();
    const raced = await raceWithBudget(
      runHunterCollect({ config: HUNTER_CONFIG, rotationWave: 0, sources, persistHealth: false, progress, budgetMs: 40, signal: abort.signal }),
      40,
      () => abort.abort(),
    );
    expect(raced.ok).toBe(false);
    const snap = sp.snapshotHunterCollectProgress(progress, { outerDeadlineFired: !raced.ok, plannedSources: ['ml_api_legacy'] });
    expect(snap.outer_deadline_fired).toBe(true);
    expect(snap.engine_returned).toBe(false);
    const e = snap.entries[0]!;
    expect(e).toMatchObject({
      source: 'ml_api_legacy',
      status: 'running',
      deadline_status: 'in_flight_at_deadline',
      partial_result_lost: true,
      finished_at: null,
      candidates_received: null,
    });
    expect(e.requests).toMatchObject({ requests_started: 1, requests_completed: 0 });
    expect(e.elapsed_ms).toBeGreaterThanOrEqual(0);
  });

  it('9b. engine budget stop: later sources recorded as skipped_deadline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    const sources = [
      mockSource('ml_api_legacy', async () => {
        await new Promise((r) => setTimeout(r, 30));
        return { ok: true, candidates: [cand('https://articulo.mercadolibre.com.mx/MLM-1111111111-a_JM', 'ml_api_legacy')], itemsFound: 1 };
      }),
      mockSource('env_urls', async () => ({ ok: true, candidates: [], itemsFound: 0 })),
    ];
    const progress = sp.createHunterCollectProgress();
    const res = await runHunterCollect({ config: HUNTER_CONFIG, rotationWave: 0, sources, persistHealth: false, progress, budgetMs: 10 });
    expect(res.stoppedReason).toBe('soft_deadline');
    const snap = sp.snapshotHunterCollectProgress(progress);
    expect(snap.entries.map((e) => [e.source, e.status, e.deadline_status])).toEqual([
      ['ml_api_legacy', 'completed', 'none'],
      ['env_urls', 'skipped_deadline', 'skipped_before_start'],
    ]);
    expect(snap.entries[0]!.candidates_accepted).toBe(1);
  });

  it('10. multiple sources: completed + in-flight + not started at outer deadline', async () => {
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        call += 1;
        return call === 1 ? Promise.resolve(new Response('{}', { status: 403 })) : new Promise<Response>(() => {});
      }),
    );
    const sources = [
      mockSource('ml_api_legacy', async () => {
        await fetchWithTimeout('https://api.example.test/ok');
        return { ok: true, candidates: [cand('https://articulo.mercadolibre.com.mx/MLM-2222222222-a_JM', 'ml_api_legacy')], itemsFound: 1 };
      }),
      mockSource('env_urls', async () => {
        await fetchWithTimeout('https://api.example.test/hang', { timeoutMs: 60_000 });
        return { ok: true, candidates: [], itemsFound: 0 };
      }),
      mockSource('amazon_asin', async () => ({ ok: true, candidates: [], itemsFound: 0 })),
    ];
    const progress = sp.createHunterCollectProgress();
    const raced = await raceWithBudget(
      runHunterCollect({ config: HUNTER_CONFIG, rotationWave: 0, sources, persistHealth: false, progress }),
      60,
    );
    expect(raced.ok).toBe(false);
    const snap = sp.snapshotHunterCollectProgress(progress, {
      outerDeadlineFired: true,
      plannedSources: ['ml_api_legacy', 'env_urls', 'amazon_asin'],
    });
    const by = Object.fromEntries(snap.entries.map((e) => [e.source, e]));
    expect(by.ml_api_legacy).toMatchObject({
      status: 'completed',
      candidates_received: 1,
      candidates_accepted: null,
      deadline_status: 'finished_result_discarded',
      partial_result_lost: true,
    });
    expect(by.ml_api_legacy!.requests).toMatchObject({ requests_started: 1, requests_completed: 1, requests_http_error: 1 });
    expect(by.env_urls).toMatchObject({ status: 'running', deadline_status: 'in_flight_at_deadline', partial_result_lost: true });
    expect(by.env_urls!.requests.requests_started).toBe(1);
    expect(by.amazon_asin).toMatchObject({ status: 'not_started', deadline_status: 'not_reached_at_deadline' });
  });
});
