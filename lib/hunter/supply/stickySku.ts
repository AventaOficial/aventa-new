/**
 * Sticky SKU selection — niche-aware, budgeted, cooldown-aware.
 * Pool NUNCA es global: solo product_ids atribuibles al nicheId vía offers.category.
 */

import { createServerClient } from '@/lib/supabase/server';
import {
  ML_PRICE_MARKETPLACE,
  ML_PRICE_MIN_HISTORY_DAYS,
  ML_PRICE_TZ,
} from '@/lib/bots/ingest/mlPriceEngine';
import { formatYmdInTz } from '@/lib/bots/ingest/ingestZonedTime';
import { nicheProfileById } from './nicheProfiles';
import { loadStickyBudgetConfig, resolveStickyNicheBudget } from './stickyBudgets';
import { loadStickyProductAllowlistForNiche } from './stickyNicheAttribution';

export type StickySkuTarget = {
  productId: string;
  priorDays: number;
  lastObservedOn: string;
  lastPrice: number | null;
  listPrice: number | null;
  hoursSinceObserved: number;
  nicheId: string;
  store: string | null;
  category: string | null;
};

export type StickySkuSelectConfig = {
  minHistoryDays: number;
  cooldownHours: number;
  /** Tope efectivo (ya min(niche, global)). */
  maxTargets: number;
  historyWindowDays: number;
  maxPerStore: number;
};

export type StickySkuSelectReport = {
  nicheId: string;
  targets: StickySkuTarget[];
  stickySelected: number;
  allowlistSize: number;
  poolHistoryReady: number;
  cooldownSkipped: number;
  qualitySkipped: number;
  duplicateSkipped: number;
  budgetLimited: number;
  attributionReason: string | null;
  nicheBudget: number;
  globalBudget: number;
};

export const DEFAULT_STICKY_SKU_CONFIG: StickySkuSelectConfig = {
  minHistoryDays: ML_PRICE_MIN_HISTORY_DAYS,
  cooldownHours: Number.parseInt(process.env.SUPPLY_STICKY_COOLDOWN_HOURS ?? '20', 10) || 20,
  maxTargets: Number.parseInt(process.env.SUPPLY_STICKY_MAX_PER_WAVE ?? '8', 10) || 8,
  historyWindowDays: 89,
  maxPerStore: Number.parseInt(process.env.SUPPLY_STICKY_MAX_PER_STORE ?? '2', 10) || 2,
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

function dropRatio(lastPrice: number | null, listPrice: number | null): number {
  if (lastPrice == null || listPrice == null || !(listPrice > lastPrice)) return 0;
  return (listPrice - lastPrice) / listPrice;
}

/**
 * Selección pura sobre candidatos ya filtrados (tests de diversidad/budget).
 */
export function pickStickyTargetsWithDiversity(
  ranked: StickySkuTarget[],
  opts: { maxTargets: number; maxPerStore: number },
): { picked: StickySkuTarget[]; duplicateSkipped: number; budgetLimited: number } {
  const picked: StickySkuTarget[] = [];
  const seenIds = new Set<string>();
  const storeCounts = new Map<string, number>();
  let duplicateSkipped = 0;
  let diversitySkipped = 0;

  for (const t of ranked) {
    if (picked.length >= opts.maxTargets) break;
    if (seenIds.has(t.productId)) {
      duplicateSkipped += 1;
      continue;
    }
    const storeKey = (t.store ?? '').trim().toLowerCase();
    if (storeKey) {
      const n = storeCounts.get(storeKey) ?? 0;
      if (n >= opts.maxPerStore) {
        diversitySkipped += 1;
        continue;
      }
      storeCounts.set(storeKey, n + 1);
    }
    seenIds.add(t.productId);
    picked.push(t);
  }

  const remainingEligible = ranked.filter((t) => !seenIds.has(t.productId)).length;
  const budgetLimited =
    picked.length >= opts.maxTargets && remainingEligible > 0
      ? remainingEligible
      : 0;

  return {
    picked,
    duplicateSkipped: duplicateSkipped + diversitySkipped,
    budgetLimited,
  };
}

/**
 * Selecciona SKUs history-ready del NICHÓ indicado.
 * Fail-closed: sin nicheId válido o sin allowlist de offers → [].
 */
export async function selectStickySkuTargets(
  opts: {
    nicheId: string;
    supabase?: ReturnType<typeof createServerClient> | null;
    config?: Partial<StickySkuSelectConfig>;
    now?: Date;
    /** Tests: allowlist inyectada (omite query offers). */
    productIdAllowlist?: Set<string> | null;
    storeByProduct?: Map<string, string> | null;
    categoryByProduct?: Map<string, string> | null;
  },
): Promise<StickySkuTarget[]> {
  const report = await selectStickySkuTargetsWithReport(opts);
  return report.targets;
}

export async function selectStickySkuTargetsWithReport(
  opts: {
    nicheId: string;
    supabase?: ReturnType<typeof createServerClient> | null;
    config?: Partial<StickySkuSelectConfig>;
    now?: Date;
    productIdAllowlist?: Set<string> | null;
    storeByProduct?: Map<string, string> | null;
    categoryByProduct?: Map<string, string> | null;
  },
): Promise<StickySkuSelectReport> {
  const budgetCfg = loadStickyBudgetConfig();
  const nicheBudget = resolveStickyNicheBudget(opts.nicheId, budgetCfg);
  const baseReport: StickySkuSelectReport = {
    nicheId: opts.nicheId,
    targets: [],
    stickySelected: 0,
    allowlistSize: 0,
    poolHistoryReady: 0,
    cooldownSkipped: 0,
    qualitySkipped: 0,
    duplicateSkipped: 0,
    budgetLimited: 0,
    attributionReason: null,
    nicheBudget,
    globalBudget: budgetCfg.globalMaxPerWave,
  };

  if (!nicheProfileById(opts.nicheId) || nicheBudget <= 0) {
    return { ...baseReport, attributionReason: 'invalid_niche_or_zero_budget' };
  }

  const cfg: StickySkuSelectConfig = {
    ...DEFAULT_STICKY_SKU_CONFIG,
    ...opts.config,
    maxTargets: Math.min(
      opts.config?.maxTargets ?? nicheBudget,
      nicheBudget,
      budgetCfg.globalMaxPerWave,
    ),
    maxPerStore: opts.config?.maxPerStore ?? budgetCfg.maxPerStore,
  };

  const now = opts.now ?? new Date();
  const todayYmd = formatYmdInTz(now, ML_PRICE_TZ);
  const sinceYmd = daysAgoYmd(todayYmd, cfg.historyWindowDays);

  let client = opts.supabase ?? null;
  if (!client) {
    try {
      client = createServerClient();
    } catch {
      return { ...baseReport, attributionReason: 'no_supabase' };
    }
  }

  let allowlist = opts.productIdAllowlist ?? null;
  let storeByProduct = opts.storeByProduct ?? new Map<string, string>();
  let categoryByProduct = opts.categoryByProduct ?? new Map<string, string>();
  let attributionReason: string | null = null;

  if (!allowlist) {
    const attr = await loadStickyProductAllowlistForNiche({
      nicheId: opts.nicheId,
      supabase: client,
    });
    allowlist = attr.productIds;
    storeByProduct = attr.storeByProduct;
    categoryByProduct = attr.categoryByProduct;
    attributionReason = attr.reasonIfEmpty;
  }

  baseReport.allowlistSize = allowlist.size;
  baseReport.attributionReason = attributionReason;

  if (allowlist.size === 0) {
    return { ...baseReport, attributionReason: attributionReason ?? 'empty_allowlist' };
  }

  const { data, error } = await client
    .from('product_price_snapshots')
    .select('product_id, recorded_on, last_price, list_price, recorded_at')
    .eq('marketplace', ML_PRICE_MARKETPLACE)
    .gte('recorded_on', sinceYmd)
    .lt('recorded_on', todayYmd)
    .order('recorded_on', { ascending: false })
    .limit(5000);

  if (error || !data) {
    return { ...baseReport, attributionReason: 'snapshots_query_failed' };
  }

  type Agg = {
    days: Set<string>;
    lastOn: string;
    lastAt: string | null;
    lastPrice: number | null;
    listPrice: number | null;
  };
  const byId = new Map<string, Agg>();
  let qualitySkipped = 0;

  for (const row of data) {
    const id = String((row as { product_id: string }).product_id);
    if (!allowlist.has(id)) continue;
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

  const { data: todayRows } = await client
    .from('product_price_snapshots')
    .select('product_id')
    .eq('marketplace', ML_PRICE_MARKETPLACE)
    .eq('recorded_on', todayYmd)
    .limit(5000);
  const observedToday = new Set(
    (todayRows ?? []).map((r) => String((r as { product_id: string }).product_id)),
  );

  let cooldownSkipped = 0;
  const eligible: StickySkuTarget[] = [];

  for (const [productId, agg] of byId) {
    if (agg.days.size < cfg.minHistoryDays) {
      qualitySkipped += 1;
      continue;
    }
    if (observedToday.has(productId)) {
      cooldownSkipped += 1;
      continue;
    }
    const hours = hoursBetween(agg.lastAt ?? agg.lastOn, now);
    if (hours < cfg.cooldownHours) {
      cooldownSkipped += 1;
      continue;
    }
    eligible.push({
      productId,
      priorDays: agg.days.size,
      lastObservedOn: agg.lastOn,
      lastPrice: agg.lastPrice,
      listPrice: agg.listPrice,
      hoursSinceObserved: Math.round(hours * 10) / 10,
      nicheId: opts.nicheId,
      store: storeByProduct.get(productId) ?? null,
      category: categoryByProduct.get(productId) ?? null,
    });
  }

  // Prioridad económica: history coverage → drop potential → cooldown age → id.
  eligible.sort((a, b) => {
    const dropA = dropRatio(a.lastPrice, a.listPrice);
    const dropB = dropRatio(b.lastPrice, b.listPrice);
    return (
      b.priorDays - a.priorDays ||
      dropB - dropA ||
      b.hoursSinceObserved - a.hoursSinceObserved ||
      a.productId.localeCompare(b.productId)
    );
  });

  // Rotación diaria suave dentro del pool del nicho (no entre nichos).
  let ranked = eligible;
  if (eligible.length > cfg.maxTargets) {
    const dayIndex = Math.floor(now.getTime() / 86_400_000);
    const start = dayIndex % eligible.length;
    ranked = [...eligible.slice(start), ...eligible.slice(0, start)];
  }

  const { picked, duplicateSkipped, budgetLimited } = pickStickyTargetsWithDiversity(ranked, {
    maxTargets: cfg.maxTargets,
    maxPerStore: cfg.maxPerStore,
  });

  return {
    nicheId: opts.nicheId,
    targets: picked,
    stickySelected: picked.length,
    allowlistSize: allowlist.size,
    poolHistoryReady: eligible.length,
    cooldownSkipped,
    qualitySkipped,
    duplicateSkipped,
    budgetLimited,
    attributionReason,
    nicheBudget,
    globalBudget: budgetCfg.globalMaxPerWave,
  };
}

/** Pura: aplica cooldown sobre lista ya agregada (tests). */
export function filterStickyByCooldown(
  targets: Array<{ productId: string; hoursSinceObserved: number }>,
  cooldownHours: number,
): typeof targets {
  return targets.filter((t) => t.hoursSinceObserved >= cooldownHours);
}
