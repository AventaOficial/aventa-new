/**
 * Supply Engine — orquestador central.
 * 1 engine + N NicheHunterProfiles + pipeline de calidad existente (router/DQE/Evidence).
 *
 * Modes:
 * - shadow: collect+score, no snapshots DB, no insert
 * - dry_run: collect+score, snapshots opcionales, no insert
 * - enabled: dry_run path + ingest write solo si SUPPLY_ENGINE_WRITE=1
 *
 * Nunca auto-publica. Nunca toca money/rewards.
 */

import { loadBotIngestConfig, type BotIngestConfig } from '@/lib/bots/ingest/config';
import { runIngestCycleForProfile } from '@/lib/bots/ingest/runIngestCycle';
import type { IngestCycleReport } from '@/lib/bots/ingest/types';
import { computeSourceRotationWave } from '@/lib/bots/ingest/ingestZonedTime';
import { applyNicheProfileToIngestConfig, candidateMatchesNiche } from './applyNicheProfile';
import {
  computeDealSignals,
  moderationPriorityFromDealSignals,
  type DealSignals,
} from './dealSignals';
import {
  enabledNicheProfiles,
  nicheProfileById,
  parseSupplyEngineMode,
  pickNicheForWave,
  type NicheHunterProfile,
  type SupplyEngineMode,
} from './nicheProfiles';
import { runSupplyRouter, type RunSupplyRouterOptions } from './router';
import { SUPPLY_SOURCES } from './registry';
import type { SupplyCandidate, SupplyRouterReport, SupplySource } from './types';

export type SupplyEngineCandidateView = {
  canonicalUrl: string;
  title: string | null;
  sourceId: string;
  qualification: string | null;
  verifierDecision: string | null;
  deal: DealSignals;
  moderationPriority: 1 | 2 | 3 | 4;
  nicheMatch: boolean;
};

export type SupplyEngineMetrics = {
  discovered: number;
  unique: number;
  duplicates: number;
  normalized: number;
  verified: number;
  promotions: number;
  qualified: number;
  approvalReady: number;
  insufficientEvidence: number;
  falseDiscounts: number;
  historicalLows: number;
  priceDrops: number;
  anomalies: number;
  rejected: number;
  sourceFailures: number;
  nicheFilteredOut: number;
  topDealsLane: number;
  dayToDayLane: number;
  processingLatencyMs: number;
};

export type SupplyEngineReport = {
  ok: boolean;
  mode: SupplyEngineMode;
  wroteOffers: boolean;
  niche: Pick<NicheHunterProfile, 'id' | 'name' | 'lane' | 'priority'> | null;
  wave: number;
  startedAt: string;
  finishedAt: string;
  metrics: SupplyEngineMetrics;
  router: SupplyRouterReport | null;
  ingest: IngestCycleReport | null;
  candidates: SupplyEngineCandidateView[];
  note: string;
};

export type RunSupplyEngineOptions = {
  mode?: SupplyEngineMode;
  nicheId?: string | null;
  wave?: number | null;
  config?: BotIngestConfig;
  /** Fuerza insert vía ingest (además de mode=enabled). Default: env SUPPLY_ENGINE_WRITE. */
  allowWrite?: boolean;
  persistSnapshots?: boolean;
  sources?: SupplySource[];
  collectOverrides?: RunSupplyRouterOptions['collectOverrides'];
  hunterHealth?: RunSupplyRouterOptions['hunterHealth'];
  now?: Date;
  supabase?: RunSupplyRouterOptions['supabase'];
};

function emptyMetrics(latencyMs = 0): SupplyEngineMetrics {
  return {
    discovered: 0,
    unique: 0,
    duplicates: 0,
    normalized: 0,
    verified: 0,
    promotions: 0,
    qualified: 0,
    approvalReady: 0,
    insufficientEvidence: 0,
    falseDiscounts: 0,
    historicalLows: 0,
    priceDrops: 0,
    anomalies: 0,
    rejected: 0,
    sourceFailures: 0,
    nicheFilteredOut: 0,
    topDealsLane: 0,
    dayToDayLane: 0,
    processingLatencyMs: latencyMs,
  };
}

function resolveMode(opts: RunSupplyEngineOptions): SupplyEngineMode {
  if (opts.mode) return opts.mode;
  return parseSupplyEngineMode(process.env.SUPPLY_ENGINE_MODE);
}

function resolveWriteAllowed(mode: SupplyEngineMode, opts: RunSupplyEngineOptions): boolean {
  if (mode !== 'enabled') return false;
  if (typeof opts.allowWrite === 'boolean') return opts.allowWrite;
  const env = (process.env.SUPPLY_ENGINE_WRITE ?? '').trim().toLowerCase();
  return env === '1' || env === 'true' || env === 'yes';
}

function filterSourcesForNiche(niche: NicheHunterProfile, sources: SupplySource[]): SupplySource[] {
  if (!niche.allowedSources.length) return sources;
  const allow = new Set(niche.allowedSources);
  // Community siempre puede coexistir como lane separado; el engine de nicho no la fuerza.
  return sources.filter((s) => allow.has(s.id));
}

function enrichCandidates(
  niche: NicheHunterProfile,
  unique: SupplyCandidate[],
): { views: SupplyEngineCandidateView[]; filteredOut: number } {
  const views: SupplyEngineCandidateView[] = [];
  let filteredOut = 0;
  for (const c of unique) {
    const meta = c.ingestItem.precomputedMeta;
    const match = candidateMatchesNiche(niche, {
      category: niche.categories[0] ?? null,
      mlCategoryId: meta?.signals?.categoryId ?? null,
      title: c.title,
      price: c.price,
    });
    if (
      typeof c.price === 'number' &&
      ((niche.priceMin != null && c.price < niche.priceMin) ||
        (niche.priceMax != null && c.price > niche.priceMax))
    ) {
      filteredOut += 1;
      continue;
    }
    const deal = meta
      ? computeDealSignals({ meta, signals: meta.signals ?? null })
      : computeDealSignals({
          meta: {
            discountPrice: c.price,
            originalPrice: c.originalPrice,
            discountPercent: c.discountPercent,
          },
          signals: null,
        });
    views.push({
      canonicalUrl: c.canonicalUrl,
      title: c.title,
      sourceId: c.sourceId,
      qualification: c.qualification,
      verifierDecision: c.verifierDecision,
      deal,
      moderationPriority: moderationPriorityFromDealSignals(deal),
      nicheMatch: match,
    });
  }
  views.sort((a, b) => a.moderationPriority - b.moderationPriority || b.deal.dealScore - a.deal.dealScore);
  return { views, filteredOut };
}

function buildMetrics(
  router: SupplyRouterReport,
  views: SupplyEngineCandidateView[],
  filteredOut: number,
  latencyMs: number,
): SupplyEngineMetrics {
  return {
    discovered: router.candidatesDiscovered,
    unique: router.uniqueCandidates.length,
    duplicates: router.duplicates,
    normalized: views.length,
    verified: router.verifiedDeals,
    promotions: router.promotions,
    qualified: router.candidatesQualified,
    approvalReady: views.filter(
      (v) =>
        (v.qualification === 'VERIFIED_DEAL' || v.qualification === 'PROMOTION') &&
        v.deal.priceClass !== 'false_discount' &&
        v.deal.dealScore >= 35,
    ).length,
    insufficientEvidence: views.filter((v) => v.deal.priceClass === 'insufficient_evidence').length,
    falseDiscounts: views.filter((v) => v.deal.priceClass === 'false_discount').length,
    historicalLows: views.filter((v) => v.deal.priceClass === 'historical_low').length,
    priceDrops: views.filter(
      (v) => v.deal.priceClass === 'recent_drop' || v.deal.priceClass === 'near_historical_low',
    ).length,
    anomalies: views.filter((v) => v.deal.laneHint === 'anomaly_review').length,
    rejected: router.rejected,
    sourceFailures: router.sourceFailures,
    nicheFilteredOut: filteredOut,
    topDealsLane: views.filter((v) => v.deal.laneHint === 'top_deals').length,
    dayToDayLane: views.filter((v) => v.deal.laneHint === 'day_to_day').length,
    processingLatencyMs: latencyMs,
  };
}

/**
 * Ejecuta una corrida del Supply Engine para un nicho (o rotación por wave).
 */
export async function runSupplyEngine(
  opts: RunSupplyEngineOptions = {},
): Promise<SupplyEngineReport> {
  const t0 = Date.now();
  const startedAt = new Date().toISOString();
  const now = opts.now ?? new Date();
  const mode = resolveMode(opts);
  const base = opts.config ?? loadBotIngestConfig('standard');
  const wave =
    typeof opts.wave === 'number' && Number.isFinite(opts.wave)
      ? Math.floor(opts.wave)
      : computeSourceRotationWave(now, base.timezone);

  const niche =
    (opts.nicheId ? nicheProfileById(opts.nicheId) : null) ?? pickNicheForWave(wave);

  if (!niche) {
    return {
      ok: false,
      mode,
      wroteOffers: false,
      niche: null,
      wave,
      startedAt,
      finishedAt: new Date().toISOString(),
      metrics: emptyMetrics(Date.now() - t0),
      router: null,
      ingest: null,
      candidates: [],
      note: 'No hay NicheHunterProfiles enabled',
    };
  }

  const config = applyNicheProfileToIngestConfig(base, niche);
  const sources = filterSourcesForNiche(niche, opts.sources ?? [...SUPPLY_SOURCES]);
  const persistSnapshots =
    mode === 'shadow'
      ? false
      : opts.persistSnapshots === true ||
        (opts.persistSnapshots !== false && process.env.VITEST !== 'true');

  const router = await runSupplyRouter({
    config,
    sources,
    rotationWave: wave,
    now,
    persistSnapshots,
    collectOverrides: opts.collectOverrides,
    hunterHealth: opts.hunterHealth,
    supabase: opts.supabase,
  });

  const { views, filteredOut } = enrichCandidates(niche, router.uniqueCandidates);
  const metrics = buildMetrics(router, views, filteredOut, Date.now() - t0);

  let ingest: IngestCycleReport | null = null;
  let wroteOffers = false;
  let note = `Supply Engine ${mode} · niche=${niche.id} · wave=${wave}`;

  if (resolveWriteAllowed(mode, opts)) {
    ingest = await runIngestCycleForProfile('standard', new Date().toISOString(), { config });
    wroteOffers = (ingest.summary.inserted ?? 0) > 0;
    note += ` · write attempted (inserted=${ingest.summary.inserted})`;
  } else if (mode === 'enabled') {
    note += ' · write blocked (set SUPPLY_ENGINE_WRITE=1 to insert)';
  } else {
    note += ' · no offer writes';
  }

  return {
    ok: true,
    mode,
    wroteOffers,
    niche: { id: niche.id, name: niche.name, lane: niche.lane, priority: niche.priority },
    wave,
    startedAt,
    finishedAt: new Date().toISOString(),
    metrics: { ...metrics, processingLatencyMs: Date.now() - t0 },
    router,
    ingest,
    candidates: views.slice(0, 40),
    note,
  };
}

/** Resumen liviano para logs/admin (sin payloads grandes). */
export function summarizeSupplyEngineReport(report: SupplyEngineReport) {
  return {
    ok: report.ok,
    mode: report.mode,
    wroteOffers: report.wroteOffers,
    nicheId: report.niche?.id ?? null,
    wave: report.wave,
    metrics: report.metrics,
    note: report.note,
    enabledNiches: enabledNicheProfiles().map((p) => p.id),
  };
}
