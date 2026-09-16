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
  /** Filas con niche_id no nulo (total). */
  snapshotsWithNiche: number | null;
  /** Filas con niche_id null (total). */
  snapshotsWithoutNiche: number | null;
  /** snapshotsWithNiche / totalRows * 100. */
  nicheCoverageRatePct: number | null;
  /** Distinct product_id con niche_id por nicho (pool sticky potencial). */
  stickyPoolEligibleByNiche: Record<string, number> | null;
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
    snapshotsWithNiche: null,
    snapshotsWithoutNiche: null,
    nicheCoverageRatePct: null,
    stickyPoolEligibleByNiche: null,
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

  const [totalRes, todayRes, windowRes, withNicheRes, withoutNicheRes, nichePoolRes] =
    await Promise.all([
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
      client
        .from('product_price_snapshots')
        .select('*', { count: 'exact', head: true })
        .eq('marketplace', ML_PRICE_MARKETPLACE)
        .not('niche_id', 'is', null),
      client
        .from('product_price_snapshots')
        .select('*', { count: 'exact', head: true })
        .eq('marketplace', ML_PRICE_MARKETPLACE)
        .is('niche_id', null),
      client
        .from('product_price_snapshots')
        .select('product_id, niche_id')
        .eq('marketplace', ML_PRICE_MARKETPLACE)
        .not('niche_id', 'is', null)
        .limit(8000),
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

  const snapshotsWithNiche = withNicheRes.count ?? 0;
  const snapshotsWithoutNiche = withoutNicheRes.count ?? 0;
  const totalRows = totalRes.count ?? 0;
  const nicheCoverageRatePct =
    totalRows > 0 ? Math.round((snapshotsWithNiche / totalRows) * 1000) / 10 : 0;

  const stickyPoolEligibleByNiche: Record<string, number> = {
    beauty: 0,
    electronics: 0,
    day_to_day: 0,
  };
  const seenByNiche = new Map<string, Set<string>>();
  for (const row of nichePoolRes.data ?? []) {
    const niche = String((row as { niche_id?: string | null }).niche_id ?? '').trim();
    const pid = String((row as { product_id: string }).product_id ?? '').trim();
    if (!niche || !pid || !(niche in stickyPoolEligibleByNiche)) continue;
    const set = seenByNiche.get(niche) ?? new Set<string>();
    set.add(pid);
    seenByNiche.set(niche, set);
  }
  for (const [niche, set] of seenByNiche) {
    stickyPoolEligibleByNiche[niche] = set.size;
  }

  return {
    ok: true,
    marketplace: ML_PRICE_MARKETPLACE,
    minHistoryDays: ML_PRICE_MIN_HISTORY_DAYS,
    todayYmd,
    totalRows,
    rowsToday: todayRes.count ?? 0,
    distinctProducts7d: daysByProduct.size,
    productsWith2PlusDays7d: with2,
    productsHistoryReadyEligible7d: withReady,
    snapshotsWithNiche,
    snapshotsWithoutNiche,
    nicheCoverageRatePct,
    stickyPoolEligibleByNiche,
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
