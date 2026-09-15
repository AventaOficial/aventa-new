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
  stickyVerified: number | null;
  stickyApprovalReady: number | null;
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

async function sumSupplyToday(
  client: ReturnType<typeof createServerClient>,
): Promise<{ discovered: number; verified: number; topSource: string | null }> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { data, error } = await client
    .from(SUPPLY_RUN_TABLE)
    .select('source_id, candidates_discovered, verified_deals')
    .gte('finished_at', start.toISOString())
    .limit(500);
  if (error || !data) return { discovered: 0, verified: 0, topSource: null };

  let discovered = 0;
  let verified = 0;
  const bySource = new Map<string, number>();
  for (const row of data) {
    const d = Number((row as { candidates_discovered?: number }).candidates_discovered ?? 0);
    const v = Number((row as { verified_deals?: number }).verified_deals ?? 0);
    const sid = String((row as { source_id?: string }).source_id ?? '');
    discovered += Number.isFinite(d) ? d : 0;
    verified += Number.isFinite(v) ? v : 0;
    if (sid) bySource.set(sid, (bySource.get(sid) ?? 0) + (Number.isFinite(v) ? v : 0));
  }
  let topSource: string | null = null;
  let best = -1;
  for (const [sid, n] of bySource) {
    if (n > best) {
      best = n;
      topSource = sid;
    }
  }
  return { discovered, verified, topSource };
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

  const [pending, priceMemory, todaySums] = await Promise.all([
    getPendingHealth(client),
    getPriceMemoryHealth(client),
    client
      ? sumSupplyToday(client)
      : Promise.resolve({ discovered: 0, verified: 0, topSource: null as string | null }),
  ]);

  const discovered = client ? todaySums.discovered : null;
  const verified = client ? todaySums.verified : null;
  const highQuality = verified;
  const pendingModeration = pending.total ?? null;

  // Sticky/fresh split: se completa en corridas del engine (metrics en logs).
  // Aquí exponemos campos para CEO; valores null hasta que el último run los persista en memoria de health.
  const stickyObserved = priceMemory.rowsToday;
  const freshDiscovered = discovered;

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
  } else if ((discovered ?? 0) < SUPPLY_DAILY_TARGETS.discovered * 0.5) {
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
    approvalReady: null,
    highQuality,
    pendingModeration,
    stickyObserved,
    freshDiscovered,
    stickyVerified: null,
    stickyApprovalReady: null,
    freshVerified: verified,
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
