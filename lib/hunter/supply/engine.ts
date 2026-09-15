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
import { runSupplyRouter, applySupplyQualityPipeline, type RunSupplyRouterOptions } from './router';
import { SUPPLY_SOURCES } from './registry';
import {
  classifySupplyQuality,
  parseMlSourceDetail,
  type SupplyQualityBucket,
  type SupplyQualityReason,
} from './qualityClass';
import {
  emptySupplyTelemetryRollup,
  recordSupplyCandidateTelemetry,
  topKeysByGoodDeals,
  type SupplyTelemetryRollup,
} from './telemetry';
import { dedupeSupplyCandidates } from './candidate';
import { observeStickySkus, type StickyObserveReport } from './observeStickySkus';
import type { SupplyCandidate, SupplyRouterReport, SupplySource } from './types';

export type DiscoveryMode = 'sticky' | 'fresh' | 'unknown';

export type SupplyEngineCandidateView = {
  canonicalUrl: string;
  title: string | null;
  sourceId: string;
  sourceDetail: string | null;
  query: string | null;
  queryKind: 'q' | 'cat' | 'hl' | 'seed' | 'sticky' | 'unknown';
  discoveryMode: DiscoveryMode;
  merchant: string | null;
  categoryId: string | null;
  price: number | null;
  originalPrice: number | null;
  labelDiscountPercent: number | null;
  qualification: string | null;
  verifierDecision: string | null;
  qualityDecision: string | null;
  deal: DealSignals;
  moderationPriority: 1 | 2 | 3 | 4;
  nicheMatch: boolean;
  qualityBucket: SupplyQualityBucket;
  qualityReason: SupplyQualityReason;
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
  stickyCandidates: number;
  stickyObserved: number;
  stickyFailed: number;
  /** @deprecated alias stickyApiAttempted */
  stickyPdpAttempted: number;
  /** @deprecated alias stickyApiSuccess */
  stickyPdpSuccess: number;
  stickyApiAttempted: number;
  stickyApiSuccess: number;
  stickyApiBlocked: number;
  stickyNotFound: number;
  stickyPriceVerified: number;
  stickyEvidenceRich: number;
  stickySnapshotOnly: number;
  stickyVerified: number;
  stickyApprovalReady: number;
  stickyHistoryReady: number;
  stickyHistoricalLow: number;
  stickyPriceDrop: number;
  freshCandidates: number;
  freshVerified: number;
  freshApprovalReady: number;
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
  sticky: StickyObserveReport | null;
  ingest: IngestCycleReport | null;
  candidates: SupplyEngineCandidateView[];
  telemetry: SupplyTelemetryRollup;
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
  /** Sticky SKU observation. Default on (off en VITEST salvo enableSticky=true). */
  enableSticky?: boolean;
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
    stickyCandidates: 0,
    stickyObserved: 0,
    stickyFailed: 0,
    stickyPdpAttempted: 0,
    stickyPdpSuccess: 0,
    stickyApiAttempted: 0,
    stickyApiSuccess: 0,
    stickyApiBlocked: 0,
    stickyNotFound: 0,
    stickyPriceVerified: 0,
    stickyEvidenceRich: 0,
    stickySnapshotOnly: 0,
    stickyVerified: 0,
    stickyApprovalReady: 0,
    stickyHistoryReady: 0,
    stickyHistoricalLow: 0,
    stickyPriceDrop: 0,
    freshCandidates: 0,
    freshVerified: 0,
    freshApprovalReady: 0,
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
): { views: SupplyEngineCandidateView[]; filteredOut: number; telemetry: SupplyTelemetryRollup } {
  const views: SupplyEngineCandidateView[] = [];
  let filteredOut = 0;
  const telemetry = emptySupplyTelemetryRollup();
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
    const parsed = parseMlSourceDetail(c.ingestItem.sourceDetail);
    const quality = classifySupplyQuality({
      deal,
      qualification: c.qualification,
      verifierDecision: c.verifierDecision,
      price: c.price,
    });
    const approvalReady =
      (c.qualification === 'VERIFIED_DEAL' || c.qualification === 'PROMOTION') &&
      deal.priceClass !== 'false_discount' &&
      deal.dealScore >= 35;
    recordSupplyCandidateTelemetry(telemetry, {
      nicheId: niche.id,
      sourceId: c.sourceId,
      query: parsed.value,
      category: meta?.signals?.categoryId ?? null,
      merchant: c.seller ?? meta?.store ?? null,
      isUnique: true,
      isDuplicate: false,
      approvalReady,
      bucket: quality.bucket,
      priceClass: deal.priceClass,
      laneHint: deal.laneHint,
    });
    views.push({
      canonicalUrl: c.canonicalUrl,
      title: c.title,
      sourceId: c.sourceId,
      sourceDetail: c.ingestItem.sourceDetail ?? null,
      query: parsed.value,
      queryKind: parsed.kind,
      discoveryMode: parsed.discoveryMode,
      merchant: c.seller ?? meta?.store ?? null,
      categoryId: meta?.signals?.categoryId ?? null,
      price: c.price,
      originalPrice: c.originalPrice,
      labelDiscountPercent: c.discountPercent,
      qualification: c.qualification,
      verifierDecision: c.verifierDecision,
      qualityDecision: c.qualityDecision?.decision ?? null,
      deal,
      moderationPriority: moderationPriorityFromDealSignals(deal),
      nicheMatch: match,
      qualityBucket: quality.bucket,
      qualityReason: quality.reason,
    });
  }
  views.sort((a, b) => a.moderationPriority - b.moderationPriority || b.deal.dealScore - a.deal.dealScore);
  return { views, filteredOut, telemetry };
}

function isApprovalReady(v: SupplyEngineCandidateView): boolean {
  return (
    (v.qualification === 'VERIFIED_DEAL' || v.qualification === 'PROMOTION') &&
    v.deal.priceClass !== 'false_discount' &&
    v.deal.dealScore >= 35
  );
}

function buildMetrics(
  router: SupplyRouterReport,
  views: SupplyEngineCandidateView[],
  filteredOut: number,
  latencyMs: number,
  sticky: StickyObserveReport | null,
): SupplyEngineMetrics {
  const stickyViews = views.filter((v) => v.discoveryMode === 'sticky');
  const freshViews = views.filter((v) => v.discoveryMode !== 'sticky');
  const stickyApprovalReady = stickyViews.filter(isApprovalReady).length;
  const freshApprovalReady = freshViews.filter(isApprovalReady).length;
  const stickyVerified = stickyViews.filter(
    (v) => v.qualification === 'VERIFIED_DEAL' || v.qualification === 'PROMOTION',
  ).length;
  const freshVerified = freshViews.filter(
    (v) => v.qualification === 'VERIFIED_DEAL' || v.qualification === 'PROMOTION',
  ).length;
  return {
    discovered: router.candidatesDiscovered + (sticky?.stickyObserved ?? 0),
    unique: views.length,
    duplicates: router.duplicates,
    normalized: views.length,
    verified: stickyVerified + freshVerified,
    promotions: router.promotions,
    qualified: router.candidatesQualified + stickyVerified,
    approvalReady: stickyApprovalReady + freshApprovalReady,
    insufficientEvidence: views.filter((v) => v.deal.priceClass === 'insufficient_evidence').length,
    falseDiscounts: views.filter((v) => v.deal.priceClass === 'false_discount').length,
    historicalLows: views.filter((v) => v.deal.priceClass === 'historical_low').length,
    priceDrops: views.filter(
      (v) => v.deal.priceClass === 'recent_drop' || v.deal.priceClass === 'near_historical_low',
    ).length,
    anomalies: views.filter((v) => v.deal.laneHint === 'anomaly_review').length,
    rejected: router.rejected,
    sourceFailures: router.sourceFailures + (sticky?.stickyFailed ?? 0),
    nicheFilteredOut: filteredOut,
    topDealsLane: views.filter((v) => v.deal.laneHint === 'top_deals').length,
    dayToDayLane: views.filter((v) => v.deal.laneHint === 'day_to_day').length,
    stickyCandidates: sticky?.stickyCandidates ?? sticky?.stickyDiscovered ?? 0,
    stickyObserved: sticky?.stickyObserved ?? 0,
    stickyFailed: sticky?.stickyFailed ?? 0,
    stickyPdpAttempted: sticky?.stickyApiAttempted ?? sticky?.pdpAttempted ?? 0,
    stickyPdpSuccess: sticky?.stickyApiSuccess ?? sticky?.pdpSuccess ?? 0,
    stickyApiAttempted: sticky?.stickyApiAttempted ?? sticky?.pdpAttempted ?? 0,
    stickyApiSuccess: sticky?.stickyApiSuccess ?? sticky?.pdpSuccess ?? 0,
    stickyApiBlocked: sticky?.stickyApiBlocked ?? 0,
    stickyNotFound: sticky?.stickyNotFound ?? 0,
    stickyPriceVerified: sticky?.stickyPriceVerified ?? 0,
    stickyEvidenceRich: sticky?.stickyEvidenceRich ?? sticky?.evidenceRich ?? 0,
    stickySnapshotOnly: sticky?.snapshotOnly ?? 0,
    stickyVerified,
    stickyApprovalReady,
    stickyHistoryReady: stickyViews.filter((v) => v.deal.historyReady).length,
    stickyHistoricalLow: stickyViews.filter((v) => v.deal.priceClass === 'historical_low').length,
    stickyPriceDrop: stickyViews.filter(
      (v) => v.deal.priceClass === 'recent_drop' || v.deal.priceClass === 'near_historical_low',
    ).length,
    freshCandidates: router.candidatesDiscovered,
    freshVerified,
    freshApprovalReady,
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
      sticky: null,
      ingest: null,
      candidates: [],
      telemetry: emptySupplyTelemetryRollup(),
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

  // Sticky primero (Price Memory), luego fresh discovery — coexisten.
  let sticky: StickyObserveReport | null = null;
  const stickyEnabled =
    opts.enableSticky !== false &&
    !(process.env.VITEST === 'true' && opts.enableSticky !== true);
  if (stickyEnabled) {
    try {
      sticky = await observeStickySkus({
        config,
        nicheId: niche.id,
        persistSnapshots,
        supabase: opts.supabase ?? null,
        now,
      });
    } catch {
      sticky = {
        stickyCandidates: 0,
        stickyDiscovered: 0,
        stickyObserved: 0,
        stickyFailed: 1,
        stickySkippedCooldown: 0,
        pdpAttempted: 0,
        pdpSuccess: 0,
        stickyApiAttempted: 0,
        stickyApiSuccess: 0,
        stickyApiBlocked: 0,
        stickyNotFound: 0,
        stickyPriceVerified: 0,
        stickyEvidenceRich: 0,
        evidenceRich: 0,
        snapshotOnly: 0,
        candidates: [],
        targets: [],
        observations: [],
      };
    }
  } else {
    sticky = {
      stickyCandidates: 0,
      stickyDiscovered: 0,
      stickyObserved: 0,
      stickyFailed: 0,
      stickySkippedCooldown: 0,
      pdpAttempted: 0,
      pdpSuccess: 0,
      stickyApiAttempted: 0,
      stickyApiSuccess: 0,
      stickyApiBlocked: 0,
      stickyNotFound: 0,
      stickyPriceVerified: 0,
      stickyEvidenceRich: 0,
      evidenceRich: 0,
      snapshotOnly: 0,
      candidates: [],
      targets: [],
      observations: [],
    };
  }

  const stickyQualified = (sticky.candidates ?? []).map((c) =>
    applySupplyQualityPipeline(c, config),
  );

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

  const merged = dedupeSupplyCandidates([...stickyQualified, ...router.uniqueCandidates]);
  const { views, filteredOut, telemetry } = enrichCandidates(niche, merged.unique);
  const metrics = buildMetrics(router, views, filteredOut, Date.now() - t0, sticky);

  let ingest: IngestCycleReport | null = null;
  let wroteOffers = false;
  let note = `Supply Engine ${mode} · niche=${niche.id} · wave=${wave} · sticky=${sticky.stickyObserved} · fresh=${router.candidatesDiscovered}`;

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
    sticky,
    ingest,
    candidates: views.slice(0, 40),
    telemetry,
    note,
  };
}

/** Resumen liviano para logs/admin (sin payloads grandes). */
export function summarizeSupplyEngineReport(report: SupplyEngineReport) {
  const topQueries = topKeysByGoodDeals(report.telemetry.byQuery, 5).map((r) => ({
    query: r.key.split('|')[2] ?? r.key,
    good: r.good,
    approvalReady: r.approvalReady,
    discovered: r.discovered,
  }));
  const m = report.metrics;
  return {
    ok: report.ok,
    mode: report.mode,
    wroteOffers: report.wroteOffers,
    nicheId: report.niche?.id ?? null,
    wave: report.wave,
    metrics: m,
    stickyVsFresh: {
      stickyObserved: m.stickyObserved,
      stickyApiAttempted: m.stickyApiAttempted,
      stickyApiSuccess: m.stickyApiSuccess,
      stickyApiBlocked: m.stickyApiBlocked,
      stickyPriceVerified: m.stickyPriceVerified,
      stickyPdpSuccess: m.stickyApiSuccess,
      stickyEvidenceRich: m.stickyEvidenceRich,
      stickyVerified: m.stickyVerified,
      stickyHistoryReady: m.stickyHistoryReady,
      stickyHistoricalLow: m.stickyHistoricalLow,
      stickyPriceDrop: m.stickyPriceDrop,
      stickyApprovalReady: m.stickyApprovalReady,
      freshDiscovered: m.freshCandidates,
      freshVerified: m.freshVerified,
      freshApprovalReady: m.freshApprovalReady,
      bottleneck:
        m.stickyApiBlocked > 0 && m.stickyApiSuccess === 0
          ? 'sticky_api_blocked'
          : m.stickyObserved > 0 && m.stickyEvidenceRich === 0
            ? 'sticky_evidence_rich'
            : m.stickyEvidenceRich > 0 && m.stickyApprovalReady === 0
              ? 'sticky_quality_gates'
              : m.freshCandidates > 0 && m.freshApprovalReady === 0
                ? 'fresh_history_cold'
                : m.approvalReady > 0
                  ? 'none'
                  : 'discovery',
      approvalReadyRateSticky:
        m.stickyObserved > 0
          ? Math.round((m.stickyApprovalReady / m.stickyObserved) * 1000) / 10
          : null,
      approvalReadyRateFresh:
        m.freshCandidates > 0
          ? Math.round((m.freshApprovalReady / m.freshCandidates) * 1000) / 10
          : null,
    },
    topQueries,
    note: report.note,
    enabledNiches: enabledNicheProfiles().map((p) => p.id),
  };
}
