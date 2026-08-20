import { createServerClient } from '@/lib/supabase/server';
import { extractMercadoLibreItemId } from '@/lib/offers/offerUrlFingerprint';
import { formatYmdInTz } from './ingestZonedTime';
import { fetchMlItemPriceQuote, type MlPriceQuote } from './mlPricesApi';

export const ML_PRICE_MARKETPLACE = 'mercadolibre';
export const ML_PRICE_TZ = 'America/Mexico_City';
export const ML_PRICE_MIN_HISTORY_DAYS = 4;

export type MlDailySnapshot = {
  recordedOn: string;
  lastPrice: number;
  minPrice: number;
  listPrice: number | null;
  regularPrice: number | null;
};

export type MlPriceIntel = {
  lowest30d: number | null;
  lowest90d: number | null;
  habitual30d: number | null;
  current: number;
  listPrice: number | null;
  regularPrice: number | null;
  priceVsLowest90dPct: number | null;
  savingsVsHabitualPct: number | null;
  effectiveDiscountPercent: number | null;
  suspectedArtificialListPrice: boolean;
  samples90d: number;
  historyReady: boolean;
};

export type MlPriceObservation = {
  productId: string;
  current: number;
  listPrice: number | null;
  regularPrice: number | null;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return round2((sorted[mid - 1]! + sorted[mid]!) / 2);
  }
  return round2(sorted[mid]!);
}

function daysAgoYmd(fromYmd: string, days: number): string {
  const [y, m, d] = fromYmd.split('-').map((x) => Number.parseInt(x, 10));
  const utc = Date.UTC(y, m - 1, d - days);
  const dt = new Date(utc);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function inRange(recordedOn: string, fromInclusive: string, toInclusive: string): boolean {
  return recordedOn >= fromInclusive && recordedOn <= toInclusive;
}

export function normalizeMlProductId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    return extractMercadoLibreItemId(trimmed);
  }
  const compact = trimmed.replace(/-/g, '').toUpperCase();
  return /^ML[A-Z]{0,3}\d{6,}$/.test(compact) ? compact : extractMercadoLibreItemId(trimmed);
}

/**
 * Historial propio vs etiqueta. Sin suficientes días no finge un mínimo histórico.
 */
export function computeMlPriceIntel(
  observation: Omit<MlPriceObservation, 'productId'>,
  history: MlDailySnapshot[],
  todayYmd: string
): MlPriceIntel {
  const current = round2(observation.current);
  const listPrice =
    observation.listPrice != null && Number.isFinite(observation.listPrice)
      ? round2(observation.listPrice)
      : null;
  const regularPrice =
    observation.regularPrice != null && Number.isFinite(observation.regularPrice)
      ? round2(observation.regularPrice)
      : null;

  const merged = new Map<string, MlDailySnapshot>();
  for (const row of history) {
    merged.set(row.recordedOn, row);
  }
  const todayExisting = merged.get(todayYmd);
  merged.set(todayYmd, {
    recordedOn: todayYmd,
    lastPrice: current,
    minPrice: todayExisting ? Math.min(todayExisting.minPrice, current) : current,
    listPrice: listPrice ?? todayExisting?.listPrice ?? null,
    regularPrice: regularPrice ?? todayExisting?.regularPrice ?? null,
  });

  const from90 = daysAgoYmd(todayYmd, 89);
  const from30 = daysAgoYmd(todayYmd, 29);
  const window90 = [...merged.values()].filter((r) => inRange(r.recordedOn, from90, todayYmd));
  const exclToday = window90.filter((r) => r.recordedOn !== todayYmd);
  const historyReady = exclToday.length >= ML_PRICE_MIN_HISTORY_DAYS;

  const window30 = window90.filter((r) => inRange(r.recordedOn, from30, todayYmd));
  const habitualPool = exclToday
    .filter((r) => inRange(r.recordedOn, from30, todayYmd))
    .map((r) => r.lastPrice)
    .filter((n) => n > 0);

  const lowest90d = historyReady ? round2(Math.min(...window90.map((r) => r.minPrice))) : null;
  const lowest30d = historyReady ? round2(Math.min(...window30.map((r) => r.minPrice))) : null;
  const habitual30d = historyReady ? median(habitualPool) : null;

  const priceVsLowest90dPct =
    lowest90d != null && lowest90d > 0 ? round2(((current - lowest90d) / lowest90d) * 100) : null;
  const savingsVsHabitualPct =
    habitual30d != null && habitual30d > 0
      ? round2(((habitual30d - current) / habitual30d) * 100)
      : null;

  const extremeList = listPrice != null && listPrice >= current * 1.8;
  const listVsRegular =
    listPrice != null && regularPrice != null && listPrice >= regularPrice * 1.2 && listPrice >= current * 1.45;
  const listVsHabitual =
    listPrice != null &&
    habitual30d != null &&
    listPrice >= habitual30d * 1.35 &&
    listPrice >= current * 1.4;
  const suspectedArtificialListPrice = Boolean(listVsRegular || listVsHabitual || (!historyReady && extremeList));

  let effectiveDiscountPercent: number | null = null;
  if (savingsVsHabitualPct != null && savingsVsHabitualPct > 0) {
    effectiveDiscountPercent = Math.round(savingsVsHabitualPct);
  } else if (regularPrice != null && regularPrice > current) {
    effectiveDiscountPercent = Math.round((1 - current / regularPrice) * 100);
  } else if (suspectedArtificialListPrice) {
    effectiveDiscountPercent = 0;
  }

  return {
    lowest30d,
    lowest90d,
    habitual30d,
    current,
    listPrice,
    regularPrice,
    priceVsLowest90dPct,
    savingsVsHabitualPct,
    effectiveDiscountPercent,
    suspectedArtificialListPrice,
    samples90d: window90.length,
    historyReady,
  };
}

export async function recordMlDailySnapshots(observations: MlPriceObservation[]): Promise<void> {
  const today = formatYmdInTz(new Date(), ML_PRICE_TZ);
  const unique = new Map<string, MlPriceObservation>();
  for (const obs of observations) {
    const id = normalizeMlProductId(obs.productId);
    if (!id || !Number.isFinite(obs.current) || obs.current < 0) continue;
    unique.set(id, {
      productId: id,
      current: round2(obs.current),
      listPrice:
        obs.listPrice != null && Number.isFinite(obs.listPrice) ? round2(obs.listPrice) : null,
      regularPrice:
        obs.regularPrice != null && Number.isFinite(obs.regularPrice) ? round2(obs.regularPrice) : null,
    });
  }
  if (unique.size === 0) return;

  let supabase;
  try {
    supabase = createServerClient();
  } catch {
    return;
  }

  const ids = [...unique.keys()];
  const { data: existing, error: readError } = await supabase
    .from('product_price_snapshots')
    .select('product_id, last_price, min_price, list_price, regular_price')
    .eq('marketplace', ML_PRICE_MARKETPLACE)
    .eq('recorded_on', today)
    .in('product_id', ids);

  if (readError) {
    console.error('[mlPriceEngine] read snapshots failed:', readError.message);
    return;
  }

  const prev = new Map(
    (existing ?? []).map((row) => [
      String((row as { product_id: string }).product_id),
      row as {
        last_price: number;
        min_price: number;
        list_price: number | null;
        regular_price: number | null;
      },
    ])
  );

  const rows = ids.map((id) => {
    const obs = unique.get(id)!;
    const before = prev.get(id);
    const minPrice = before ? Math.min(Number(before.min_price), obs.current) : obs.current;
    return {
      marketplace: ML_PRICE_MARKETPLACE,
      product_id: id,
      last_price: obs.current,
      min_price: minPrice,
      list_price: obs.listPrice ?? before?.list_price ?? null,
      regular_price: obs.regularPrice ?? before?.regular_price ?? null,
      currency: 'MXN',
      recorded_on: today,
      recorded_at: new Date().toISOString(),
    };
  });

  const { error } = await supabase.from('product_price_snapshots').upsert(rows, {
    onConflict: 'marketplace,product_id,recorded_on',
  });
  if (error) {
    console.error('[mlPriceEngine] upsert snapshots failed:', error.message);
  }
}

export async function loadMlDailyHistory(productId: string): Promise<MlDailySnapshot[]> {
  const id = normalizeMlProductId(productId);
  if (!id) return [];
  let supabase;
  try {
    supabase = createServerClient();
  } catch {
    return [];
  }
  const today = formatYmdInTz(new Date(), ML_PRICE_TZ);
  const from90 = daysAgoYmd(today, 89);
  const { data, error } = await supabase
    .from('product_price_snapshots')
    .select('recorded_on, last_price, min_price, list_price, regular_price')
    .eq('marketplace', ML_PRICE_MARKETPLACE)
    .eq('product_id', id)
    .gte('recorded_on', from90)
    .order('recorded_on', { ascending: false })
    .limit(90);

  if (error) {
    console.error('[mlPriceEngine] load history failed:', error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    recordedOn: String((row as { recorded_on: string }).recorded_on).slice(0, 10),
    lastPrice: Number((row as { last_price: number }).last_price),
    minPrice: Number((row as { min_price: number }).min_price),
    listPrice:
      (row as { list_price: number | null }).list_price != null
        ? Number((row as { list_price: number }).list_price)
        : null,
    regularPrice:
      (row as { regular_price: number | null }).regular_price != null
        ? Number((row as { regular_price: number }).regular_price)
        : null,
  }));
}

export async function enrichMercadoLibrePriceIntel(args: {
  url: string;
  itemId?: string | null;
  current: number;
  listPrice: number | null;
}): Promise<{ quote: MlPriceQuote; intel: MlPriceIntel } | null> {
  const productId = normalizeMlProductId(args.itemId) ?? normalizeMlProductId(args.url);
  if (!productId || !Number.isFinite(args.current) || args.current <= 0) return null;

  const quote = await fetchMlItemPriceQuote(productId, {
    current: args.current,
    listPrice: args.listPrice,
  });

  await recordMlDailySnapshots([
    {
      productId,
      current: quote.current,
      listPrice: quote.listPrice,
      regularPrice: quote.regularPrice,
    },
  ]);

  const history = await loadMlDailyHistory(productId);
  const today = formatYmdInTz(new Date(), ML_PRICE_TZ);
  const intel = computeMlPriceIntel(
    {
      current: quote.current,
      listPrice: quote.listPrice,
      regularPrice: quote.regularPrice,
    },
    history,
    today
  );
  return { quote, intel };
}
