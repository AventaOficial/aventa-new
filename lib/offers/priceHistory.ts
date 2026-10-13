import type { SupabaseClient } from '@supabase/supabase-js';

export type PriceInsight = {
  current: number;
  originalPrice: number | null;
  labelDiscountPct: number | null;
  min90d: number | null;
  max90d: number | null;
  samples90d: number;
  vsMin90dPct: number | null;
  /** Descuento de etiqueta vs posible precio real observado en Aventa. */
  verdict: 'strong' | 'fair' | 'label_only' | 'insufficient';
  verdictLabel: string;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function recordOfferPriceSnapshot(
  supabase: SupabaseClient,
  args: {
    offerId: string;
    price: number;
    originalPrice?: number | null;
    source?: 'create' | 'update' | 'health' | 'manual' | 'app';
  },
): Promise<void> {
  if (!args.offerId || !Number.isFinite(args.price) || args.price < 0) return;
  const { error } = await supabase.from('offer_price_snapshots').insert({
    offer_id: args.offerId,
    price: round2(args.price),
    original_price:
      args.originalPrice != null && Number.isFinite(args.originalPrice)
        ? round2(args.originalPrice)
        : null,
    source: args.source ?? 'app',
  });
  if (error) {
    // Tabla puede no existir aún — no romper el flujo principal
    console.error('[priceHistory] snapshot failed:', error.message);
  }
}

const HISTORY_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const HISTORY_SAMPLES_PER_OFFER = 120;

export async function buildOfferPriceInsight(
  supabase: SupabaseClient,
  args: { offerId: string; currentPrice: number; originalPrice?: number | null },
): Promise<PriceInsight> {
  const since = new Date(Date.now() - HISTORY_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from('offer_price_snapshots')
    .select('price, recorded_at')
    .eq('offer_id', args.offerId)
    .gte('recorded_at', since)
    .order('recorded_at', { ascending: false })
    .limit(HISTORY_SAMPLES_PER_OFFER);

  const prices = error || !data ? [] : data.map((r) => Number((r as { price?: number }).price));
  return computePriceInsight(args.currentPrice, args.originalPrice ?? null, prices);
}

/** Ofertas por consulta: 8 × 120 registros queda por debajo del tope de filas de PostgREST (1000). */
const BATCH_OFFERS_PER_QUERY = 8;
/** Un registro de estas fuentes corrige el precio: lo anterior no sirve de referencia. */
const CORRECTION_SOURCES = new Set(['update', 'manual']);

type SnapshotRow = { offer_id?: string; price?: number; source?: string | null };

/**
 * Registros usables por oferta (de más nuevo a más viejo): se detiene en la última
 * corrección, que se conserva, para que un precio mal capturado no parezca un precio previo.
 */
export function snapshotPricesSinceLastCorrection(rows: readonly SnapshotRow[]): Map<string, number[]> {
  const byOffer = new Map<string, number[]>();
  const closed = new Set<string>();
  for (const row of rows) {
    const id = row.offer_id;
    if (!id || closed.has(id)) continue;
    const list = byOffer.get(id) ?? [];
    if (list.length >= HISTORY_SAMPLES_PER_OFFER) continue;
    list.push(Number(row.price));
    byOffer.set(id, list);
    if (row.source && CORRECTION_SOURCES.has(row.source)) closed.add(id);
  }
  return byOffer;
}

/**
 * Historial propio de varias ofertas con pocas consultas. Las ofertas sin registros quedan
 * `insufficient`. Si una consulta falla o llega recortada (el conteo supera las filas recibidas),
 * todas sus ofertas quedan sin historial: un historial parcial podría fabricar un mínimo falso.
 */
export async function buildOfferPriceInsights(
  supabase: SupabaseClient,
  offers: readonly { offerId: string; currentPrice: number; originalPrice?: number | null }[],
): Promise<Map<string, PriceInsight>> {
  const out = new Map<string, PriceInsight>();
  if (offers.length === 0) return out;
  const since = new Date(Date.now() - HISTORY_WINDOW_MS).toISOString();
  const chunks: string[][] = [];
  for (let i = 0; i < offers.length; i += BATCH_OFFERS_PER_QUERY) {
    chunks.push(offers.slice(i, i + BATCH_OFFERS_PER_QUERY).map((o) => o.offerId));
  }
  const results = await Promise.all(
    chunks.map(async (ids) => {
      const { data, error, count } = await supabase
        .from('offer_price_snapshots')
        .select('offer_id, price, recorded_at, source', { count: 'exact' })
        .in('offer_id', ids)
        .gte('recorded_at', since)
        .order('recorded_at', { ascending: false })
        .limit(ids.length * HISTORY_SAMPLES_PER_OFFER);
      const rows = (data ?? []) as SnapshotRow[];
      const complete = !error && data != null && count != null && count <= rows.length;
      return complete ? rows : [];
    }),
  );
  const byOffer = snapshotPricesSinceLastCorrection(results.flat());
  for (const o of offers) {
    out.set(o.offerId, computePriceInsight(o.currentPrice, o.originalPrice ?? null, byOffer.get(o.offerId) ?? []));
  }
  return out;
}

/** Veredicto del historial propio (90 días) para un precio actual. Pura y determinista. */
export function computePriceInsight(
  currentPrice: number,
  originalPrice: number | null,
  observedPrices: readonly number[],
): PriceInsight {
  const current = round2(currentPrice);
  const original =
    originalPrice != null && Number.isFinite(originalPrice)
      ? round2(originalPrice)
      : null;
  const labelDiscountPct =
    original != null && original > current && original > 0
      ? round2(((original - current) / original) * 100)
      : null;

  const prices = observedPrices.filter((n) => Number.isFinite(n) && n >= 0);
  if (!prices.length) {
    return {
      current,
      originalPrice: original,
      labelDiscountPct,
      min90d: null,
      max90d: null,
      samples90d: 0,
      vsMin90dPct: null,
      verdict: 'insufficient',
      verdictLabel: 'Aún no hay historial suficiente en AVENTA para este producto.',
    };
  }

  const min90d = prices.length ? round2(Math.min(...prices)) : null;
  const max90d = prices.length ? round2(Math.max(...prices)) : null;
  const vsMin90dPct =
    min90d != null && min90d > 0 ? round2(((current - min90d) / min90d) * 100) : null;

  let verdict: PriceInsight['verdict'] = 'fair';
  let verdictLabel = 'Precio en línea con lo visto recientemente en AVENTA.';

  if (prices.length < 2) {
    verdict = 'insufficient';
    verdictLabel = 'Pocos registros todavía; el historial se irá llenando solo.';
  } else if (min90d != null && current <= min90d * 1.02) {
    verdict = 'strong';
    verdictLabel = 'Buen precio respecto a lo visto en AVENTA en ~90 días.';
  } else if (
    labelDiscountPct != null &&
    labelDiscountPct >= 20 &&
    min90d != null &&
    current > min90d * 1.08
  ) {
    verdict = 'label_only';
    verdictLabel =
      'El descuento de etiqueta se ve alto, pero el precio no está cerca del mínimo reciente en AVENTA.';
  }

  return {
    current,
    originalPrice: original,
    labelDiscountPct,
    min90d,
    max90d,
    samples90d: prices.length,
    vsMin90dPct,
    verdict,
    verdictLabel,
  };
}
