/**
 * SupplyRouter. No aprueba, no publica, no paga, no toca rewards, no salta verifier.
 * No persiste. Collect aislado por source.
 */
import { loadBotIngestConfig, type BotIngestConfig } from '@/lib/bots/ingest/config';
import { decideAutonomous } from '@/lib/autonomous/decide';
import { buildAutonomousInput } from '@/lib/autonomous/observe';
import { shouldAttemptCollect } from '@/lib/hunter/circuitBreaker';
import type { HunterSourceHealth } from '@/lib/hunter/types';
import { HUNTER_SOURCES } from '@/lib/hunter/sources';
import { evaluateDealSafe } from '@/lib/verifier/evaluateDeal';
import { allocateSourceSlots, mergeSupplyPriorityPolicy, sortSupplySources } from './priority';
import { assertSupplyInvariants, SUPPLY_SOURCES } from './registry';
import { dedupeSupplyCandidates } from './candidate';
import { computeGlobalSupplyStatus, recommendedSupplyAction } from './health';
import { recordSupplyRouterRun } from './metrics';
import { persistSupplyRouterReport } from './persistSnapshots';
import type {
  SupplyCandidate,
  SupplyCollectContext,
  SupplyCollectResult,
  SupplyPriorityPolicy,
  SupplyRouterReport,
  SupplySource,
  SupplySourceId,
  SupplySourceRun,
} from './types';

export type RunSupplyRouterOptions = {
  config?: BotIngestConfig;
  communityUrls?: string[];
  sources?: SupplySource[];
  hunterHealth?: Map<string, HunterSourceHealth>;
  policy?: Partial<SupplyPriorityPolicy>;
  collectOverrides?: Partial<Record<SupplySourceId, (ctx: SupplyCollectContext) => Promise<SupplyCollectResult>>>;
  rotationWave?: number;
  now?: Date;
  /** Siempre false: este router no inserta ofertas. */
  persist?: false;
  /** Observabilidad persistida. Default on fuera de tests. Nunca publica. */
  persistSnapshots?: boolean;
  supabase?: import('@supabase/supabase-js').SupabaseClient | null;
};

function emptyRun(source: SupplySource, patch: Partial<SupplySourceRun>): SupplySourceRun {
  return {
    sourceId: source.id,
    family: source.family,
    type: source.type,
    attempted: false,
    skippedReason: null,
    ok: true,
    candidates: 0,
    unique: 0,
    verifiedDeals: 0,
    promotions: 0,
    catalogOnly: 0,
    duplicates: 0,
    errors: 0,
    fallbackFrom: null,
    isolatedFailure: false,
    ...patch,
  };
}

function applyQualityPipeline(
  candidate: SupplyCandidate,
  config: BotIngestConfig,
): SupplyCandidate {
  const meta = candidate.ingestItem.precomputedMeta;
  if (!meta) return candidate;
  const verifier = evaluateDealSafe({
    meta,
    config,
    source: candidate.ingestItem.source,
    url: candidate.canonicalUrl,
    duplicateChecked: true,
  });
  const auto = decideAutonomous(
    buildAutonomousInput({
      verifier,
      meta,
      source: candidate.ingestItem.source,
      config,
      sourceHealth: null,
    }),
  );
  return {
    ...candidate,
    verifierDecision: verifier.decision,
    autonomousDecision: auto.decision,
  };
}

export async function runSupplyRouter(
  opts: RunSupplyRouterOptions = {},
): Promise<SupplyRouterReport> {
  const startedAt = new Date().toISOString();
  const now = opts.now ?? new Date();
  const config = opts.config ?? loadBotIngestConfig();
  const policy = mergeSupplyPriorityPolicy(opts.policy);
  const sources = sortSupplySources(opts.sources ?? SUPPLY_SOURCES, policy);
  for (const s of sources) assertSupplyInvariants(s);

  const hunterCtx = {
    config,
    rotationWave: opts.rotationWave ?? 0,
    now,
  };
  const baseCtx: Omit<SupplyCollectContext, 'hunterSource'> = {
    hunterCtx,
    communityUrls: opts.communityUrls ?? [],
    now,
  };

  const rawBySource = new Map<SupplySourceId, SupplyCandidate[]>();
  const runs = new Map<SupplySourceId, SupplySourceRun>();
  let sourceFailures = 0;

  const tryCollect = async (
    source: SupplySource,
    fallbackFrom: SupplySourceId | null = null,
  ) => {
    if (runs.has(source.id) && runs.get(source.id)!.attempted) return;
    const enabled = source.isEnabled({ ...baseCtx, hunterSource: null });
    const configured = source.isConfigured({ ...baseCtx, hunterSource: null });
    if (!enabled) {
      runs.set(source.id, emptyRun(source, { skippedReason: 'disabled' }));
      return;
    }
    if (!configured) {
      runs.set(source.id, emptyRun(source, { skippedReason: 'not_configured' }));
      return;
    }
    const hunterId = source.hunterSourceId;
    const health = hunterId ? opts.hunterHealth?.get(hunterId) : undefined;
    if (health && !shouldAttemptCollect(health, now).attempt) {
      runs.set(source.id, emptyRun(source, { skippedReason: 'circuit_open', ok: true }));
      return;
    }
    if (health?.status === 'down') {
      runs.set(source.id, emptyRun(source, { skippedReason: 'down' }));
      return;
    }

    const hunterSource = hunterId ? HUNTER_SOURCES.find((h) => h.id === hunterId) ?? null : null;
    const ctx: SupplyCollectContext = { ...baseCtx, hunterSource };
    try {
      const collectFn = opts.collectOverrides?.[source.id] ?? ((c: SupplyCollectContext) => source.collect(c));
      const out = await collectFn(ctx);
      rawBySource.set(source.id, out.candidates);
      runs.set(
        source.id,
        emptyRun(source, {
          attempted: true,
          ok: out.ok,
          candidates: out.candidates.length,
          errors: out.ok ? 0 : 1,
          fallbackFrom,
        }),
      );
      if (!out.ok) sourceFailures += 1;
    } catch {
      sourceFailures += 1;
      rawBySource.set(source.id, []);
      runs.set(
        source.id,
        emptyRun(source, {
          attempted: true,
          ok: false,
          errors: 1,
          isolatedFailure: true,
          fallbackFrom,
        }),
      );
    }
  };

  for (const source of sources) {
    await tryCollect(source);
  }

  const mlApi = runs.get('ml_api_legacy');
  const mlWorker = sources.find((s) => s.id === 'ml_worker');
  const apiFailed = Boolean(
    mlApi && (mlApi.skippedReason === 'down' || mlApi.skippedReason === 'circuit_open' || mlApi.ok === false),
  );
  if (mlWorker && apiFailed) {
    const existing = runs.get('ml_worker');
    if (!existing?.attempted) {
      await tryCollect(mlWorker, 'ml_api_legacy');
    } else if (existing.ok) {
      runs.set('ml_worker', { ...existing, fallbackFrom: 'ml_api_legacy' });
    }
  }

  const incoming = new Map<string, number>();
  for (const [id, list] of rawBySource) incoming.set(id, list.length);
  const slots = allocateSourceSlots(sources, incoming, policy);

  const sliced: SupplyCandidate[] = [];
  for (const source of sources) {
    const list = [...(rawBySource.get(source.id) ?? [])].sort((a, b) =>
      a.canonicalUrl.localeCompare(b.canonicalUrl),
    );
    const cap = slots.get(source.id) ?? 0;
    sliced.push(...list.slice(0, cap));
  }

  const { unique, duplicates } = dedupeSupplyCandidates(sliced);
  const processed = unique.map((c) => applyQualityPipeline(c, config));

  const verifiedDeals = processed.filter((c) => c.qualification === 'VERIFIED_DEAL').length;
  const promotions = processed.filter((c) => c.qualification === 'PROMOTION').length;
  const catalogOnly = processed.filter(
    (c) => c.qualification === 'NO_VERIFIED_DEAL' || c.qualification == null,
  ).length;
  const communityUnique = processed.filter((c) => c.sourceId === 'community');
  const machineUnique = processed.filter((c) => c.sourceId !== 'community');
  const communityVerified = communityUnique.filter((c) => c.qualification === 'VERIFIED_DEAL').length;
  const machineVerified = machineUnique.filter((c) => c.qualification === 'VERIFIED_DEAL').length;
  const rejected = processed.filter((c) => c.verifierDecision === 'reject').length;
  const pending = processed.filter(
    (c) => c.verifierDecision === 'review' || c.verifierDecision == null,
  ).length;

  for (const source of sources) {
    const run = runs.get(source.id) ?? emptyRun(source, { skippedReason: 'not_selected' });
    const mine = processed.filter((c) => c.sourceId === source.id);
    const dups = duplicates.filter((c) => c.sourceId === source.id);
    runs.set(source.id, {
      ...run,
      unique: mine.length,
      verifiedDeals: mine.filter((c) => c.qualification === 'VERIFIED_DEAL').length,
      promotions: mine.filter((c) => c.qualification === 'PROMOTION').length,
      catalogOnly: mine.filter((c) => c.qualification === 'NO_VERIFIED_DEAL' || c.qualification == null)
        .length,
      duplicates: dups.length,
    });
  }

  const discovered = sliced.length;
  const families = new Set(
    processed.filter((c) => c.qualification === 'VERIFIED_DEAL').map((c) => c.sourceFamily),
  );
  if (communityUnique.length > 0) families.add('community');

  const machineHealthy = [...runs.values()].filter(
    (r) => r.sourceId !== 'community' && r.attempted && r.ok,
  ).length;
  const machineDown = [...runs.values()].filter(
    (r) => r.sourceId !== 'community' && (r.skippedReason === 'down' || r.isolatedFailure),
  ).length;
  const machineDegraded = [...runs.values()].filter(
    (r) => r.sourceId !== 'community' && r.skippedReason === 'circuit_open',
  ).length;

  const report: SupplyRouterReport = {
    persisted: false,
    published: false,
    inserted: false,
    rewardsTouched: false,
    verifierBypassed: false,
    startedAt,
    finishedAt: new Date().toISOString(),
    globalStatus: computeGlobalSupplyStatus({
      machineHealthy,
      machineDegraded,
      machineDown,
      communityAvailable: true,
      verifiedDeals,
      familiesContributing: Math.max(families.size, communityUnique.length > 0 ? 1 : 0),
    }),
    recommendedAction: '',
    candidatesDiscovered: discovered,
    candidatesQualified: processed.filter((c) => c.qualification != null).length,
    verifiedDeals,
    promotions,
    catalogOnly,
    duplicates: duplicates.length,
    rejected,
    pending,
    sourceFailures,
    communityShare: discovered > 0 ? Math.round((communityUnique.length / processed.length || 0) * 1000) / 10 : 0,
    machineShare: discovered > 0 ? Math.round((machineUnique.length / processed.length || 0) * 1000) / 10 : 0,
    verifiedDealRate: processed.length > 0 ? Math.round((verifiedDeals / processed.length) * 1000) / 10 : 0,
    duplicateRate: discovered > 0 ? Math.round((duplicates.length / discovered) * 1000) / 10 : 0,
    communityVerified,
    machineVerified,
    runs: [...runs.values()],
    uniqueCandidates: processed,
    duplicateCandidates: duplicates,
  };
  if (processed.length > 0) {
    report.communityShare = Math.round((communityUnique.length / processed.length) * 1000) / 10;
    report.machineShare = Math.round((machineUnique.length / processed.length) * 1000) / 10;
  }
  report.recommendedAction = recommendedSupplyAction(report);
  recordSupplyRouterRun(report);
  const persistSnapshots =
    opts.persistSnapshots === true ||
    (opts.persistSnapshots !== false && process.env.VITEST !== 'true');
  if (persistSnapshots) {
    await persistSupplyRouterReport(report, {
      runId: crypto.randomUUID(),
      supabase: opts.supabase,
    });
  }
  return report;
}
