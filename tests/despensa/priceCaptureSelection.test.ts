import { describe, expect, it } from 'vitest';
import {
  createMercadoLibreCaptureAdapter,
  parsePriceCaptureConfig,
  PRICE_CAPTURE_CONFIG_KEY,
  runPriceCaptureCycle,
  type PriceCaptureReport,
} from '@/lib/offers/priceObservations';
import { scanCandidatePool, scanStartKey } from '@/lib/offers/priceObservations/selection';
import type { MercadoLibrePriceResolution } from '@/lib/offers/resolveMercadoLibrePrice';
import { createMemoryDb, memorySupabase, type MemoryDb } from '../helpers/memorySupabase';

/**
 * Selección escalable de la captura: universo mayor que un «top N», productos viejos aún
 * elegibles, rotación sin inanición, presupuesto de recorrido, concurrencia y recuperación.
 * Base en memoria con la misma semántica que el SQL (filtros `or`, keyset por `id`, la función
 * `price_capture_product_stats` y el índice único de idempotencia).
 */

const START = Date.parse('2026-10-12T16:00:00.000Z');
const DAY = 86_400_000;
const HOUR = 3_600_000;

/** uuid determinista repartido por todo el espacio de ids. */
function offerId(i: number): string {
  const spread = (Math.imul(i + 1, 2654435761) >>> 0).toString(16).padStart(8, '0');
  return `${spread}-0000-4000-8000-${i.toString(16).padStart(12, '0')}`;
}
const itemOf = (i: number) => `MLM${700000000 + i}`;

type OfferSpec = { i: number; createdDaysAgo?: number; expiresDaysAgo?: number | null; title?: string; item?: number };

function offer(spec: OfferSpec, nowMs = START) {
  const item = itemOf(spec.item ?? spec.i);
  return {
    id: offerId(spec.i),
    title: spec.title ?? 'Arroz blanco 1 kg',
    price: 34,
    original_price: null,
    offer_url: `https://articulo.mercadolibre.com.mx/${item.replace('MLM', 'MLM-')}-arroz`,
    product_fingerprint: `ml:${item}`,
    source_currency: 'MXN',
    status: 'approved',
    deleted_at: null,
    expires_at: spec.expiresDaysAgo == null ? null : new Date(nowMs - spec.expiresDaysAgo * DAY).toISOString(),
    created_at: new Date(nowMs - (spec.createdDaysAgo ?? 0) * DAY - spec.i * 60_000).toISOString(),
  };
}

function statsRpc(args: Record<string, unknown>, db: MemoryDb) {
  const items = new Set(args.p_item_ids as string[]);
  const out = new Map<string, { external_item_id: string; last_recorded_at: string; days: Set<string>; first_valid_at: string | null; last_valid_at: string | null }>();
  for (const r of db.tables.offer_price_snapshots ?? []) {
    if (r.source !== 'capture' || r.source_id !== args.p_source_id || !items.has(String(r.external_item_id))) continue;
    const at = String(r.recorded_at);
    if (at < String(args.p_since)) continue;
    const id = String(r.external_item_id);
    const s = out.get(id) ?? { external_item_id: id, last_recorded_at: at, days: new Set<string>(), first_valid_at: null, last_valid_at: null };
    if (at > s.last_recorded_at) s.last_recorded_at = at;
    if (r.validation_status === 'valid' && r.availability !== 'out_of_stock') {
      s.days.add(at.slice(0, 10));
      if (!s.first_valid_at || at < s.first_valid_at) s.first_valid_at = at;
      if (!s.last_valid_at || at > s.last_valid_at) s.last_valid_at = at;
    }
    out.set(id, s);
  }
  return { data: [...out.values()].map(({ days, ...s }) => ({ ...s, valid_days: days.size })), error: null };
}

type Env = ReturnType<typeof env>;

function env(offers: ReturnType<typeof offer>[], opts: { rpc?: 'ok' | 'missing' | 'error'; failing?: (itemId: string, call: number) => number | null } = {}) {
  let t = START;
  const calls = new Map<string, number>();
  const db = createMemoryDb({
    tables: {
      app_config: [{ key: PRICE_CAPTURE_CONFIG_KEY, value: { enabled: true } }],
      offers,
      offer_price_snapshots: [],
      ingest_cycle_locks: [],
    },
    unique: {
      offer_price_snapshots: [{ columns: ['idempotency_key'], where: (r) => r.idempotency_key != null }],
      ingest_cycle_locks: [{ columns: ['lock_key'] }],
    },
  });
  const rpc = opts.rpc ?? 'ok';
  db.rpcHandlers = {
    price_capture_product_stats: (args, d) =>
      rpc === 'ok'
        ? statsRpc(args, d)
        : rpc === 'missing'
          ? { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.price_capture_product_stats' } }
          : { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } },
  };
  const adapter = createMercadoLibreCaptureAdapter({
    fetchItems: async (ids) => new Map(ids.map((id) => [id, { id, title: 'Arroz blanco 1 kg', status: 'active', available_quantity: 50 }])),
    resolvePrice: async ({ itemId }): Promise<MercadoLibrePriceResolution> => {
      const n = calls.get(itemId) ?? 0;
      calls.set(itemId, n + 1);
      const fail = opts.failing?.(itemId, n) ?? null;
      const base = { originalPrice: null, regularPrice: null, promotionPrice: null };
      if (fail != null) {
        return { ...base, status: fail === 401 || fail === 403 ? 'unauthorized' : 'unavailable', price: null, currency: null, source: 'none', confidence: 'low', resolvedBy: null, httpStatus: fail };
      }
      return { ...base, status: 'resolved', price: 34, currency: 'MXN', source: 'items_prices', confidence: 'high', resolvedBy: 'items_prices', httpStatus: 200 };
    },
  });
  const supabase = memorySupabase(db);
  return {
    db,
    calls,
    totalCalls: () => [...calls.values()].reduce((a, b) => a + b, 0),
    advance: (ms: number) => {
      t += ms;
    },
    run: (override: Partial<ReturnType<typeof parsePriceCaptureConfig>> = {}) =>
      runPriceCaptureCycle({
        supabase,
        adapters: [adapter],
        clock: () => t,
        config: { ...parsePriceCaptureConfig({ enabled: true, maxCandidates: 60, maxPerSource: { mercadolibre_mx: 40 } }), ...override },
        log: () => undefined,
      }),
  };
}

const captures = (e: Env) => (e.db.tables.offer_price_snapshots ?? []).filter((r) => r.source === 'capture');
const capturedItems = (e: Env) => new Set(captures(e).map((r) => String(r.external_item_id)));

/** Cada producto elegible termina en exactamente un destino: elegido, reciente, diferido o sin estado. */
function accountedProducts(r: PriceCaptureReport): number {
  const s = r.skipped;
  return r.selected + (s.captured_recently ?? 0) + (s.over_source_cap ?? 0) + (s.over_run_cap ?? 0) + (s.recent_capture_check_failed ?? 0);
}

/** Cada oferta leída termina como producto elegible o con un motivo de descarte previo. */
function accountedOffers(r: PriceCaptureReport): number {
  const s = r.skipped;
  const perOffer = [
    'not_despensa',
    'invalid_offer_price',
    'currency_not_mxn',
    'source_unknown',
    'source_not_supported',
    'source_retired',
    'source_not_in_config',
    'source_disabled',
    'source_not_configured',
    'item_id_unresolved',
    'catalog_without_item',
    'same_product_other_offer',
  ] as const;
  return r.coverage!.eligibleProducts + perOffer.reduce((n, k) => n + (s[k] ?? 0), 0);
}

describe('captura: universo mayor que el antiguo «top 300 recientes»', () => {
  it('350 productos: los 350 son elegibles en una corrida y todos se capturan en corridas sucesivas', async () => {
    const e = env(Array.from({ length: 350 }, (_, i) => offer({ i, createdDaysAgo: i < 300 ? 0 : 40 })));
    const first = await e.run();
    expect(first.coverage).toMatchObject({
      scannedOffers: 350,
      scanComplete: true,
      statsSource: 'rpc',
      eligibleProducts: 350,
      neverObserved: 350,
      needingHistory: 350,
      deferredByQuota: 310,
      runCapacity: 40,
    });
    expect(first.selected).toBe(40);
    expect(first.inserted.valid).toBe(40);
    expect(accountedProducts(first)).toBe(350);
    expect(first.coverage!.coverage48h).toBeCloseTo(40 / 350, 3);
    // Lo diferido queda registrado con su antigüedad (null: nunca observado).
    expect(first.events.filter((x) => x.reason === 'over_source_cap').every((x) => x.staleHours === null)).toBe(true);

    for (let d = 1; d < 9; d += 1) {
      e.advance(DAY);
      const r = await e.run();
      expect(accountedProducts(r)).toBe(350);
    }
    // 9 corridas × 40 = 360 ≥ 350: ningún producto quedó fuera, incluidos los 50 más viejos.
    expect(capturedItems(e).size).toBe(350);
    for (let i = 300; i < 350; i += 1) expect(capturedItems(e).has(itemOf(i))).toBe(true);
    // Sin duplicados: una captura por producto por día.
    const perDay = new Set(captures(e).map((r) => `${r.external_item_id}|${String(r.recorded_at).slice(0, 10)}`));
    expect(perDay.size).toBe(captures(e).length);
  });

  it('un producto viejo (fuera de los 300 más recientes) y caducado hace 30 días se captura primero si nunca se observó', async () => {
    const offers = Array.from({ length: 350 }, (_, i) => offer({ i }));
    offers[349] = offer({ i: 349, createdDaysAgo: 80, expiresDaysAgo: 30 });
    const e = env(offers);
    // Los otros 349 productos ya se observaron hace una hora.
    e.db.tables.offer_price_snapshots = Array.from({ length: 349 }, (_, i) => ({
      id: `seed${i}`,
      offer_id: offerId(i),
      source: 'capture',
      source_id: 'mercadolibre_mx',
      external_item_id: itemOf(i),
      recorded_at: new Date(START - HOUR).toISOString(),
      validation_status: 'valid',
      availability: 'in_stock',
      price: 34,
    }));
    const r = await e.run();
    expect(r.selected).toBe(1);
    expect(r.trackedAfterExpiry).toBe(1);
    expect(r.skipped.captured_recently).toBe(349);
    expect(e.totalCalls()).toBe(1);
    expect(e.calls.get(itemOf(349))).toBe(1);
    expect(r.coverage).toMatchObject({ eligibleProducts: 350, observedWithin48h: 350, coverage48h: 1, neverObserved: 1 });
  });

  it('respeta la ventana de 45 días y el estado de la oferta en el propio recorrido', async () => {
    const e = env([
      offer({ i: 0, expiresDaysAgo: 44 }),
      offer({ i: 1, expiresDaysAgo: 46 }),
      { ...offer({ i: 2 }), status: 'rejected' },
      { ...offer({ i: 3 }), deleted_at: new Date(START).toISOString() },
      offer({ i: 4, title: 'Audífonos bluetooth' }),
    ]);
    const r = await e.run();
    expect(r.coverage).toMatchObject({ scannedOffers: 2, eligibleProducts: 1 });
    expect(r.skipped.not_despensa).toBe(1);
    expect([...e.calls.keys()]).toEqual([itemOf(0)]);
  });
});

describe('captura: prioridad y continuidad entre corridas', () => {
  it('rota sin inanición: 100 productos con cupo de 10 se cubren en 10 días y el ciclo vuelve a empezar por el más antiguo', async () => {
    const e = env(Array.from({ length: 100 }, (_, i) => offer({ i })));
    const byRun: Set<string>[] = [];
    for (let d = 0; d < 11; d += 1) {
      const before = new Set(captures(e).map((r) => r.id));
      await e.run({ maxPerSource: { mercadolibre_mx: 10 } });
      byRun.push(new Set(captures(e).filter((r) => !before.has(r.id)).map((r) => String(r.external_item_id))));
      e.advance(DAY);
    }
    expect(byRun.slice(0, 10).every((s) => s.size === 10)).toBe(true);
    const counts = new Map<string, number>();
    for (const s of byRun.slice(0, 10)) for (const x of s) counts.set(x, (counts.get(x) ?? 0) + 1);
    expect(counts.size).toBe(100);
    expect([...counts.values()].every((n) => n === 1)).toBe(true);
    // Día 11: los más atrasados son los del día 1.
    expect(byRun[10]).toEqual(byRun[0]);
  });

  it('un producto con historial incompleto va antes que uno con historial suficiente e igual antigüedad', async () => {
    const e = env([offer({ i: 0 }), offer({ i: 1 })]);
    const seed = (i: number, daysAgo: number) => ({
      id: `s${i}-${daysAgo}`,
      offer_id: offerId(i),
      source: 'capture',
      source_id: 'mercadolibre_mx',
      external_item_id: itemOf(i),
      recorded_at: new Date(START - daysAgo * DAY).toISOString(),
      validation_status: 'valid',
      availability: 'in_stock',
      price: 34,
    });
    // Ambos observados por última vez hace 2 días; el 0 tiene 6 días válidos en 20 días, el 1 solo uno.
    e.db.tables.offer_price_snapshots = [...[2, 5, 9, 13, 17, 22].map((d) => seed(0, d)), seed(1, 2)];
    const r = await e.run({ maxPerSource: { mercadolibre_mx: 1 } });
    expect(r.selected).toBe(1);
    expect([...e.calls.keys()]).toEqual([itemOf(1)]);
    expect(r.coverage).toMatchObject({ needingHistory: 1, neverObserved: 0, oldestObservationHours: 48 });
    expect(r.events).toContainEqual(expect.objectContaining({ reason: 'over_source_cap', staleHours: 48 }));
  });

  it('dos corridas simultáneas con el lock caído: misma selección, sin duplicados', async () => {
    const e = env(Array.from({ length: 120 }, (_, i) => offer({ i })));
    e.db.failOn.ingest_cycle_locks = { op: 'insert', error: { code: '08006', message: 'connection failure' } };
    const [a, b] = await Promise.all([e.run(), e.run()]);
    expect(a.status).toBe('completed');
    expect(b.status).toBe('completed');
    expect(captures(e)).toHaveLength(40);
    expect(new Set(captures(e).map((r) => r.idempotency_key)).size).toBe(40);
    expect(a.inserted.valid + b.inserted.valid).toBe(40);
    expect((a.skipped.duplicate_idempotent ?? 0) + (b.skipped.duplicate_idempotent ?? 0) + (a.skipped.captured_recently ?? 0) + (b.skipped.captured_recently ?? 0)).toBeGreaterThanOrEqual(40);

    // Con el lock sano, la segunda queda fuera.
    const f = env(Array.from({ length: 50 }, (_, i) => offer({ i })));
    const [c, d] = await Promise.all([f.run(), f.run()]);
    expect([c.status, d.status].sort()).toEqual(['completed', 'skipped_concurrent']);
  });
});

describe('captura: cuotas, fallas y recuperación', () => {
  it('fuente caída: no se pierde ningún producto; al día siguiente los fallidos siguen al frente', async () => {
    let down = true;
    const e = env(Array.from({ length: 60 }, (_, i) => offer({ i })), { failing: () => (down ? 500 : null) });
    const first = await e.run();
    expect(first.inserted.valid).toBe(0);
    expect(first.skipped.source_error).toBe(3);
    expect(first.skipped.source_circuit_open).toBe(37);
    expect(first.coverage?.deferredByQuota).toBe(20);
    const attempted = [...e.calls.keys()];

    down = false;
    e.advance(DAY);
    const second = await e.run();
    expect(second.inserted.valid).toBe(40);
    for (const item of attempted) expect(capturedItems(e).has(item)).toBe(true);
    e.advance(DAY);
    await e.run();
    expect(capturedItems(e).size).toBe(60);
  });

  it('productos que fallan siempre (404) no dejan sin captura al resto', async () => {
    const dead = new Set(Array.from({ length: 15 }, (_, i) => itemOf(i)));
    const e = env(Array.from({ length: 50 }, (_, i) => offer({ i })), { failing: (item) => (dead.has(item) ? 404 : null) });
    let notFound = 0;
    let lastCov: PriceCaptureReport['coverage'] = null;
    for (let d = 0; d < 30; d += 1) {
      const r = await e.run({ maxPerSource: { mercadolibre_mx: 10 } });
      notFound += r.skipped.item_not_found ?? 0;
      lastCov = r.coverage;
      e.advance(DAY);
    }
    const perItem = new Map<string, number>();
    for (const r of captures(e)) perItem.set(String(r.external_item_id), (perItem.get(String(r.external_item_id)) ?? 0) + 1);
    // Los 35 sanos se capturan varias veces en 30 días; los 15 muertos nunca, y cada intento queda registrado.
    expect(perItem.size).toBe(35);
    expect(Math.min(...perItem.values())).toBeGreaterThanOrEqual(4);
    expect([...dead].some((x) => perItem.has(x))).toBe(false);
    // Cota: el primer ciclo (6 días) sin distinguir muertos de nuevos; después, solo la reserva del 25 %.
    const cycleDays = lastCov!.cycleHours! / 24;
    expect(cycleDays).toBe(6);
    expect(lastCov).toMatchObject({ overdueProducts: 15, neverObserved: 15 });
    expect(notFound).toBeGreaterThan(0);
    expect(notFound).toBeLessThanOrEqual(cycleDays * 10 + (30 - cycleDays) * Math.ceil(10 * 0.25));
  });

  it('429: corta la corrida; los productos no intentados quedan para la siguiente', async () => {
    let limited = true;
    const e = env(Array.from({ length: 10 }, (_, i) => offer({ i })), { failing: () => (limited ? 429 : null) });
    const r = await e.run();
    expect(r.skipped.source_rate_limited).toBe(1);
    expect(r.skipped.source_circuit_open).toBe(9);
    expect(e.totalCalls()).toBe(1);
    limited = false;
    e.advance(DAY);
    expect((await e.run()).inserted.valid).toBe(10);
  });

  it('sin la función de estadísticas: cae a la consulta de recientes y no afirma lo que no sabe', async () => {
    const e = env(Array.from({ length: 5 }, (_, i) => offer({ i })), { rpc: 'missing' });
    const r = await e.run();
    expect(r.inserted.valid).toBe(5);
    expect(r.coverage).toMatchObject({ statsSource: 'fallback', neverObserved: null, needingHistory: null });
    e.advance(2 * HOUR);
    const again = await e.run();
    expect(again.skipped.captured_recently).toBe(5);
    expect(e.totalCalls()).toBe(5);
  });

  it('si las estadísticas fallan (no por ausencia), no captura a ciegas', async () => {
    const e = env(Array.from({ length: 5 }, (_, i) => offer({ i })), { rpc: 'error' });
    const r = await e.run();
    expect(r.skipped.recent_capture_check_failed).toBe(5);
    expect(r.coverage?.statsSource).toBe('unavailable');
    expect(e.totalCalls()).toBe(0);
    expect(captures(e)).toHaveLength(0);
  });

  it('si el recorrido falla, la corrida falla sin escribir observaciones', async () => {
    const e = env([offer({ i: 0 })]);
    e.db.failOn.offers = { op: 'select', error: { code: '57014', message: 'timeout' } };
    const r = await e.run();
    expect(r).toMatchObject({ status: 'failed', detail: 'candidate_query_failed' });
    expect(captures(e)).toHaveLength(0);
  });
});

describe('captura: presupuesto de recorrido y contabilidad', () => {
  it('paginación por id: sin duplicados ni huecos con páginas pequeñas y vuelta al inicio', async () => {
    const offers = Array.from({ length: 350 }, (_, i) => offer({ i }));
    const db = createMemoryDb({ tables: { offers } });
    const scan = await scanCandidatePool(memorySupabase(db), { sources: ['mercadolibre_mx'], nowMs: START, budget: 10_000, pageSize: 50 });
    expect(scan.complete).toBe(true);
    expect(scan.failed).toBe(false);
    expect(scan.rows).toHaveLength(350);
    expect(new Set(scan.rows.map((r) => r.id)).size).toBe(350);
    expect(scan.pages).toBeGreaterThanOrEqual(8);
    expect(scan.startKey).toBe(scanStartKey(START));
    expect(scanStartKey(START + DAY)).not.toBe(scan.startKey);
  });

  it('presupuesto menor que el universo: lo declara incompleto y la rotación diaria alcanza a todos', async () => {
    const e = env(Array.from({ length: 350 }, (_, i) => offer({ i })));
    const first = await e.run({ candidatePool: 120 });
    expect(first.coverage).toMatchObject({ scannedOffers: 120, scanComplete: false });
    for (let d = 1; d < 25; d += 1) {
      e.advance(DAY);
      const r = await e.run({ candidatePool: 120 });
      expect(r.coverage?.scanComplete).toBe(false);
    }
    expect(capturedItems(e).size).toBe(350);
  });

  it('cada oferta leída y cada producto elegible quedan contabilizados (sin pérdidas silenciosas)', async () => {
    const offers = [
      ...Array.from({ length: 30 }, (_, i) => offer({ i })),
      offer({ i: 30, item: 0 }),
      offer({ i: 31, item: 1, expiresDaysAgo: 2 }),
      offer({ i: 32, title: 'Audífonos bluetooth' }),
      { ...offer({ i: 33 }), price: 0 },
      { ...offer({ i: 34 }), source_currency: 'USD' },
    ];
    const e = env(offers);
    const r = await e.run({ maxPerSource: { mercadolibre_mx: 7 } });
    expect(r.pool).toBe(35);
    expect(accountedOffers(r)).toBe(35);
    expect(r.coverage?.eligibleProducts).toBe(30);
    expect(accountedProducts(r)).toBe(30);
    expect(r.skipped.same_product_other_offer).toBe(2);
  });
});
