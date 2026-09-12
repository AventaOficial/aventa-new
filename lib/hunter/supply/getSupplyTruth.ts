/**
 * Read path de Supply Truth. Agrega en SQL (hunter_supply_aggregate).
 * Reconstruye salud global sin process memory.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { HunterSourceHealth } from '@/lib/hunter/types';
import { SCHEDULER_TOLERANCE } from '@/lib/hunter/schedulerHealth';
import { computeGlobalSupplyStatus } from './health';
import type { GlobalSupplyStatus } from './types';
import {
  SUPPLY_TRUTH_WINDOWS,
  type SupplyAggregateRow,
  type SupplyLane,
  type SupplyTruthAlertConditions,
  type SupplyTruthSnapshot,
  type SupplyTruthWindow,
  type SupplyTruthWindowId,
} from './truthTypes';

export type SupplySqlAggregate = {
  source_id?: string;
  source_family?: string;
  source_lane?: string;
  runs?: number | string;
  candidates_discovered?: number | string;
  candidates_qualified?: number | string;
  verified_deals?: number | string;
  promotions?: number | string;
  potential_deals?: number | string;
  catalog_only?: number | string;
  duplicates?: number | string;
  rejected?: number | string;
  pending?: number | string;
  errors?: number | string;
};

function num(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function windowSince(now: Date, id: SupplyTruthWindowId): Date {
  if (id === 'today') {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
  const ms =
    id === 'h24' ? 24 * 3600_000 : id === 'd7' ? 7 * 24 * 3600_000 : 30 * 24 * 3600_000;
  return new Date(now.getTime() - ms);
}

export function mapAggregateRows(raw: SupplySqlAggregate[] | null | undefined): SupplyAggregateRow[] {
  const rows = (raw ?? []).map((row) => ({
    sourceId: String(row.source_id ?? ''),
    family: String(row.source_family ?? 'core'),
    lane: (row.source_lane === 'community' ? 'community' : 'machine') as SupplyLane,
    runs: num(row.runs),
    candidates: num(row.candidates_discovered),
    qualified: num(row.candidates_qualified),
    verifiedDeals: num(row.verified_deals),
    promotions: num(row.promotions),
    potentialDeals: num(row.potential_deals),
    catalogOnly: num(row.catalog_only),
    duplicates: num(row.duplicates),
    rejected: num(row.rejected),
    pending: num(row.pending),
    errors: num(row.errors),
    contributionPct: 0,
  }));
  const totalVerified = rows.reduce((n, r) => n + r.verifiedDeals, 0);
  return rows
    .map((r) => ({
      ...r,
      contributionPct:
        totalVerified > 0 ? Math.round((r.verifiedDeals / totalVerified) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.verifiedDeals - a.verifiedDeals || b.candidates - a.candidates);
}

export function summarizeWindow(
  id: SupplyTruthWindowId,
  since: string,
  rows: SupplyAggregateRow[],
): SupplyTruthWindow {
  const community = rows.filter((r) => r.lane === 'community');
  const machine = rows.filter((r) => r.lane === 'machine');
  const verified = rows.reduce((n, r) => n + r.verifiedDeals, 0);
  const communityVerified = community.reduce((n, r) => n + r.verifiedDeals, 0);
  const machineVerified = machine.reduce((n, r) => n + r.verifiedDeals, 0);
  return {
    id,
    since,
    runs: rows.reduce((n, r) => n + r.runs, 0),
    candidates: rows.reduce((n, r) => n + r.candidates, 0),
    verifiedDeals: verified,
    promotions: rows.reduce((n, r) => n + r.promotions, 0),
    potentialDeals: rows.reduce((n, r) => n + r.potentialDeals, 0),
    catalogOnly: rows.reduce((n, r) => n + r.catalogOnly, 0),
    duplicates: rows.reduce((n, r) => n + r.duplicates, 0),
    rejected: rows.reduce((n, r) => n + r.rejected, 0),
    pending: rows.reduce((n, r) => n + r.pending, 0),
    errors: rows.reduce((n, r) => n + r.errors, 0),
    communityVerified,
    machineVerified,
    communityPct: verified > 0 ? Math.round((communityVerified / verified) * 1000) / 10 : 0,
    machinePct: verified > 0 ? Math.round((machineVerified / verified) * 1000) / 10 : 0,
    contribution: rows,
  };
}

export function computePersistedGlobalHealth(input: {
  lastActivityAt: string | null;
  verified24h: number;
  communityVerified24h: number;
  machineVerified24h: number;
  communityActive24h: boolean;
  machineHealthy: number;
  machineDegraded: number;
  machineDown: number;
  expectedIntervalMs: number;
  now?: Date;
}): { status: GlobalSupplyStatus; stale: boolean; hoursSinceLastActivity: number | null } {
  const now = input.now ?? new Date();
  const lastMs = input.lastActivityAt ? Date.parse(input.lastActivityAt) : Number.NaN;
  const hoursSinceLastActivity = Number.isFinite(lastMs)
    ? Math.round(((now.getTime() - lastMs) / 3_600_000) * 10) / 10
    : null;
  const interval = input.expectedIntervalMs > 0 ? input.expectedIntervalMs : 15 * 60 * 1000;
  const lateBy = Number.isFinite(lastMs) ? (now.getTime() - lastMs) / interval : Number.POSITIVE_INFINITY;
  const stale = lateBy > SCHEDULER_TOLERANCE.degraded;

  const families =
    (input.communityVerified24h > 0 || input.communityActive24h ? 1 : 0) +
    (input.machineVerified24h > 0 ? 1 : 0);

  if (!Number.isFinite(lastMs) && !input.communityActive24h && input.verified24h <= 0) {
    return { status: 'DOWN', stale: true, hoursSinceLastActivity };
  }
  if (lateBy > SCHEDULER_TOLERANCE.stale && !input.communityActive24h) {
    return { status: 'DOWN', stale: true, hoursSinceLastActivity };
  }

  const status = computeGlobalSupplyStatus({
    machineHealthy: input.machineHealthy,
    machineDegraded: input.machineDegraded,
    machineDown: input.machineDown,
    communityAvailable: input.communityActive24h || input.communityVerified24h > 0,
    verifiedDeals: input.verified24h,
    familiesContributing: Math.max(families, input.communityActive24h ? 1 : 0),
  });

  if (lateBy > SCHEDULER_TOLERANCE.degraded && status !== 'DOWN') {
    return { status: 'AT_RISK', stale: true, hoursSinceLastActivity };
  }
  return { status, stale, hoursSinceLastActivity };
}

export function recommendedSupplyTruthAction(input: {
  status: GlobalSupplyStatus;
  window: SupplyTruthWindow;
  machineDown: number;
  machineHealthy: number;
  sourceQuality: Array<{ sourceId: string; hunterStatus: string | null; producingVerified: boolean; producingCandidates: boolean }>;
}): string {
  const { window } = input;
  if (window.verifiedDeals > 0 && window.communityPct >= 50) {
    return `Community is currently responsible for ${Math.round(window.communityPct)}% of verified deals.`;
  }
  if (input.machineDown > 0 && window.communityVerified > 0) {
    return 'All machine sources degraded; community is compensating.';
  }
  const ml = input.sourceQuality.find((s) => s.sourceId === 'ml_worker' || s.sourceId === 'ml_api_legacy');
  if (ml && ml.hunterStatus === 'healthy' && ml.producingCandidates && !ml.producingVerified) {
    return 'ML Worker healthy but producing mostly duplicates.';
  }
  if (ml && (ml.hunterStatus === 'healthy' || ml.hunterStatus === 'degraded') && window.duplicates > window.verifiedDeals && window.candidates > 0) {
    return 'ML Worker healthy but producing mostly duplicates.';
  }
  if (input.status === 'HEALTHY' && window.verifiedDeals > 0) {
    return 'Supply healthy. No action required.';
  }
  if (window.verifiedDeals === 0 && window.candidates > 0) {
    return 'Sources are alive but producing 0 verified deals. Do not lower thresholds.';
  }
  if (input.status === 'DOWN') {
    return 'No recent supply activity. Check scheduler / worker, not retailer flags.';
  }
  return 'Supply needs attention. Investigate the weakest source; do not activate retailers.';
}

export function buildSupplyAlerts(input: {
  window24h: SupplyTruthWindow;
  window7d: SupplyTruthWindow;
  machineDown: number;
  machineConfigured: number;
  sourceQuality: Array<{ sourceId: string; hunterStatus: string | null; producingCandidates: boolean; producingVerified: boolean }>;
}): SupplyTruthAlertConditions {
  const dupRate =
    input.window24h.candidates > 0 ? input.window24h.duplicates / input.window24h.candidates : 0;
  const sourceZeroUnexpected = input.sourceQuality
    .filter(
      (s) =>
        s.hunterStatus === 'healthy' &&
        !s.producingCandidates &&
        !s.producingVerified &&
        s.sourceId !== 'community' &&
        s.sourceId !== 'affiliate_feed' &&
        s.sourceId !== 'partner',
    )
    .map((s) => s.sourceId);
  return {
    noVerifiedDealsForHours: input.window24h.verifiedDeals <= 0,
    allMachineSourcesDown: input.machineConfigured > 0 && input.machineDown >= input.machineConfigured,
    communitySupplyCollapse:
      input.window7d.communityVerified > 0 && input.window24h.communityVerified <= 0,
    sourceZeroUnexpected,
    duplicateRateSpike: dupRate >= 0.6 && input.window24h.candidates >= 5,
  };
}

function emptyWindow(id: SupplyTruthWindowId, since: string): SupplyTruthWindow {
  return summarizeWindow(id, since, []);
}

export async function getSupplyTruth(
  supabase: SupabaseClient | null,
  opts?: {
    now?: Date;
    hunterRows?: HunterSourceHealth[];
    expectedIntervalMs?: number;
  },
): Promise<SupplyTruthSnapshot> {
  const now = opts?.now ?? new Date();
  const expectedIntervalMs = opts?.expectedIntervalMs ?? 15 * 60 * 1000;
  const hunterRows = opts?.hunterRows ?? [];

  const windows = {} as Record<SupplyTruthWindowId, SupplyTruthWindow>;
  for (const id of SUPPLY_TRUTH_WINDOWS) {
    windows[id] = emptyWindow(id, windowSince(now, id).toISOString());
  }

  let lastFinishedAt: string | null = null;
  let lastOkAt: string | null = null;
  let lastSourceId: string | null = null;
  let lastRunId: string | null = null;

  if (supabase) {
    try {
      const [activity, ...aggs] = await Promise.all([
        supabase.rpc('hunter_supply_activity'),
        ...SUPPLY_TRUTH_WINDOWS.map((id) =>
          supabase.rpc('hunter_supply_aggregate', { p_since: windowSince(now, id).toISOString() }),
        ),
      ]);
      const act = Array.isArray(activity.data) ? activity.data[0] : null;
      if (act && typeof act === 'object') {
        lastFinishedAt = (act.last_finished_at as string | null) ?? null;
        lastOkAt = (act.last_ok_at as string | null) ?? null;
        lastSourceId = (act.last_source_id as string | null) ?? null;
        lastRunId = (act.last_run_id as string | null) ?? null;
      }
      SUPPLY_TRUTH_WINDOWS.forEach((id, i) => {
        const payload = aggs[i];
        if (payload && !payload.error && Array.isArray(payload.data)) {
          windows[id] = summarizeWindow(
            id,
            windowSince(now, id).toISOString(),
            mapAggregateRows(payload.data as SupplySqlAggregate[]),
          );
        }
      });
    } catch {
      // fail-closed: snapshot vacío, no tumba /admin/hunter
    }
  }

  const machineRows = hunterRows.filter((r) => r.enabled && r.lastErrorCode !== 'not_configured');
  const machineHealthy = machineRows.filter((r) => r.status === 'healthy').length;
  const machineDegraded = machineRows.filter((r) => r.status === 'degraded').length;
  const machineDown = machineRows.filter((r) => r.status === 'down').length;
  const h24 = windows.h24;
  const communityActive24h = h24.contribution.some((r) => r.lane === 'community' && r.runs > 0);

  const health = computePersistedGlobalHealth({
    lastActivityAt: lastFinishedAt,
    verified24h: h24.verifiedDeals,
    communityVerified24h: h24.communityVerified,
    machineVerified24h: h24.machineVerified,
    communityActive24h,
    machineHealthy,
    machineDegraded,
    machineDown,
    expectedIntervalMs,
    now,
  });

  const sourceQuality = [
    ...hunterRows.map((r) => {
      const row = h24.contribution.find((c) => c.sourceId === r.sourceId);
      return {
        sourceId: r.sourceId,
        family: r.sourceId.includes('ml') ? 'official_api' : 'core',
        hunterStatus: r.status,
        producingCandidates: (row?.candidates ?? 0) > 0,
        producingVerified: (row?.verifiedDeals ?? 0) > 0,
      };
    }),
    {
      sourceId: 'community',
      family: 'community',
      hunterStatus: communityActive24h ? 'healthy' : null,
      producingCandidates: h24.contribution.some((c) => c.sourceId === 'community' && c.candidates > 0),
      producingVerified: h24.communityVerified > 0,
    },
  ];

  const alerts = buildSupplyAlerts({
    window24h: h24,
    window7d: windows.d7,
    machineDown,
    machineConfigured: machineRows.length,
    sourceQuality,
  });

  return {
    globalStatus: health.status,
    recommendedAction: recommendedSupplyTruthAction({
      status: health.status,
      window: h24,
      machineDown,
      machineHealthy,
      sourceQuality,
    }),
    lastFinishedAt,
    lastOkAt,
    lastSourceId,
    lastRunId,
    stale: health.stale,
    hoursSinceLastActivity: health.hoursSinceLastActivity,
    expectedIntervalMinutes: Math.round(expectedIntervalMs / 60_000),
    windows,
    sourceQuality,
    alerts,
  };
}
