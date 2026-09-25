/**
 * Day 4 — Price Memory freshness: diagnosis + observation-only cycle.
 *
 * PM observations do NOT require DQE VERIFIED or S6.1.
 * They are recorded when sticky/server observation resolves a price
 * via recordMlDailySnapshots (marketplace=mercadolibre).
 *
 * This cycle never mints offers. Staging-safe by default.
 */

import { createServerClient } from '@/lib/supabase/server';
import {
  ML_PRICE_MARKETPLACE,
  ML_PRICE_MIN_HISTORY_DAYS,
  ML_PRICE_TZ,
  recordMlDailySnapshots,
} from '@/lib/bots/ingest/mlPriceEngine';
import { formatYmdInTz } from '@/lib/bots/ingest/ingestZonedTime';
import { selectNearReadyStickyTargets } from '@/lib/hunter/supply/nearReadySticky';
import { observeStickySkuViaServer } from '@/lib/hunter/supply/observeStickySkus';
import type { PipelineLossCode } from '@/lib/bots/ingest/automationLifecycle';
import { randomUUID } from 'node:crypto';

export type PriceMemoryCensus = {
  observations: number;
  uniqueProducts: number;
  calendarDays: number;
  historyReady: number;
  nearReady: number;
  notReady: number;
  lastDay: string | null;
  firstDay: string | null;
  todayYmd: string;
  rowsToday: number;
  staleDays: number;
};

export type FreshnessLossBucket = Record<PipelineLossCode, number>;

export type PriceMemoryFreshnessReport = {
  cycle_id: string;
  startedAt: string;
  finishedAt: string;
  mode: 'observe_only';
  censusBefore: PriceMemoryCensus;
  censusAfter: PriceMemoryCensus | null;
  targetsSelected: number;
  observeAttempted: number;
  observeOk: number;
  snapshotsPersisted: number;
  losses: FreshnessLossBucket;
  largestLoss: PipelineLossCode | null;
  diagnosis: string;
  productionGate: string;
};

function emptyLosses(): FreshnessLossBucket {
  return {
    NO_CANDIDATES: 0,
    FETCH_BLOCKED: 0,
    EXTRACTION_FAILED: 0,
    IDENTITY_FAILED: 0,
    PRICE_MISSING: 0,
    DUPLICATE: 0,
    DQE_BLOCK: 0,
    S6_1_BLOCK: 0,
    WRITER_BLOCK: 0,
    WRITE_FAILURE: 0,
    OTHER: 0,
  };
}

export async function measurePriceMemoryCensus(opts?: {
  supabase?: ReturnType<typeof createServerClient> | null;
  now?: Date;
}): Promise<PriceMemoryCensus> {
  const now = opts?.now ?? new Date();
  const todayYmd = formatYmdInTz(now, ML_PRICE_TZ);
  const empty: PriceMemoryCensus = {
    observations: 0,
    uniqueProducts: 0,
    calendarDays: 0,
    historyReady: 0,
    nearReady: 0,
    notReady: 0,
    lastDay: null,
    firstDay: null,
    todayYmd,
    rowsToday: 0,
    staleDays: 0,
  };

  let client = opts?.supabase ?? null;
  if (!client) {
    try {
      client = createServerClient();
    } catch {
      return empty;
    }
  }

  const { count: obsCount } = await client
    .from('product_price_snapshots')
    .select('*', { count: 'exact', head: true })
    .eq('marketplace', ML_PRICE_MARKETPLACE);

  const { data: rows } = await client
    .from('product_price_snapshots')
    .select('product_id, recorded_on')
    .eq('marketplace', ML_PRICE_MARKETPLACE)
    .limit(8000);

  const byProduct = new Map<string, Set<string>>();
  const allDays = new Set<string>();
  let rowsToday = 0;
  for (const row of rows ?? []) {
    const id = String((row as { product_id?: string }).product_id ?? '');
    const day = String((row as { recorded_on?: string }).recorded_on ?? '').slice(0, 10);
    if (!id || !day) continue;
    if (!byProduct.has(id)) byProduct.set(id, new Set());
    byProduct.get(id)!.add(day);
    allDays.add(day);
    if (day === todayYmd) rowsToday += 1;
  }

  let historyReady = 0;
  let nearReady = 0;
  let notReady = 0;
  for (const days of byProduct.values()) {
    const n = days.size;
    if (n >= ML_PRICE_MIN_HISTORY_DAYS) historyReady += 1;
    else if (n === ML_PRICE_MIN_HISTORY_DAYS - 1) nearReady += 1;
    else notReady += 1;
  }

  const sortedDays = [...allDays].sort();
  const lastDay = sortedDays.length ? sortedDays[sortedDays.length - 1]! : null;
  const firstDay = sortedDays.length ? sortedDays[0]! : null;
  let staleDays = 0;
  if (lastDay && lastDay < todayYmd) {
    const last = Date.parse(`${lastDay}T12:00:00.000Z`);
    const today = Date.parse(`${todayYmd}T12:00:00.000Z`);
    if (Number.isFinite(last) && Number.isFinite(today)) {
      staleDays = Math.max(0, Math.round((today - last) / 86_400_000));
    }
  }

  return {
    observations: obsCount ?? rows?.length ?? 0,
    uniqueProducts: byProduct.size,
    calendarDays: allDays.size,
    historyReady,
    nearReady,
    notReady,
    lastDay,
    firstDay,
    todayYmd,
    rowsToday,
    staleDays,
  };
}

export function diagnosePriceMemoryFreshness(census: PriceMemoryCensus): {
  diagnosis: string;
  largestLoss: PipelineLossCode | null;
  productionGate: string;
} {
  if (census.staleDays >= 1) {
    return {
      diagnosis: `Price Memory last_day=${census.lastDay} is ${census.staleDays} calendar day(s) behind today (${census.todayYmd}). Likely supply-engine/sticky observe not persisting new days — check ML API OAuth, ml_worker health, and cron cadence (not DQE/S6.1).`,
      largestLoss: 'FETCH_BLOCKED',
      productionGate:
        'Ensure /api/cron/supply-engine runs daily with ML credentials healthy; PM persist is independent of offer mint (dry_run OK). Do NOT enable machine mint in production.',
    };
  }
  if (census.rowsToday === 0) {
    return {
      diagnosis: `Same calendar day (${census.todayYmd}) but 0 rows today yet — freshness cycle has not written today's tip.`,
      largestLoss: 'NO_CANDIDATES',
      productionGate:
        'Run supply-engine dry_run or pm_freshness observe-only; verify ml_api_legacy OAuth and ml_worker.',
    };
  }
  return {
    diagnosis: `Price Memory is current for ${census.todayYmd} (${census.rowsToday} rows today). historyReady=${census.historyReady}/${census.uniqueProducts}. Bottleneck for DQE majority remains sticky multi-day coverage, not total row count.`,
    largestLoss: null,
    productionGate:
      'Keep supply-engine dry_run accumulating PM; production machine mint stays OFF.',
  };
}

/**
 * Observation-only freshness cycle: near-ready sticky → server observe → PM upsert.
 * Never calls S7 / insertIngestedOffer.
 */
export async function runPriceMemoryFreshnessCycle(opts?: {
  maxTargets?: number;
  persist?: boolean;
  now?: Date;
}): Promise<PriceMemoryFreshnessReport> {
  const started = new Date();
  const cycleId = randomUUID();
  const now = opts?.now ?? started;
  const persist = opts?.persist !== false;
  const maxTargets = Math.max(1, Math.min(24, opts?.maxTargets ?? 8));
  const losses = emptyLosses();

  const censusBefore = await measurePriceMemoryCensus({ now });
  const baseDiag = diagnosePriceMemoryFreshness(censusBefore);

  const near = await selectNearReadyStickyTargets({
    now,
    config: { maxTargets, cooldownHours: 1 },
  });

  let targets = near.targets;
  // Fallback: products in PM missing today's tip (keeps cadence when near-ready pool empty).
  if (targets.length === 0) {
    try {
      const client = createServerClient();
      const todayYmd = formatYmdInTz(now, ML_PRICE_TZ);
      const { data: rows } = await client
        .from('product_price_snapshots')
        .select('product_id, last_price, recorded_on')
        .eq('marketplace', ML_PRICE_MARKETPLACE)
        .lt('recorded_on', todayYmd)
        .order('recorded_on', { ascending: false })
        .limit(2000);
      const latest = new Map<
        string,
        { lastPrice: number; days: Set<string>; lastOn: string }
      >();
      for (const row of rows ?? []) {
        const id = String((row as { product_id: string }).product_id);
        const on = String((row as { recorded_on: string }).recorded_on).slice(0, 10);
        const price = Number((row as { last_price?: number }).last_price);
        if (!id || !Number.isFinite(price) || price <= 0) continue;
        const agg = latest.get(id) ?? { lastPrice: price, days: new Set<string>(), lastOn: on };
        agg.days.add(on);
        if (on >= agg.lastOn) {
          agg.lastOn = on;
          agg.lastPrice = price;
        }
        latest.set(id, agg);
      }
      // Prefer near-ready (3 prior days), then any stale with ≥1 day
      const ranked = [...latest.entries()]
        .map(([productId, agg]) => ({
          productId,
          priorDays: agg.days.size,
          daysUntilReady: Math.max(0, ML_PRICE_MIN_HISTORY_DAYS - agg.days.size),
          lastObservedOn: agg.lastOn,
          lastPrice: agg.lastPrice,
          hoursSinceObserved: 24,
          marketplace: ML_PRICE_MARKETPLACE as typeof ML_PRICE_MARKETPLACE,
        }))
        .filter((t) => t.lastObservedOn < todayYmd)
        .sort(
          (a, b) =>
            a.daysUntilReady - b.daysUntilReady ||
            b.priorDays - a.priorDays ||
            a.productId.localeCompare(b.productId),
        )
        .slice(0, maxTargets);
      targets = ranked;
      if (targets.length === 0) {
        losses.NO_CANDIDATES += 1;
      } else {
        // Clear false NO_CANDIDATES if we recovered via stale pool
        losses.NO_CANDIDATES = 0;
      }
    } catch {
      losses.NO_CANDIDATES += 1;
    }
  }

  let observeAttempted = 0;
  let observeOk = 0;
  let snapshotsPersisted = 0;

  for (const t of targets) {
    observeAttempted += 1;
    try {
      const obs = await observeStickySkuViaServer({
        productId: t.productId,
        nicheId: 'pm_freshness',
        persistSnapshots: persist,
        observedAt: now,
      });
      if (obs.observationStatus === 'source_blocked') {
        losses.FETCH_BLOCKED += 1;
        continue;
      }
      if (obs.observationStatus === 'not_found') {
        losses.IDENTITY_FAILED += 1;
        continue;
      }
      if (!obs.price || !(obs.price.value > 0)) {
        losses.PRICE_MISSING += 1;
        continue;
      }
      observeOk += 1;
      if (persist) {
        // observeStickySkuViaServer already persisted when persistSnapshots=true;
        // count success tip. Extra upsert is idempotent same-day.
        await recordMlDailySnapshots([
          {
            productId: t.productId,
            current: obs.price.value,
            listPrice: obs.originalPrice?.value ?? null,
            regularPrice: obs.originalPrice?.value ?? null,
            nicheId: null,
          },
        ]);
        snapshotsPersisted += 1;
      }
    } catch {
      losses.OTHER += 1;
    }
  }

  const censusAfter = await measurePriceMemoryCensus({ now });
  const finished = new Date();

  let largestLoss: PipelineLossCode | null = baseDiag.largestLoss;
  let max = 0;
  for (const [k, v] of Object.entries(losses) as [PipelineLossCode, number][]) {
    if (v > max) {
      max = v;
      largestLoss = k;
    }
  }
  if (max === 0) largestLoss = baseDiag.largestLoss;

  const diagnosis =
    observeOk > 0
      ? `Freshness cycle observed ${observeOk}/${observeAttempted} near-ready SKUs; snapshotsPersisted=${snapshotsPersisted}. ${baseDiag.diagnosis}`
      : targets.length === 0
        ? `No near-ready targets. ${baseDiag.diagnosis}`
        : `All observe attempts failed (largest=${largestLoss}). ${baseDiag.diagnosis}`;

  return {
    cycle_id: cycleId,
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    mode: 'observe_only',
    censusBefore,
    censusAfter,
    targetsSelected: targets.length,
    observeAttempted,
    observeOk,
    snapshotsPersisted,
    losses,
    largestLoss,
    diagnosis,
    productionGate: baseDiag.productionGate,
  };
}
