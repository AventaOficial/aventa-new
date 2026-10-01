/**
 * Near-ready sticky selection — prioritize products that need one more distinct day
 * to satisfy ML_PRICE_MIN_HISTORY_DAYS without lowering the DQE contract.
 *
 * Distinct from history-ready sticky (stickySku.ts), which only re-observes ready SKUs.
 */

import { createServerClient } from '@/lib/supabase/server';
import {
  ML_PRICE_MARKETPLACE,
  ML_PRICE_MIN_HISTORY_DAYS,
  ML_PRICE_TZ,
} from '@/lib/bots/ingest/mlPriceEngine';
import { formatYmdInTz } from '@/lib/bots/ingest/ingestZonedTime';
import { allocateNearReadyBudget } from '@/lib/hunter/discovery/verifiedYieldFunnel';

export type NearReadyStickyTarget = {
  productId: string;
  priorDays: number;
  daysUntilReady: number;
  lastObservedOn: string;
  lastPrice: number | null;
  hoursSinceObserved: number;
  marketplace: typeof ML_PRICE_MARKETPLACE;
};

export type NearReadyStickyConfig = {
  /** Must equal ML_PRICE_MIN_HISTORY_DAYS — never lowered here. */
  minHistoryDays: number;
  cooldownHours: number;
  maxTargets: number;
  historyWindowDays: number;
};

export type NearReadyStickyReport = {
  targets: NearReadyStickyTarget[];
  poolNearReady: number;
  poolOneDayAway: number;
  poolTwoDaysAway: number;
  poolThreeDaysAway: number;
  budgetAllocation: { one: number; two: number; threePlus: number };
  cooldownSkipped: number;
  alreadyReadySkipped: number;
  observedTodaySkipped: number;
  budgetLimited: number;
  todayYmd: string;
};

export const DEFAULT_NEAR_READY_STICKY_CONFIG: NearReadyStickyConfig = {
  minHistoryDays: ML_PRICE_MIN_HISTORY_DAYS,
  cooldownHours: Number.parseInt(process.env.SUPPLY_STICKY_COOLDOWN_HOURS ?? '20', 10) || 20,
  maxTargets: Number.parseInt(process.env.SUPPLY_NEAR_READY_MAX ?? '24', 10) || 24,
  historyWindowDays: 89,
};

function daysAgoYmd(fromYmd: string, days: number): string {
  const [y, m, d] = fromYmd.split('-').map((x) => Number.parseInt(x, 10));
  const utc = Date.UTC(y, m - 1, d - days);
  const dt = new Date(utc);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function hoursBetween(fromIsoOrYmd: string, now: Date): number {
  const t = Date.parse(
    fromIsoOrYmd.length <= 10 ? `${fromIsoOrYmd}T12:00:00.000Z` : fromIsoOrYmd,
  );
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return (now.getTime() - t) / 3_600_000;
}

/**
 * Pure ranking: closest to ready first, then oldest observation, then id.
 */
export function rankNearReadyTargets(
  targets: NearReadyStickyTarget[],
): NearReadyStickyTarget[] {
  return [...targets].sort(
    (a, b) =>
      a.daysUntilReady - b.daysUntilReady ||
      b.hoursSinceObserved - a.hoursSinceObserved ||
      a.productId.localeCompare(b.productId),
  );
}

export function pickNearReadyTargets(
  ranked: NearReadyStickyTarget[],
  maxTargets: number,
): { picked: NearReadyStickyTarget[]; budgetLimited: number } {
  const limit = Math.max(0, Math.floor(maxTargets));
  const picked = ranked.slice(0, limit);
  const budgetLimited = Math.max(0, ranked.length - picked.length);
  return { picked, budgetLimited };
}

/**
 * Select products with 1..(minHistoryDays-1) prior distinct days (excluding today).
 * One-day-away (priorDays === minHistoryDays - 1) sorts first.
 */
export async function selectNearReadyStickyTargets(opts?: {
  supabase?: ReturnType<typeof createServerClient> | null;
  config?: Partial<NearReadyStickyConfig>;
  now?: Date;
}): Promise<NearReadyStickyReport> {
  const cfg: NearReadyStickyConfig = {
    ...DEFAULT_NEAR_READY_STICKY_CONFIG,
    ...opts?.config,
    minHistoryDays: ML_PRICE_MIN_HISTORY_DAYS,
  };
  const now = opts?.now ?? new Date();
  const todayYmd = formatYmdInTz(now, ML_PRICE_TZ);
  const sinceYmd = daysAgoYmd(todayYmd, cfg.historyWindowDays);

  const empty: NearReadyStickyReport = {
    targets: [],
    poolNearReady: 0,
    poolOneDayAway: 0,
    poolTwoDaysAway: 0,
    poolThreeDaysAway: 0,
    budgetAllocation: { one: 0, two: 0, threePlus: 0 },
    cooldownSkipped: 0,
    alreadyReadySkipped: 0,
    observedTodaySkipped: 0,
    budgetLimited: 0,
    todayYmd,
  };

  let client = opts?.supabase ?? null;
  if (!client) {
    try {
      client = createServerClient();
    } catch {
      return empty;
    }
  }

  const { data, error } = await client
    .from('product_price_snapshots')
    .select('product_id, recorded_on, last_price, recorded_at')
    .eq('marketplace', ML_PRICE_MARKETPLACE)
    .gte('recorded_on', sinceYmd)
    .lt('recorded_on', todayYmd)
    .order('recorded_on', { ascending: false })
    .limit(8000);

  if (error || !data) return empty;

  type Agg = {
    days: Set<string>;
    lastOn: string;
    lastAt: string | null;
    lastPrice: number | null;
  };
  const byId = new Map<string, Agg>();

  for (const row of data) {
    const id = String((row as { product_id: string }).product_id);
    const on = String((row as { recorded_on: string }).recorded_on).slice(0, 10);
    const at =
      (row as { recorded_at?: string | null }).recorded_at != null
        ? String((row as { recorded_at: string }).recorded_at)
        : null;
    const price = Number((row as { last_price?: number }).last_price);
    const agg = byId.get(id) ?? {
      days: new Set<string>(),
      lastOn: on,
      lastAt: at,
      lastPrice: Number.isFinite(price) ? price : null,
    };
    agg.days.add(on);
    if (on > agg.lastOn || (on === agg.lastOn && at && (!agg.lastAt || at > agg.lastAt))) {
      agg.lastOn = on;
      agg.lastAt = at;
      if (Number.isFinite(price)) agg.lastPrice = price;
    }
    byId.set(id, agg);
  }

  const { data: todayRows } = await client
    .from('product_price_snapshots')
    .select('product_id')
    .eq('marketplace', ML_PRICE_MARKETPLACE)
    .eq('recorded_on', todayYmd)
    .limit(8000);
  const observedToday = new Set(
    (todayRows ?? []).map((r) => String((r as { product_id: string }).product_id)),
  );

  let cooldownSkipped = 0;
  let alreadyReadySkipped = 0;
  let observedTodaySkipped = 0;
  const eligible: NearReadyStickyTarget[] = [];

  for (const [productId, agg] of byId) {
    const priorDays = agg.days.size;
    if (priorDays >= cfg.minHistoryDays) {
      alreadyReadySkipped += 1;
      continue;
    }
    if (priorDays < 1) continue;
    if (observedToday.has(productId)) {
      observedTodaySkipped += 1;
      continue;
    }
    const hours = hoursBetween(agg.lastAt ?? agg.lastOn, now);
    if (hours < cfg.cooldownHours) {
      cooldownSkipped += 1;
      continue;
    }
    eligible.push({
      productId,
      priorDays,
      daysUntilReady: cfg.minHistoryDays - priorDays,
      lastObservedOn: agg.lastOn,
      lastPrice: agg.lastPrice,
      hoursSinceObserved: Math.round(hours * 10) / 10,
      marketplace: ML_PRICE_MARKETPLACE,
    });
  }

  const ranked = rankNearReadyTargets(eligible);
  const oneDayAway = ranked.filter((t) => t.daysUntilReady === 1);
  const twoDaysAway = ranked.filter((t) => t.daysUntilReady === 2);
  const threePlusDaysAway = ranked.filter((t) => t.daysUntilReady >= 3);

  const { pickedIds, allocation } = allocateNearReadyBudget({
    oneDayAway,
    twoDaysAway,
    threePlusDaysAway,
    maxTargets: cfg.maxTargets,
  });

  const byProductId = new Map(ranked.map((t) => [t.productId, t]));
  const picked = pickedIds
    .map((id) => byProductId.get(id))
    .filter((t): t is NearReadyStickyTarget => Boolean(t));
  const budgetLimited = Math.max(0, eligible.length - picked.length);

  return {
    targets: picked,
    poolNearReady: eligible.length,
    poolOneDayAway: oneDayAway.length,
    poolTwoDaysAway: twoDaysAway.length,
    poolThreeDaysAway: threePlusDaysAway.length,
    budgetAllocation: allocation,
    cooldownSkipped,
    alreadyReadySkipped,
    observedTodaySkipped,
    budgetLimited,
    todayYmd,
  };
}
