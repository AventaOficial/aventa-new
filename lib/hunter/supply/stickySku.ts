/**
 * Sticky SKU selection from product_price_snapshots (no new table).
 * historyReady pool = ≥ minHistoryDays prior distinct days (excl. today).
 */

import { createServerClient } from '@/lib/supabase/server';
import {
  ML_PRICE_MARKETPLACE,
  ML_PRICE_MIN_HISTORY_DAYS,
  ML_PRICE_TZ,
} from '@/lib/bots/ingest/mlPriceEngine';
import { formatYmdInTz } from '@/lib/bots/ingest/ingestZonedTime';

export type StickySkuTarget = {
  productId: string;
  priorDays: number;
  lastObservedOn: string;
  lastPrice: number | null;
  listPrice: number | null;
  hoursSinceObserved: number;
};

export type StickySkuSelectConfig = {
  /** Mínimo de días previos distintos (excl. hoy). Default ML_PRICE_MIN_HISTORY_DAYS. */
  minHistoryDays: number;
  /** No re-observar si última observación fue hace menos de N horas. */
  cooldownHours: number;
  /** Tope por corrida. */
  maxTargets: number;
  /** Ventana de historial en días. */
  historyWindowDays: number;
};

export const DEFAULT_STICKY_SKU_CONFIG: StickySkuSelectConfig = {
  minHistoryDays: ML_PRICE_MIN_HISTORY_DAYS,
  /** Default: 1 observación/día efectiva (alineado a unique(recorded_on)). */
  cooldownHours: Number.parseInt(process.env.SUPPLY_STICKY_COOLDOWN_HOURS ?? '20', 10) || 20,
  maxTargets: Number.parseInt(process.env.SUPPLY_STICKY_MAX_PER_WAVE ?? '12', 10) || 12,
  historyWindowDays: 89,
};

function daysAgoYmd(fromYmd: string, days: number): string {
  const [y, m, d] = fromYmd.split('-').map((x) => Number.parseInt(x, 10));
  const utc = Date.UTC(y, m - 1, d - days);
  const dt = new Date(utc);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function hoursBetween(fromIsoOrYmd: string, now: Date): number {
  const t = Date.parse(fromIsoOrYmd.length <= 10 ? `${fromIsoOrYmd}T12:00:00.000Z` : fromIsoOrYmd);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return (now.getTime() - t) / 3_600_000;
}

/**
 * Selecciona SKUs history-ready no observados recientemente.
 * Fail-closed: sin supabase → [].
 */
export async function selectStickySkuTargets(
  opts: {
    supabase?: ReturnType<typeof createServerClient> | null;
    config?: Partial<StickySkuSelectConfig>;
    now?: Date;
    /** Filtra product_id por prefijo de nicho (opcional; vacío = todos). */
    productIdAllowlist?: Set<string> | null;
  } = {},
): Promise<StickySkuTarget[]> {
  const cfg: StickySkuSelectConfig = { ...DEFAULT_STICKY_SKU_CONFIG, ...opts.config };
  const now = opts.now ?? new Date();
  const todayYmd = formatYmdInTz(now, ML_PRICE_TZ);
  const sinceYmd = daysAgoYmd(todayYmd, cfg.historyWindowDays);

  let client = opts.supabase ?? null;
  if (!client) {
    try {
      client = createServerClient();
    } catch {
      return [];
    }
  }

  const { data, error } = await client
    .from('product_price_snapshots')
    .select('product_id, recorded_on, last_price, list_price, recorded_at')
    .eq('marketplace', ML_PRICE_MARKETPLACE)
    .gte('recorded_on', sinceYmd)
    .lt('recorded_on', todayYmd)
    .order('recorded_on', { ascending: false })
    .limit(5000);

  if (error || !data) return [];

  type Agg = {
    days: Set<string>;
    lastOn: string;
    lastAt: string | null;
    lastPrice: number | null;
    listPrice: number | null;
  };
  const byId = new Map<string, Agg>();

  for (const row of data) {
    const id = String((row as { product_id: string }).product_id);
    if (opts.productIdAllowlist && !opts.productIdAllowlist.has(id)) continue;
    const on = String((row as { recorded_on: string }).recorded_on).slice(0, 10);
    const at =
      (row as { recorded_at?: string | null }).recorded_at != null
        ? String((row as { recorded_at: string }).recorded_at)
        : null;
    const price = Number((row as { last_price?: number }).last_price);
    const list =
      (row as { list_price?: number | null }).list_price != null
        ? Number((row as { list_price: number }).list_price)
        : null;
    const agg = byId.get(id) ?? {
      days: new Set<string>(),
      lastOn: on,
      lastAt: at,
      lastPrice: Number.isFinite(price) ? price : null,
      listPrice: list != null && Number.isFinite(list) ? list : null,
    };
    agg.days.add(on);
    if (on > agg.lastOn || (on === agg.lastOn && at && (!agg.lastAt || at > agg.lastAt))) {
      agg.lastOn = on;
      agg.lastAt = at;
      if (Number.isFinite(price)) agg.lastPrice = price;
      if (list != null && Number.isFinite(list)) agg.listPrice = list;
    }
    byId.set(id, agg);
  }

  // También excluir si ya hay fila de hoy (unique day).
  const { data: todayRows } = await client
    .from('product_price_snapshots')
    .select('product_id')
    .eq('marketplace', ML_PRICE_MARKETPLACE)
    .eq('recorded_on', todayYmd)
    .limit(5000);
  const observedToday = new Set((todayRows ?? []).map((r) => String((r as { product_id: string }).product_id)));

  const out: StickySkuTarget[] = [];
  for (const [productId, agg] of byId) {
    if (agg.days.size < cfg.minHistoryDays) continue;
    if (observedToday.has(productId)) continue;
    const hours = hoursBetween(agg.lastAt ?? agg.lastOn, now);
    if (hours < cfg.cooldownHours) continue;
    out.push({
      productId,
      priorDays: agg.days.size,
      lastObservedOn: agg.lastOn,
      lastPrice: agg.lastPrice,
      listPrice: agg.listPrice,
      hoursSinceObserved: Math.round(hours * 10) / 10,
    });
  }

  out.sort((a, b) => {
    // Prefer potential price-drop signal (last < list) without inventing lows.
    const aDrop =
      a.lastPrice != null && a.listPrice != null && a.listPrice > a.lastPrice
        ? (a.listPrice - a.lastPrice) / a.listPrice
        : 0;
    const bDrop =
      b.lastPrice != null && b.listPrice != null && b.listPrice > b.lastPrice
        ? (b.listPrice - b.lastPrice) / b.listPrice
        : 0;
    return (
      b.priorDays - a.priorDays ||
      bDrop - aDrop ||
      b.hoursSinceObserved - a.hoursSinceObserved ||
      a.productId.localeCompare(b.productId)
    );
  });

  // Diversidad: rotar por día UTC para no re-observar siempre el mismo top-N.
  const cap = Math.max(0, cfg.maxTargets);
  if (out.length <= cap) return out;
  const dayIndex = Math.floor(now.getTime() / 86_400_000);
  const start = dayIndex % out.length;
  const rotated = [...out.slice(start), ...out.slice(0, start)];
  return rotated.slice(0, cap);
}

/** Pura: aplica cooldown sobre lista ya agregada (tests). */
export function filterStickyByCooldown(
  targets: Array<{ productId: string; hoursSinceObserved: number }>,
  cooldownHours: number,
): typeof targets {
  return targets.filter((t) => t.hoursSinceObserved >= cooldownHours);
}
