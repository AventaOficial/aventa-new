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

/**
 * Historial propio de varias ofertas en una sola consulta. Las ofertas sin registros
 * (o si la consulta falla) quedan con veredicto `insufficient`; nunca se inventa historial.
 */
export async function buildOfferPriceInsights(
  supabase: SupabaseClient,
  offers: readonly { offerId: string; currentPrice: number; originalPrice?: number | null }[],
): Promise<Map<string, PriceInsight>> {
  const out = new Map<string, PriceInsight>();
  if (offers.length === 0) return out;
  const since = new Date(Date.now() - HISTORY_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from('offer_price_snapshots')
    .select('offer_id, price, recorded_at')
    .in(
      'offer_id',
      offers.map((o) => o.offerId),
    )
    .gte('recorded_at', since)
    .order('recorded_at', { ascending: false })
    .limit(offers.length * HISTORY_SAMPLES_PER_OFFER);
  const byOffer = new Map<string, number[]>();
  if (!error && data) {
    for (const row of data as { offer_id?: string; price?: number }[]) {
      if (!row.offer_id) continue;
      const list = byOffer.get(row.offer_id) ?? [];
      if (list.length < HISTORY_SAMPLES_PER_OFFER) list.push(Number(row.price));
      byOffer.set(row.offer_id, list);
    }
  }
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
