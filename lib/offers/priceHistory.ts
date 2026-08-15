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

export async function buildOfferPriceInsight(
  supabase: SupabaseClient,
  args: { offerId: string; currentPrice: number; originalPrice?: number | null },
): Promise<PriceInsight> {
  const current = round2(args.currentPrice);
  const original =
    args.originalPrice != null && Number.isFinite(args.originalPrice)
      ? round2(args.originalPrice)
      : null;
  const labelDiscountPct =
    original != null && original > current && original > 0
      ? round2(((original - current) / original) * 100)
      : null;

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('offer_price_snapshots')
    .select('price, recorded_at')
    .eq('offer_id', args.offerId)
    .gte('recorded_at', since)
    .order('recorded_at', { ascending: false })
    .limit(120);

  if (error || !data?.length) {
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

  const prices = data
    .map((r) => Number((r as { price?: number }).price))
    .filter((n) => Number.isFinite(n) && n >= 0);
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
