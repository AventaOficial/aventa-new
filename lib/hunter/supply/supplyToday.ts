/**
 * Supply Today — snapshot accionable para CEO / hunter-health.
 * Solo lectura. Sin dependencias de registry/router (evita leak al client bundle).
 */
import { createServerClient } from '@/lib/supabase/server';
import { getPendingHealth } from '@/lib/moderation/pendingHealth';
import {
  getPriceMemoryHealth,
  type PriceMemoryHealthSnapshot,
  SUPPLY_DAILY_TARGETS,
} from './priceMemoryHealth';
import { enabledNicheProfiles, parseSupplyEngineMode, type SupplyEngineMode } from './nicheProfiles';
import { SUPPLY_RUN_TABLE } from './truthTypes';

export type StickyNicheTodayRow = {
  nicheId: string;
  selected: number;
  verified: number;
  historyReady: number;
  priceDrop: number;
  historicalLow: number;
  approvalReady: number;
  evidenceRich: number;
  runs: number;
};

export type SupplyTodaySnapshot = {
  mode: SupplyEngineMode;
  writeEnabled: boolean;
  discovered: number | null;
  verified: number | null;
  approvalReady: number | null;
  highQuality: number | null;
  pendingModeration: number | null;
  stickyObserved: number | null;
  freshDiscovered: number | null;
  stickyPdpSuccess: number | null;
  stickyApiSuccess: number | null;
  stickyApiBlocked: number | null;
  stickyEvidenceRich: number | null;
  stickyVerified: number | null;
  stickyHistoryReady: number | null;
  stickyPriceDrop: number | null;
  stickyHistoricalLow: number | null;
  stickyApprovalReady: number | null;
  stickyByNiche: StickyNicheTodayRow[];
  freshVerified: number | null;
  freshApprovalReady: number | null;
  qualityRatePct: number | null;
  topNiche: string | null;
  topQuery: string | null;
  topSource: string | null;
  bottleneck: 'discovery' | 'price_memory' | 'moderation' | 'none';
  action: string;
  dailyTargets: typeof SUPPLY_DAILY_TARGETS;
  priceMemory: PriceMemoryHealthSnapshot;
  nichesEnabled: string[];
};

function writeEnabledFromEnv(): boolean {
  const v = (process.env.SUPPLY_ENGINE_WRITE ?? '').trim().toLowerCase();
  return v === '1' || v === 'true';
}

async function sumStickyByNicheToday(
  client: ReturnType<typeof createServerClient>,
): Promise<{
  rows: StickyNicheTodayRow[];
  stickySelected: number;
  stickyVerified: number;
  stickyEvidenceRich: number;
  stickyHistoryReady: number;
  stickyPriceDrop: number;
  stickyHistoricalLow: number;
  stickyApprovalReady: number;
}> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const niches = enabledNicheProfiles();
  const byNiche = new Map<string, StickyNicheTodayRow>();
  for (const n of niches) {
    byNiche.set(n.id, {
      nicheId: n.id,
      selected: 0,
      verified: 0,
      historyReady: 0,
      priceDrop: 0,
      historicalLow: 0,
      approvalReady: 0,
      evidenceRich: 0,
      runs: 0,
    });
  }

  const { data, error } = await client
    .from(SUPPLY_RUN_TABLE)
    .select(
      'source_id, candidates_discovered, candidates_qualified, verified_deals, promotions, potential_deals, catalog_only, pending',
    )
    .like('source_id', 'sticky_%')
    .gte('finished_at', start.toISOString())
    .limit(500);

  if (!error && data) {
    for (const row of data) {
      const sid = String((row as { source_id?: string }).source_id ?? '');
      const nicheId = sid.startsWith('sticky_') ? sid.slice('sticky_'.length) : '';
      if (!nicheId || !byNiche.has(nicheId)) continue;
      const cur = byNiche.get(nicheId)!;
      cur.runs += 1;
      cur.selected += Number((row as { candidates_discovered?: number }).candidates_discovered ?? 0) || 0;
      cur.evidenceRich += Number((row as { candidates_qualified?: number }).candidates_qualified ?? 0) || 0;
      cur.verified += Number((row as { verified_deals?: number }).verified_deals ?? 0) || 0;
      cur.historicalLow += Number((row as { promotions?: number }).promotions ?? 0) || 0;
      cur.approvalReady += Number((row as { potential_deals?: number }).potential_deals ?? 0) || 0;
      cur.historyReady += Number((row as { catalog_only?: number }).catalog_only ?? 0) || 0;
      cur.priceDrop += Number((row as { pending?: number }).pending ?? 0) || 0;
    }
  }

  const rows = niches.map((n) => byNiche.get(n.id)!);
  return {
    rows,
    stickySelected: rows.reduce((s, r) => s + r.selected, 0),
    stickyVerified: rows.reduce((s, r) => s + r.verified, 0),
    stickyEvidenceRich: rows.reduce((s, r) => s + r.evidenceRich, 0),
    stickyHistoryReady: rows.reduce((s, r) => s + r.historyReady, 0),
    stickyPriceDrop: rows.reduce((s, r) => s + r.priceDrop, 0),
    stickyHistoricalLow: rows.reduce((s, r) => s + r.historicalLow, 0),
    stickyApprovalReady: rows.reduce((s, r) => s + r.approvalReady, 0),
  };
}

async function sumSupplyToday(
  client: ReturnType<typeof createServerClient>,
): Promise<{
  discovered: number;
  verified: number;
  freshDiscovered: number;
  freshVerified: number;
  topSource: string | null;
}> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { data, error } = await client
    .from(SUPPLY_RUN_TABLE)
    .select('source_id, candidates_discovered, verified_deals')
    .gte('finished_at', start.toISOString())
    .limit(500);
  if (error || !data) {
    return { discovered: 0, verified: 0, freshDiscovered: 0, freshVerified: 0, topSource: null };
  }

  let discovered = 0;
  let verified = 0;
  let freshDiscovered = 0;
  let freshVerified = 0;
  const bySource = new Map<string, number>();
  for (const row of data) {
    const d = Number((row as { candidates_discovered?: number }).candidates_discovered ?? 0);
    const v = Number((row as { verified_deals?: number }).verified_deals ?? 0);
    const sid = String((row as { source_id?: string }).source_id ?? '');
    const dN = Number.isFinite(d) ? d : 0;
    const vN = Number.isFinite(v) ? v : 0;
    discovered += dN;
    verified += vN;
    // sticky_* = observación sticky; el resto = fresh discovery (no solapar).
    if (!sid.startsWith('sticky_')) {
      freshDiscovered += dN;
      freshVerified += vN;
    }
    if (sid) bySource.set(sid, (bySource.get(sid) ?? 0) + vN);
  }
  let topSource: string | null = null;
  let best = -1;
  for (const [sid, n] of bySource) {
    if (n > best) {
      best = n;
      topSource = sid;
    }
  }
  return { discovered, verified, freshDiscovered, freshVerified, topSource };
}

export async function buildSupplyToday(
  supabase?: ReturnType<typeof createServerClient> | null,
): Promise<SupplyTodaySnapshot> {
  let client = supabase ?? null;
  if (!client) {
    try {
      client = createServerClient();
    } catch {
      client = null;
    }
  }

  const [pending, priceMemory, todaySums, stickyNiche] = await Promise.all([
    getPendingHealth(client),
    getPriceMemoryHealth(client),
    client
      ? sumSupplyToday(client)
      : Promise.resolve({
          discovered: 0,
          verified: 0,
          freshDiscovered: 0,
          freshVerified: 0,
          topSource: null as string | null,
        }),
    client
      ? sumStickyByNicheToday(client)
      : Promise.resolve({
          rows: enabledNicheProfiles().map((n) => ({
            nicheId: n.id,
            selected: 0,
            verified: 0,
            historyReady: 0,
            priceDrop: 0,
            historicalLow: 0,
            approvalReady: 0,
            evidenceRich: 0,
            runs: 0,
          })),
          stickySelected: 0,
          stickyVerified: 0,
          stickyEvidenceRich: 0,
          stickyHistoryReady: 0,
          stickyPriceDrop: 0,
          stickyHistoricalLow: 0,
          stickyApprovalReady: 0,
        }),
  ]);

  const discovered = client ? todaySums.discovered : null;
  const verified = client ? todaySums.verified : null;
  const highQuality = verified;
  const pendingModeration = pending.total ?? null;

  // stickyObserved = SKUs sticky selected hoy (no confundir con rowsToday de PM).
  const stickyObserved =
    stickyNiche.stickySelected > 0 ? stickyNiche.stickySelected : null;
  const freshDiscovered = client ? todaySums.freshDiscovered : null;
  const freshVerified = client ? todaySums.freshVerified : null;
  // approvalReady sticky es el único persistido hoy en hunter_supply_runs (remap potential_deals).
  const stickyApprovalReady = stickyNiche.stickyApprovalReady;
  const approvalReady = stickyApprovalReady > 0 ? stickyApprovalReady : 0;

  const qualityRatePct =
    discovered != null && discovered > 0 && verified != null
      ? Math.round((verified / discovered) * 1000) / 10
      : null;

  const niches = enabledNicheProfiles();
  const topNiche = niches[0]?.id ?? null;
  const topSource =
    todaySums.topSource ??
    ((priceMemory.productsHistoryReadyEligible7d ?? 0) > 0 ? 'ml_api_legacy' : null);

  let bottleneck: SupplyTodaySnapshot['bottleneck'] = 'none';
  let action = 'Correr dry_run Supply Engine (WRITE=0)';

  if ((pendingModeration ?? 0) >= 10) {
    bottleneck = 'moderation';
    action = `Revisar ${pendingModeration} pendientes de moderación`;
  } else if (!priceMemory.ok || (priceMemory.productsHistoryReadyEligible7d ?? 0) < 5) {
    bottleneck = 'price_memory';
    action = 'Acumular Price Memory (dry_run diario + sticky, WRITE=0)';
  } else if ((freshDiscovered ?? 0) < SUPPLY_DAILY_TARGETS.discovered * 0.5) {
    bottleneck = 'discovery';
    action =
      'Activar ml_worker discovery-only (BOT_INGEST_EXTERNAL_WORKER=1, WORKER_DISCOVERY_ONLY=1)';
  } else if ((pendingModeration ?? 0) > 0) {
    bottleneck = 'moderation';
    action = `Revisar ${pendingModeration} ofertas en cola`;
  }

  return {
    mode: parseSupplyEngineMode(process.env.SUPPLY_ENGINE_MODE),
    writeEnabled: writeEnabledFromEnv(),
    discovered,
    verified,
    approvalReady,
    highQuality,
    pendingModeration,
    stickyObserved,
    freshDiscovered,
    stickyPdpSuccess: stickyNiche.stickySelected > 0 ? stickyNiche.stickySelected : null,
    stickyApiSuccess: stickyNiche.stickySelected > 0 ? stickyNiche.stickySelected : null,
    stickyApiBlocked: null,
    stickyEvidenceRich: stickyNiche.stickyEvidenceRich,
    stickyVerified: stickyNiche.stickyVerified,
    stickyHistoryReady: stickyNiche.stickyHistoryReady,
    stickyPriceDrop: stickyNiche.stickyPriceDrop,
    stickyHistoricalLow: stickyNiche.stickyHistoricalLow,
    stickyApprovalReady,
    stickyByNiche: stickyNiche.rows,
    freshVerified,
    // Fresh approvalReady aún no se persiste en hunter_supply_runs (router potential_deals ≠ approvalReady).
    freshApprovalReady: null,
    qualityRatePct,
    topNiche,
    topQuery: niches[0]?.mlQueries[0] ?? null,
    topSource,
    bottleneck,
    action,
    dailyTargets: SUPPLY_DAILY_TARGETS,
    priceMemory,
    nichesEnabled: niches.map((n) => n.id),
  };
}
