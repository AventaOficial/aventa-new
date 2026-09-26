/**
 * Day 11 — HistoryReady activation & verified-yield measurement.
 *
 * Does NOT change ML_PRICE_MIN_HISTORY_DAYS, DQE, S6.1, or mint.
 * Measures conversion of historyReady SKUs through the existing funnel.
 */

import { createServerClient } from '@/lib/supabase/server';
import {
  ML_PRICE_MARKETPLACE,
  ML_PRICE_MIN_HISTORY_DAYS,
  ML_PRICE_TZ,
} from '@/lib/bots/ingest/mlPriceEngine';
import { formatYmdInTz } from '@/lib/bots/ingest/ingestZonedTime';
import {
  isExternalBlockedTerminal,
  isQualityBlockedTerminal,
  type VerifiedYieldCandidateTrace,
} from './verifiedYieldTerminal';

/** Frozen Day 10 production baseline (cycle continuous-2026-09-25-23). */
export const DAY10_PRODUCTION_BASELINE = {
  cycle_id: 'continuous-2026-09-25-23',
  discovered: 11,
  identity_valid: 11,
  pm_ready: 8,
  dqe_verified: 3,
  dqe_potential: 2,
  s61_pass: 1,
} as const;

export type HistoryReadyCensus = {
  total_observations: number | null;
  unique_products: number | null;
  history_ready: number | null;
  exactly_4_days: number | null;
  more_than_4_days: number | null;
  near_ready_1d: number | null;
  near_ready_2d: number | null;
  near_ready_3d: number | null;
  tips_today: number | null;
  tips_last_4_days: number | null;
  /** Tip today ∩ (distinct prior days before today == min-1). */
  approx_activated_today: number | null;
  min_history_days: number;
  limitation: string | null;
};

export type HistoryReadyEvaluatedCounts = {
  history_ready_candidates: number;
  history_ready_activated_flag: number;
  reacquired: number;
  pm_ready: number;
  offer_standard_pass: number;
  dqe_verified: number;
  dqe_potential: number;
  s61_pass: number;
  insufficient_history: number;
  provenance_failure: number;
  artificial_price: number;
};

export type HistoryReadyActivationRates = {
  historyReady_to_s61_yield: number | null;
  historyReady_to_pm_ready: number | null;
  historyReady_to_os_pass: number | null;
  historyReady_to_dqe_verified: number | null;
  dqe_verified_to_s61: number | null;
  /** Among historyReady-evaluated: VERIFIED / candidates */
  overall_verified_yield: number | null;
  /** Among historyReady-evaluated: S6.1 PASS / candidates */
  overall_s61_yield: number | null;
  quality_block_rate: number | null;
  external_block_rate: number | null;
  history_block_rate: number | null;
  artificial_price_rate: number | null;
  provenance_failure_rate: number | null;
};

export type HistoryReadySourceBreakdown = {
  history_ready: number;
  dqe_verified: number;
  s61_pass: number;
  insufficient_history: number;
  provenance_failure: number;
};

export type HistoryReadyActivationReport = {
  census: HistoryReadyCensus;
  evaluated: HistoryReadyEvaluatedCounts;
  rates: HistoryReadyActivationRates;
  by_source: Record<string, HistoryReadySourceBreakdown>;
  day10_baseline: typeof DAY10_PRODUCTION_BASELINE;
  comparison_note: string;
};

function rate(num: number, den: number): number | null {
  if (den <= 0) return null;
  return Math.round((num / den) * 10000) / 10000;
}

export function emptyHistoryReadyCensus(): HistoryReadyCensus {
  return {
    total_observations: null,
    unique_products: null,
    history_ready: null,
    exactly_4_days: null,
    more_than_4_days: null,
    near_ready_1d: null,
    near_ready_2d: null,
    near_ready_3d: null,
    tips_today: null,
    tips_last_4_days: null,
    approx_activated_today: null,
    min_history_days: ML_PRICE_MIN_HISTORY_DAYS,
    limitation: null,
  };
}

/** Distinct prior days ≥ minHistoryDays. Same-day duplicates do not add a day. */
export function isHistoryReadyFromDistinctDays(
  distinctPriorDays: number,
  minHistoryDays: number = ML_PRICE_MIN_HISTORY_DAYS,
): boolean {
  return distinctPriorDays >= minHistoryDays;
}

export function isApproxActivatedToday(input: {
  distinctDaysBeforeToday: number;
  observedToday: boolean;
  minHistoryDays?: number;
}): boolean {
  const min = input.minHistoryDays ?? ML_PRICE_MIN_HISTORY_DAYS;
  return input.observedToday && input.distinctDaysBeforeToday === min - 1;
}

export function buildHistoryReadyActivationFromTraces(
  traces: VerifiedYieldCandidateTrace[],
  census: HistoryReadyCensus,
  opts?: { activatedProductIds?: Set<string> },
): HistoryReadyActivationReport {
  const activatedIds = opts?.activatedProductIds ?? new Set<string>();
  const readyTraces = traces.filter((t) => t.historyReady === true);

  const evaluated: HistoryReadyEvaluatedCounts = {
    history_ready_candidates: readyTraces.length,
    history_ready_activated_flag: readyTraces.filter(
      (t) => t.productId != null && activatedIds.has(t.productId),
    ).length,
    reacquired: readyTraces.length,
    pm_ready: readyTraces.length,
    offer_standard_pass: readyTraces.filter(
      (t) => t.dqeDecision != null || t.s61Decision != null,
    ).length,
    dqe_verified: readyTraces.filter((t) => t.dqeDecision === 'VERIFIED_DEAL').length,
    dqe_potential: readyTraces.filter((t) => t.dqeDecision === 'POTENTIAL_DEAL').length,
    s61_pass: readyTraces.filter((t) => t.s61Decision === 'VERIFIED_OPPORTUNITY').length,
    insufficient_history: readyTraces.filter(
      (t) => t.primaryTerminalReason === 'INSUFFICIENT_HISTORY',
    ).length,
    provenance_failure: readyTraces.filter(
      (t) => t.primaryTerminalReason === 'PROVENANCE_FAILURE',
    ).length,
    artificial_price: readyTraces.filter(
      (t) => t.primaryTerminalReason === 'ARTIFICIAL_LIST_PRICE',
    ).length,
  };

  const by_source: Record<string, HistoryReadySourceBreakdown> = {};
  for (const t of readyTraces) {
    const sid = t.sourceId || 'unknown';
    const row = by_source[sid] ?? {
      history_ready: 0,
      dqe_verified: 0,
      s61_pass: 0,
      insufficient_history: 0,
      provenance_failure: 0,
    };
    row.history_ready += 1;
    if (t.dqeDecision === 'VERIFIED_DEAL') row.dqe_verified += 1;
    if (t.s61Decision === 'VERIFIED_OPPORTUNITY') row.s61_pass += 1;
    if (t.primaryTerminalReason === 'INSUFFICIENT_HISTORY') row.insufficient_history += 1;
    if (t.primaryTerminalReason === 'PROVENANCE_FAILURE') row.provenance_failure += 1;
    by_source[sid] = row;
  }

  const hr = evaluated.history_ready_candidates;
  const qualityBlocks = readyTraces.filter((t) =>
    isQualityBlockedTerminal(t.primaryTerminalReason),
  ).length;
  const externalBlocks = readyTraces.filter((t) =>
    isExternalBlockedTerminal(t.primaryTerminalReason),
  ).length;

  return {
    census,
    evaluated,
    rates: {
      historyReady_to_s61_yield: rate(evaluated.s61_pass, hr),
      historyReady_to_pm_ready: rate(evaluated.pm_ready, hr),
      historyReady_to_os_pass: rate(evaluated.offer_standard_pass, hr),
      historyReady_to_dqe_verified: rate(evaluated.dqe_verified, hr),
      dqe_verified_to_s61: rate(evaluated.s61_pass, evaluated.dqe_verified),
      overall_verified_yield: rate(evaluated.dqe_verified, hr),
      overall_s61_yield: rate(evaluated.s61_pass, hr),
      quality_block_rate: rate(qualityBlocks, hr),
      external_block_rate: rate(externalBlocks, hr),
      history_block_rate: rate(evaluated.insufficient_history, hr),
      artificial_price_rate: rate(evaluated.artificial_price, hr),
      provenance_failure_rate: rate(evaluated.provenance_failure, hr),
    },
    by_source,
    day10_baseline: DAY10_PRODUCTION_BASELINE,
    comparison_note:
      'Day10 baseline is a single production cycle; Day11 rates are per-cycle and not a statistical uplift claim.',
  };
}

export async function loadHistoryReadyCensus(opts?: {
  now?: Date;
  supabase?: ReturnType<typeof createServerClient> | null;
}): Promise<HistoryReadyCensus> {
  const out = emptyHistoryReadyCensus();
  out.limitation =
    'approx_activated_today = tip-today ∩ (distinct prior days before today == min-1); no durable before/after baseline table.';

  let client = opts?.supabase ?? null;
  if (!client) {
    try {
      client = createServerClient();
    } catch {
      out.limitation = 'no_supabase_client';
      return out;
    }
  }

  const now = opts?.now ?? new Date();
  const todayYmd = formatYmdInTz(now, ML_PRICE_TZ);
  const min = ML_PRICE_MIN_HISTORY_DAYS;
  const [y, m, d] = todayYmd.split('-').map((x) => Number.parseInt(x, 10));
  const d4dt = new Date(Date.UTC(y, m - 1, d - 3));
  const d4 = `${d4dt.getUTCFullYear()}-${String(d4dt.getUTCMonth() + 1).padStart(2, '0')}-${String(d4dt.getUTCDate()).padStart(2, '0')}`;

  try {
    const { count: totalObs } = await client
      .from('product_price_snapshots')
      .select('*', { count: 'exact', head: true });
    out.total_observations = totalObs ?? null;

    const { data: rows, error } = await client
      .from('product_price_snapshots')
      .select('product_id, recorded_on')
      .eq('marketplace', ML_PRICE_MARKETPLACE)
      .limit(20000);

    if (error || !rows) {
      out.limitation = `census_query_failed:${error?.message?.slice(0, 80) ?? 'no_rows'}`;
      return out;
    }

    type Agg = { priorDays: Set<string>; hasToday: boolean };
    const byId = new Map<string, Agg>();
    let tipsToday = 0;
    let tipsLast4 = 0;

    for (const row of rows) {
      const id = String((row as { product_id: string }).product_id);
      const on = String((row as { recorded_on: string }).recorded_on).slice(0, 10);
      const agg = byId.get(id) ?? { priorDays: new Set<string>(), hasToday: false };
      if (on === todayYmd) {
        agg.hasToday = true;
        tipsToday += 1;
      } else {
        agg.priorDays.add(on);
      }
      if (on >= d4) tipsLast4 += 1;
      byId.set(id, agg);
    }

    out.tips_today = tipsToday;
    out.tips_last_4_days = tipsLast4;
    out.unique_products = byId.size;

    let hr = 0;
    let exactly4 = 0;
    let more4 = 0;
    let n1 = 0;
    let n2 = 0;
    let n3 = 0;
    let activated = 0;

    for (const [, agg] of byId) {
      const prior = agg.priorDays.size;
      if (isHistoryReadyFromDistinctDays(prior, min)) {
        hr += 1;
        if (prior === min) exactly4 += 1;
        else more4 += 1;
      } else if (prior >= 1) {
        const until = min - prior;
        if (until === 1) n1 += 1;
        else if (until === 2) n2 += 1;
        else n3 += 1;
      }
      if (
        isApproxActivatedToday({
          distinctDaysBeforeToday: prior,
          observedToday: agg.hasToday,
          minHistoryDays: min,
        })
      ) {
        activated += 1;
      }
    }

    out.history_ready = hr;
    out.exactly_4_days = exactly4;
    out.more_than_4_days = more4;
    out.near_ready_1d = n1;
    out.near_ready_2d = n2;
    out.near_ready_3d = n3;
    out.approx_activated_today = activated;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    out.limitation = `census_threw:${msg.slice(0, 120)}`;
  }

  return out;
}
