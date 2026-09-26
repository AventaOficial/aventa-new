/**
 * Day 11 — Re-acquire SKUs that already meet historyReady (≥4 distinct prior days).
 * Prefer approx-activated-today (crossed 3→4 with today's tip). Does not fabricate history.
 */

import { createServerClient } from '@/lib/supabase/server';
import {
  ML_PRICE_MARKETPLACE,
  ML_PRICE_MIN_HISTORY_DAYS,
  ML_PRICE_TZ,
} from '@/lib/bots/ingest/mlPriceEngine';
import { formatYmdInTz } from '@/lib/bots/ingest/ingestZonedTime';
import { isApproxActivatedToday } from './historyReadyActivation';

export type HistoryReadyReactivationTarget = {
  productId: string;
  priorDays: number;
  lastObservedOn: string;
  lastPrice: number | null;
  hoursSinceObserved: number;
  activatedToday: boolean;
};

export type HistoryReadyReactivationReport = {
  targets: HistoryReadyReactivationTarget[];
  poolHistoryReady: number;
  poolActivatedToday: number;
  cooldownSkipped: number;
  observedTodaySkipped: number;
  budgetLimited: number;
  todayYmd: string;
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

export async function selectHistoryReadyReactivationTargets(opts?: {
  maxTargets?: number;
  cooldownHours?: number;
  historyWindowDays?: number;
  now?: Date;
  supabase?: ReturnType<typeof createServerClient> | null;
}): Promise<HistoryReadyReactivationReport> {
  const now = opts?.now ?? new Date();
  const todayYmd = formatYmdInTz(now, ML_PRICE_TZ);
  const maxTargets = Math.max(1, opts?.maxTargets ?? 8);
  const cooldownHours = Math.max(0, opts?.cooldownHours ?? 1);
  const windowDays = opts?.historyWindowDays ?? 89;
  const sinceYmd = daysAgoYmd(todayYmd, windowDays);
  const min = ML_PRICE_MIN_HISTORY_DAYS;

  const empty: HistoryReadyReactivationReport = {
    targets: [],
    poolHistoryReady: 0,
    poolActivatedToday: 0,
    cooldownSkipped: 0,
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
    .order('recorded_on', { ascending: false })
    .limit(12000);

  if (error || !data) return empty;

  type Agg = {
    priorDays: Set<string>;
    hasToday: boolean;
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
      priorDays: new Set<string>(),
      hasToday: false,
      lastOn: on,
      lastAt: at,
      lastPrice: Number.isFinite(price) ? price : null,
    };
    if (on === todayYmd) {
      agg.hasToday = true;
    } else {
      agg.priorDays.add(on);
    }
    if (on > agg.lastOn || (on === agg.lastOn && at && (!agg.lastAt || at > agg.lastAt))) {
      agg.lastOn = on;
      agg.lastAt = at;
      if (Number.isFinite(price)) agg.lastPrice = price;
    }
    byId.set(id, agg);
  }

  let cooldownSkipped = 0;
  let observedTodaySkipped = 0;
  let poolHistoryReady = 0;
  let poolActivatedToday = 0;
  const eligible: HistoryReadyReactivationTarget[] = [];

  for (const [productId, agg] of byId) {
    const prior = agg.priorDays.size;
    if (prior < min) continue;
    poolHistoryReady += 1;
    const activatedToday = isApproxActivatedToday({
      distinctDaysBeforeToday: prior,
      observedToday: agg.hasToday,
      minHistoryDays: min,
    });
    if (activatedToday) poolActivatedToday += 1;

    // Prefer re-acquire when not yet observed today (new tip opportunity).
    if (agg.hasToday && !activatedToday) {
      observedTodaySkipped += 1;
      continue;
    }

    const hours = hoursBetween(agg.lastAt ?? agg.lastOn, now);
    if (hours < cooldownHours && !activatedToday) {
      cooldownSkipped += 1;
      continue;
    }

    eligible.push({
      productId,
      priorDays: prior,
      lastObservedOn: agg.lastOn,
      lastPrice: agg.lastPrice,
      hoursSinceObserved: hours,
      activatedToday,
    });
  }

  eligible.sort((a, b) => {
    if (a.activatedToday !== b.activatedToday) return a.activatedToday ? -1 : 1;
    if (b.priorDays !== a.priorDays) return b.priorDays - a.priorDays;
    return a.hoursSinceObserved - b.hoursSinceObserved;
  });

  const targets = eligible.slice(0, maxTargets);
  return {
    targets,
    poolHistoryReady,
    poolActivatedToday,
    cooldownSkipped,
    observedTodaySkipped,
    budgetLimited: Math.max(0, eligible.length - targets.length),
    todayYmd,
  };
}
