/**
 * Salud de Price Memory (product_price_snapshots). Solo lectura.
 */
import { createServerClient } from '@/lib/supabase/server';
import { ML_PRICE_MARKETPLACE, ML_PRICE_MIN_HISTORY_DAYS } from '@/lib/bots/ingest/mlPriceEngine';
import { formatYmdInTz } from '@/lib/bots/ingest/ingestZonedTime';

export type PriceMemoryHealthSnapshot = {
  ok: boolean;
  marketplace: string;
  minHistoryDays: number;
  todayYmd: string;
  totalRows: number | null;
  rowsToday: number | null;
  distinctProducts7d: number | null;
  productsWith2PlusDays7d: number | null;
  /** Productos con ≥ minHistoryDays en ventana 7d → elegibles historyReady. */
  productsHistoryReadyEligible7d: number | null;
  error: string | null;
};

export async function getPriceMemoryHealth(
  supabase?: ReturnType<typeof createServerClient> | null,
): Promise<PriceMemoryHealthSnapshot> {
  const todayYmd = formatYmdInTz(new Date(), 'America/Mexico_City');
  const empty = (error: string | null): PriceMemoryHealthSnapshot => ({
    ok: false,
    marketplace: ML_PRICE_MARKETPLACE,
    minHistoryDays: ML_PRICE_MIN_HISTORY_DAYS,
    todayYmd,
    totalRows: null,
    rowsToday: null,
    distinctProducts7d: null,
    productsWith2PlusDays7d: null,
    productsHistoryReadyEligible7d: null,
    error,
  });

  let client = supabase ?? null;
  if (!client) {
    try {
      client = createServerClient();
    } catch (e) {
      return empty(e instanceof Error ? e.message : 'no_supabase');
    }
  }

  const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [totalRes, todayRes, windowRes] = await Promise.all([
    client
      .from('product_price_snapshots')
      .select('*', { count: 'exact', head: true })
      .eq('marketplace', ML_PRICE_MARKETPLACE),
    client
      .from('product_price_snapshots')
      .select('*', { count: 'exact', head: true })
      .eq('marketplace', ML_PRICE_MARKETPLACE)
      .eq('recorded_on', todayYmd),
    client
      .from('product_price_snapshots')
      .select('product_id, recorded_on')
      .eq('marketplace', ML_PRICE_MARKETPLACE)
      .gte('recorded_on', since7)
      .limit(5000),
  ]);

  if (totalRes.error || todayRes.error || windowRes.error) {
    return empty(
      totalRes.error?.message ?? todayRes.error?.message ?? windowRes.error?.message ?? 'query_failed',
    );
  }

  const daysByProduct = new Map<string, Set<string>>();
  for (const row of windowRes.data ?? []) {
    const id = String((row as { product_id: string }).product_id);
    const set = daysByProduct.get(id) ?? new Set<string>();
    set.add(String((row as { recorded_on: string }).recorded_on));
    daysByProduct.set(id, set);
  }

  let with2 = 0;
  let withReady = 0;
  for (const set of daysByProduct.values()) {
    if (set.size >= 2) with2 += 1;
    if (set.size >= ML_PRICE_MIN_HISTORY_DAYS) withReady += 1;
  }

  return {
    ok: true,
    marketplace: ML_PRICE_MARKETPLACE,
    minHistoryDays: ML_PRICE_MIN_HISTORY_DAYS,
    todayYmd,
    totalRows: totalRes.count ?? 0,
    rowsToday: todayRes.count ?? 0,
    distinctProducts7d: daysByProduct.size,
    productsWith2PlusDays7d: with2,
    productsHistoryReadyEligible7d: withReady,
    error: null,
  };
}

/** Objetivos diarios conservadores (config, no magia). */
export const SUPPLY_DAILY_TARGETS = {
  discovered: 80,
  verified: 50,
  highQuality: 12,
  approvalReady: 8,
  note: 'Conservadores vs capacidad de moderación humana. Ajustar con evidencia.',
} as const;
