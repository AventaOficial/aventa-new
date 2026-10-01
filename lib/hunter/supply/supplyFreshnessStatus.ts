/**
 * Day 5 — Observable supply / Price Memory freshness status (read-only).
 * Answers: "Did Aventa receive real supply / PM tip today?"
 */

import { createServerClient } from '@/lib/supabase/server';
import { ML_PRICE_MARKETPLACE, ML_PRICE_TZ } from '@/lib/bots/ingest/mlPriceEngine';
import { formatYmdInTz } from '@/lib/bots/ingest/ingestZonedTime';

export type SupplyFreshnessStatus = {
  todayYmd: string;
  last_successful_supply_run: {
    startedAt: string;
    sourceId: string;
    candidatesDiscovered: number;
    status: string;
  } | null;
  last_successful_pm_write: {
    recordedOn: string;
    rows: number;
  } | null;
  last_successful_source: string | null;
  last_failure_reason: string | null;
  pm_rows_today: number;
  productive_runs_today: number;
  ml_api_legacy_runs_today: number;
  ml_worker_runs_today: number;
  verdict: string;
};

export async function readSupplyFreshnessStatus(opts?: {
  supabase?: ReturnType<typeof createServerClient> | null;
  now?: Date;
}): Promise<SupplyFreshnessStatus> {
  const now = opts?.now ?? new Date();
  const todayYmd = formatYmdInTz(now, ML_PRICE_TZ);
  const empty: SupplyFreshnessStatus = {
    todayYmd,
    last_successful_supply_run: null,
    last_successful_pm_write: null,
    last_successful_source: null,
    last_failure_reason: null,
    pm_rows_today: 0,
    productive_runs_today: 0,
    ml_api_legacy_runs_today: 0,
    ml_worker_runs_today: 0,
    verdict: 'no_data',
  };

  let client = opts?.supabase ?? null;
  if (!client) {
    try {
      client = createServerClient();
    } catch {
      return { ...empty, verdict: 'no_supabase' };
    }
  }

  const dayStartUtc = new Date(`${todayYmd}T06:00:00.000Z`); // approx MX midnight in UTC band
  // Prefer explicit filter on recorded_on for PM
  const { count: pmToday } = await client
    .from('product_price_snapshots')
    .select('*', { count: 'exact', head: true })
    .eq('marketplace', ML_PRICE_MARKETPLACE)
    .eq('recorded_on', todayYmd);

  const { data: lastPm } = await client
    .from('product_price_snapshots')
    .select('recorded_on')
    .eq('marketplace', ML_PRICE_MARKETPLACE)
    .order('recorded_on', { ascending: false })
    .limit(1)
    .maybeSingle();

  let lastPmRows = 0;
  if (lastPm?.recorded_on) {
    const { count } = await client
      .from('product_price_snapshots')
      .select('*', { count: 'exact', head: true })
      .eq('marketplace', ML_PRICE_MARKETPLACE)
      .eq('recorded_on', String(lastPm.recorded_on).slice(0, 10));
    lastPmRows = count ?? 0;
  }

  const { data: lastOk } = await client
    .from('hunter_supply_runs')
    .select('started_at, source_id, status, candidates_discovered, errors')
    .gt('candidates_discovered', 0)
    .in('status', ['ok', 'success'])
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: lastFail } = await client
    .from('hunter_supply_runs')
    .select('started_at, source_id, status, errors')
    .or('status.eq.failed,status.eq.error,errors.gt.0')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: todayRuns } = await client
    .from('hunter_supply_runs')
    .select('source_id, status, candidates_discovered')
    .gte('started_at', dayStartUtc.toISOString());

  let productive = 0;
  let mlApi = 0;
  let mlWorker = 0;
  for (const row of todayRuns ?? []) {
    const src = String((row as { source_id?: string }).source_id ?? '');
    const disc = Number((row as { candidates_discovered?: number }).candidates_discovered ?? 0);
    if (disc > 0) productive += 1;
    if (src === 'ml_api_legacy') mlApi += 1;
    if (src === 'ml_worker') mlWorker += 1;
  }

  const lastRun = lastOk
    ? {
        startedAt: String((lastOk as { started_at: string }).started_at),
        sourceId: String((lastOk as { source_id: string }).source_id),
        candidatesDiscovered: Number(
          (lastOk as { candidates_discovered?: number }).candidates_discovered ?? 0,
        ),
        status: String((lastOk as { status: string }).status),
      }
    : null;

  const pmRowsToday = pmToday ?? 0;
  let verdict = 'ok';
  if (pmRowsToday === 0) verdict = 'pm_tip_missing_today';
  else if (productive === 0) verdict = 'no_productive_supply_today';
  else if (mlApi === 0 && mlWorker > 0) verdict = 'worker_only_supply';
  else if (mlApi === 0 && mlWorker === 0) verdict = 'no_ml_sources_today';

  return {
    todayYmd,
    last_successful_supply_run: lastRun,
    last_successful_pm_write: lastPm?.recorded_on
      ? { recordedOn: String(lastPm.recorded_on).slice(0, 10), rows: lastPmRows }
      : null,
    last_successful_source: lastRun?.sourceId ?? null,
    last_failure_reason: lastFail
      ? `${(lastFail as { source_id: string }).source_id}:${(lastFail as { status: string }).status}`
      : null,
    pm_rows_today: pmRowsToday,
    productive_runs_today: productive,
    ml_api_legacy_runs_today: mlApi,
    ml_worker_runs_today: mlWorker,
    verdict,
  };
}
