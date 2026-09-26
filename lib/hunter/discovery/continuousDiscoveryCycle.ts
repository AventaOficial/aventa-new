/**
 * Day 3 — Single continuous discovery cycle authority.
 *
 * TRIGGER → DISCOVERY (multi-source, isolated) → canonicalize/dedupe →
 * Offer Standard + Price Memory priority → enrich → DQE → S6.1 → optional S7 mint.
 *
 * Does NOT paste URLs. Does NOT bypass DQE/S6.1. Does NOT create a second writer.
 * Reuses runHunterCollect + sticky near-ready + prioritizeAcquisitionPool + S7.
 */

import { randomUUID } from 'node:crypto';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import type { IngestItem } from '@/lib/bots/ingest/types';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import {
  buildAutomationCycleMetrics,
  emptyAutomationCycleCounts,
  accumulateAutomationOutcome,
  classifyAutomationOutcome,
  type AutomationCycleMetrics,
  type AutomationCycleOutcome,
} from '@/lib/bots/ingest/automationCycleMetrics';
import { ML_PRICE_MIN_HISTORY_DAYS } from '@/lib/bots/ingest/mlPriceEngine';
import { evaluateMachineCandidateGate } from '@/lib/bots/ingest/candidateInsertGate';
import { enrichWithPriceIntel } from '@/lib/bots/ingest/priceIntel';
import { withMachinePendingWritesEnabled } from '@/lib/bots/ingest/machineInsertCanary';
import { isMachinePendingWriteEnabled } from '@/lib/bots/ingest/machineLiveInsertEligibility';
import {
  buildCycleFunnelSummaryFromDiscovery,
  type CycleFunnelSummary,
} from '@/lib/bots/ingest/cycleFunnelSummary';
import { evaluateDealQualityFromParsedMeta } from '@/lib/hunter/dealQuality';
import { prioritizeAcquisitionPool } from '@/lib/hunter/offerStandard';
import { runHunterCollect } from '@/lib/hunter/engine';
import { dedupeHunterCandidates } from '@/lib/hunter/normalize';
import { HUNTER_SOURCES } from '@/lib/hunter/sources';
import type {
  HunterCandidate,
  HunterRunMetrics,
  HunterSource,
} from '@/lib/hunter/types';
import { observeStickySkuViaServer } from '@/lib/hunter/supply/observeStickySkus';
import { selectNearReadyStickyTargets } from '@/lib/hunter/supply/nearReadySticky';
import {
  assignPrimaryTerminalReason,
  type VerifiedYieldCandidateTrace,
  type VerifiedYieldTerminalReason,
} from './verifiedYieldTerminal';
import {
  bumpTerminalReason,
  emptyVerifiedYieldFunnel,
  finalizeVerifiedYieldRates,
  type VerifiedYieldFunnel,
} from './verifiedYieldFunnel';
import { strongProductFingerprintForUrl } from '@/lib/offers/findDuplicateOffer';
import { extractMercadoLibreItemId, extractAmazonAsin } from '@/lib/offers/offerUrlFingerprint';
import { extractLiverpoolProductId } from '@/lib/offers/urlResolution/liverpoolResolver';
import { writePendingViaS7Bridge } from '@/lib/supply/s7Bridge/writePendingViaS7Bridge';
import {
  collectStickyNearReadyCandidates,
  collectPmEvidenceBackedCandidates,
  collectHistoryReadyReactivationCandidates,
  STICKY_NEAR_READY_SOURCE_ID,
  STICKY_HISTORY_READY_SOURCE_ID,
  PM_EVIDENCE_SOURCE_ID,
} from './stickyNearReadySource';
import { metaFromDiscoveryEvidenceForProduct } from './censusSeedEnrichment';
import {
  classifySourceDiscoveryStatus,
  legacyStatusFromCanonical,
  type SourceDiscoveryStatus,
} from './sourceDiscoveryStatus';
import {
  emptySourceFunnel,
  upsertSourceFunnel,
  formatSourceFunnelLog,
  type SourceFunnelStageCounts,
} from '@/lib/bots/ingest/sourceFunnelMetrics';
import {
  persistContinuousDiscoveryTruth,
  persistDeadlineDiscoverySnapshot,
  seedDiscoveryCycleSnapshot,
} from './persistContinuousDiscoveryTruth';
import {
  diagnoseProvenanceCompleteness,
  appendProvenanceDiagnostics,
} from './provenanceCompleteness';
import {
  buildCandidateObservation,
  normalizeOriginalRecoveredVia,
  type AcquisitionPath,
  type DiscoveryCandidateObservation,
  type OriginalRecoveredVia,
} from './discoveryObservability';
import {
  buildHistoryReadyActivationFromTraces,
  loadHistoryReadyCensus,
  type HistoryReadyActivationReport,
} from './historyReadyActivation';
import {
  createDeadlineContext,
  raceWithBudget,
  type DeadlineBudgetSnapshot,
  type DeadlineContext,
  type DeadlineStage,
} from './deadlineBudget';
import { claimDiscoveryCycle } from './discoveryCycleLease';
import {
  resolveContinuousExecutionMode,
  SCHEDULED_CONTINUOUS_DEADLINE_MS,
  SCHEDULED_CONTINUOUS_MAX_PRIORITIZED,
} from './continuousCronContract';

export type DiscoverySourceStatus =
  | 'success'
  | 'blocked'
  | 'retryable'
  | 'failed'
  | 'skipped'
  | 'empty';

export type DiscoverySourceOutcome = {
  sourceId: string;
  status: DiscoverySourceStatus;
  /** Day 6 canonical status (SUCCESS / BLOCKED_EXTERNAL / …). */
  canonicalStatus: SourceDiscoveryStatus;
  candidates: number;
  errorCode: string | null;
  errorMessageSafe: string | null;
};

export type DiscoveryCycleFunnel = {
  cycle_id: string;
  sources_requested: number;
  sources_succeeded: number;
  sources_blocked: number;
  sources_failed: number;
  sources_empty: number;
  candidates_discovered: number;
  candidates_canonicalized: number;
  duplicates: number;
  unsupported: number;
  invalid: number;
  fetch_attempted: number;
  fetch_success: number;
  fetch_blocked: number;
  fetch_failed: number;
  extracted: number;
  identified: number;
  price_memory_ready: number;
  price_memory_not_ready: number;
  offer_standard_pass: number;
  dqe_verified: number;
  dqe_potential: number;
  dqe_blocked: number;
  dqe_failed: number;
  s61_pass: number;
  s61_blocked: number;
  s7_pass: number;
  s7_blocked: number;
  observations_created: number;
  pending_created: number;
  dry_run: boolean;
};

export type DiscoveryCycleReport = {
  cycle_id: string;
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  mintAttempted: boolean;
  sources: DiscoverySourceOutcome[];
  funnel: DiscoveryCycleFunnel;
  /** Extended CycleFunnelSummary (same authority family as bot-ingest). */
  cycleFunnel: CycleFunnelSummary;
  automation: AutomationCycleMetrics;
  prioritizedUrls: string[];
  gateSamples: Array<{
    url: string;
    qualityDecision: string;
    wouldInsert: boolean;
    historyReady: boolean;
    reasonCodes: string[];
    /** Day 12 — structured provenance gap (observe-only). */
    provenanceGap?: string;
    /** Day 12.1 — how original was recovered (observe-only). */
    originalRecoveredVia?: OriginalRecoveredVia | null;
    acquisitionPath?: AcquisitionPath;
  }>;
  /**
   * Day 12.1 — durable per-candidate observability (capped).
   * Diagnostics only; does not replace DQE/S6.1 authority.
   */
  candidateObservations?: DiscoveryCandidateObservation[];
  mintResults: Array<{
    url: string;
    ok: boolean;
    offerId?: string;
    duplicate?: boolean;
    error?: string;
  }>;
  hunterSourceRuns: HunterRunMetrics[];
  operator_verdict: string;
  /** Day 6 — per-source funnel stages. */
  bySource: Record<string, SourceFunnelStageCounts>;
  /** Day 7 — VERIFIED-yield funnel + terminal diagnosis. */
  verifiedYield: VerifiedYieldFunnel;
  terminalTraces: VerifiedYieldCandidateTrace[];
  /** Day 8 — durable persist outcome (fail-open). */
  truthPersist?: {
    supplyTruth: { attempted: number; persisted: number; duplicates: number; failed: number };
    snapshot: { persisted: boolean; reason?: string };
  };
  /** Day 10 — wall-clock budget accounting (null when no soft deadline). */
  deadlineBudget?: DeadlineBudgetSnapshot | null;
  /** Day 11 — historyReady activation & conversion measurement. */
  historyReadyActivation?: HistoryReadyActivationReport | null;
};

export type RunContinuousDiscoveryCycleOptions = {
  config?: BotIngestConfig;
  /** Exclude manual paste source from continuous mode (default true). */
  excludeEnvUrls?: boolean;
  /** Include Price Memory near-ready discovery (default true). */
  includeStickyNearReady?: boolean;
  rotationWave?: number;
  maxPrioritized?: number;
  /** When true (default), evaluate gates but never mint. */
  dryRun?: boolean;
  /** Staging mint via S7 when gates pass (requires writes flag in-process). */
  allowStagingMint?: boolean;
  /** Cap mint inserts. */
  mintCap?: number;
  /** When true (default), persist Supply Truth + cycle snapshot (fail-open). */
  persistTruth?: boolean;
  /**
   * Scheduled production cron. Fail-closed: forces dry-run and forbids mint
   * even if allowStagingMint is also passed.
   */
  cronSafe?: boolean;
  /** Soft stop before Vercel maxDuration so snapshot/truth can persist. */
  deadlineMs?: number;
  /** Day 10 — override stage caps (tests/canaries only). */
  deadlineStageCaps?: Partial<Record<DeadlineStage, number>>;
  /** Stable id for cron-hour retries (upsert). Defaults to random UUID. */
  cycleId?: string;
  /** Test double for the cycle lease. Production uses the service-role client. */
  leaseSupabase?: import('@supabase/supabase-js').SupabaseClient | null;
  now?: Date;
};

function isHomepageOrNonProduct(url: string): boolean {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, '') || '/';
    if (path === '/' || path === '') return true;
    if (/^\/(ofertas|categorias?|ayuda|login|registration|gz)(\/|$)/i.test(path)) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

function classifyHunterRun(run: HunterRunMetrics): DiscoverySourceOutcome {
  const canonicalStatus = classifySourceDiscoveryStatus({
    skippedDisabled: run.skippedDisabled,
    skippedByBreaker: run.skippedByBreaker,
    ok: run.ok,
    itemsFound: run.itemsFound,
    errorCode: run.errorCode,
    errorMessageSafe: run.errorMessageSafe,
  });
  return {
    sourceId: run.sourceId,
    status: legacyStatusFromCanonical(canonicalStatus),
    canonicalStatus,
    candidates: run.ok && !run.skippedDisabled && !run.skippedByBreaker ? run.itemsFound : 0,
    errorCode: run.errorCode ?? null,
    errorMessageSafe: run.errorMessageSafe ?? null,
  };
}

function classifyStickyResult(result: {
  ok: boolean;
  candidates: number;
  errorCode?: string | null;
  errorMessageSafe?: string | null;
}): DiscoverySourceOutcome {
  const canonicalStatus = classifySourceDiscoveryStatus({
    ok: result.ok,
    itemsFound: result.candidates,
    errorCode: result.errorCode,
    errorMessageSafe: result.errorMessageSafe,
  });
  return {
    sourceId: STICKY_NEAR_READY_SOURCE_ID,
    status: legacyStatusFromCanonical(canonicalStatus),
    canonicalStatus,
    candidates: result.ok ? result.candidates : 0,
    errorCode: result.errorCode ?? null,
    errorMessageSafe: result.errorMessageSafe ?? null,
  };
}

function emptyFunnel(cycleId: string, dryRun: boolean): DiscoveryCycleFunnel {
  return {
    cycle_id: cycleId,
    sources_requested: 0,
    sources_succeeded: 0,
    sources_blocked: 0,
    sources_failed: 0,
    sources_empty: 0,
    candidates_discovered: 0,
    candidates_canonicalized: 0,
    duplicates: 0,
    unsupported: 0,
    invalid: 0,
    fetch_attempted: 0,
    fetch_success: 0,
    fetch_blocked: 0,
    fetch_failed: 0,
    extracted: 0,
    identified: 0,
    price_memory_ready: 0,
    price_memory_not_ready: 0,
    offer_standard_pass: 0,
    dqe_verified: 0,
    dqe_potential: 0,
    dqe_blocked: 0,
    dqe_failed: 0,
    s61_pass: 0,
    s61_blocked: 0,
    s7_pass: 0,
    s7_blocked: 0,
    observations_created: 0,
    pending_created: 0,
    dry_run: dryRun,
  };
}

function selectContinuousSources(excludeEnvUrls: boolean): HunterSource[] {
  return HUNTER_SOURCES.filter((s) => {
    if (s.id === 'ml_worker') return false; // external POST path — not inline collect
    if (excludeEnvUrls && s.id === 'env_urls') return false;
    return true;
  });
}

type EnrichCandidateResult = {
  meta: ParsedOfferMetadata | null;
  fetchBlocked: boolean;
  /** Day 12.1 — how original was obtained during sticky observe (null if N/A). */
  originalRecoveredVia: OriginalRecoveredVia | null;
  acquisitionPath: AcquisitionPath;
};

function discoverySourceIdForCandidate(cand: {
  source: string;
  rawMetadata?: Record<string, unknown>;
}): string {
  const ds = cand.rawMetadata?.discoverySource;
  return typeof ds === 'string' && ds.trim() ? ds : String(cand.source);
}

function pushTerminalTrace(
  traces: VerifiedYieldCandidateTrace[],
  trace: VerifiedYieldCandidateTrace,
): void {
  if (traces.length < 50) traces.push(trace);
}

function automationOutcomeFromTerminal(
  terminal: VerifiedYieldTerminalReason,
  reasonCodes: string[],
  opts?: { dryRun?: boolean; fetchBlocked?: boolean },
): AutomationCycleOutcome {
  const skipReason = [
    opts?.fetchBlocked ? 'fetch_blocked' : '',
    terminal.toLowerCase(),
    ...reasonCodes,
  ]
    .filter(Boolean)
    .join('|');
  return classifyAutomationOutcome({
    status: 'skipped',
    skipReason,
    dryRun: opts?.dryRun,
  });
}

async function enrichCandidateMeta(
  cand: HunterCandidate,
  config: BotIngestConfig,
  funnel: DiscoveryCycleFunnel,
): Promise<EnrichCandidateResult> {
  let meta = cand.ingestItem.precomputedMeta ?? null;
  let fetchBlocked = false;
  let originalRecoveredVia: OriginalRecoveredVia | null = null;
  let acquisitionPath: AcquisitionPath = meta ? 'precomputed_only' : 'unknown';
  const productId =
    typeof cand.rawMetadata?.productId === 'string'
      ? cand.rawMetadata.productId
      : extractMercadoLibreItemId(cand.url);

  const isPmDriven = cand.rawMetadata?.priceMemoryDriven === true;
  if (isPmDriven && productId) {
    funnel.fetch_attempted += 1;
    let liveOk = false;
    try {
      const obs = await observeStickySkuViaServer({
        productId,
        nicheId: 'continuous_discovery',
        persistSnapshots: true,
      });
      if (obs.observationStatus === 'source_blocked') {
        funnel.fetch_blocked += 1;
        fetchBlocked = true;
      } else if (obs.meta) {
        funnel.fetch_success += 1;
        meta = obs.meta;
        liveOk = true;
        acquisitionPath = 'sticky_observe';
        originalRecoveredVia = normalizeOriginalRecoveredVia(
          obs.provenance?.originalRecoveredVia,
        );
      } else {
        funnel.fetch_failed += 1;
      }
    } catch {
      funnel.fetch_failed += 1;
    }

    // Staging recovery when ML API is blocked: use census/discovery evidence by product_id.
    // Discovery still came from Price Memory — evidence only fills extraction gaps.
    if (!liveOk) {
      const fromEvidence = metaFromDiscoveryEvidenceForProduct(productId, cand.url);
      if (fromEvidence) {
        meta = fromEvidence;
        acquisitionPath = 'discovery_evidence_fallback';
        const prov = fromEvidence.signals?.originalPriceProvenance;
        originalRecoveredVia =
          fromEvidence.originalPrice != null
            ? prov === 'listing_card'
              ? 'listing_card'
              : 'explicit_source'
            : 'unavailable';
      }
    }
  }

  if (!meta) return { meta: null, fetchBlocked, originalRecoveredVia, acquisitionPath };

  try {
    meta = await enrichWithPriceIntel(meta, config, { preserveLabelDiscount: true });
  } catch {
    /* keep meta */
  }
  return { meta, fetchBlocked, originalRecoveredVia, acquisitionPath };
}

/**
 * Single cycle authority for continuous discovery.
 */
function skippedScheduledCycleReport(input: {
  cycleId: string;
  started: Date;
  dryRun: boolean;
  reason: 'completed' | 'in_progress';
}): DiscoveryCycleReport {
  const finished = input.started;
  const funnel = emptyFunnel(input.cycleId, input.dryRun);
  const verifiedYield = emptyVerifiedYieldFunnel(input.cycleId);
  const automation = buildAutomationCycleMetrics(emptyAutomationCycleCounts());
  const operator_verdict =
    input.reason === 'completed'
      ? `Scheduled cycle ${input.cycleId} already persisted; duplicate invocation did not rerun.`
      : `Scheduled cycle ${input.cycleId} is in progress; overlapping invocation did not rerun.`;
  const cycleFunnel = buildCycleFunnelSummaryFromDiscovery({
    cycleId: input.cycleId,
    funnel,
    operator_verdict,
    dryRun: input.dryRun,
    automation_rate: automation.automation_rate,
  });
  return {
    cycle_id: input.cycleId,
    startedAt: input.started.toISOString(),
    finishedAt: finished.toISOString(),
    dryRun: input.dryRun,
    mintAttempted: false,
    sources: [],
    funnel,
    cycleFunnel,
    automation,
    prioritizedUrls: [],
    gateSamples: [],
    candidateObservations: [],
    mintResults: [],
    hunterSourceRuns: [],
    operator_verdict,
    bySource: {},
    verifiedYield,
    terminalTraces: [],
    truthPersist: {
      supplyTruth: { attempted: 0, persisted: 0, duplicates: 0, failed: 0 },
      snapshot: { persisted: false, reason: `lease_${input.reason}` },
    },
  };
}

export async function runContinuousDiscoveryCycle(
  options: RunContinuousDiscoveryCycleOptions = {},
): Promise<DiscoveryCycleReport> {
  const started = new Date();
  const now = options.now ?? new Date();
  const mode = resolveContinuousExecutionMode(options);
  const dryRun = mode.dryRun;
  const allowMint = mode.allowMint;
  const cycleId =
    (options.cycleId && options.cycleId.trim()) || randomUUID();
  const config = options.config ?? loadBotIngestConfig();
  const excludeEnvUrls = options.excludeEnvUrls !== false;
  const includeSticky = options.includeStickyNearReady !== false;
  const defaultMax =
    options.cronSafe === true ? SCHEDULED_CONTINUOUS_MAX_PRIORITIZED : 20;
  const maxPrioritized = Math.max(1, options.maxPrioritized ?? defaultMax);
  const mintCap = Math.max(0, Math.min(5, options.mintCap ?? 2));
  const deadlineMs =
    options.deadlineMs ??
    (options.cronSafe === true ? SCHEDULED_CONTINUOUS_DEADLINE_MS : undefined);
  const deadline: DeadlineContext | null =
    typeof deadlineMs === 'number' && deadlineMs > 0
      ? createDeadlineContext({
          now: started.getTime(),
          softDeadlineMs: deadlineMs,
          stageCaps: options.deadlineStageCaps,
        })
      : null;
  const deadlineAt = deadline?.deadlineAt ?? null;
  const pastDeadline = () => deadline?.isExpired() ?? false;

  // Day 9 — DB lease when a stable cycleId is provided (scheduled cron).
  // UNIQUE(cycle_id) prevents concurrent/duplicate runs from corrupting truth.
  let claimToken: string | undefined;
  if (options.persistTruth !== false && options.cycleId?.trim()) {
    const claim = await claimDiscoveryCycle({
      cycleId,
      now: started,
      supabase: options.leaseSupabase,
    });
    if (claim.action === 'skip') {
      return skippedScheduledCycleReport({
        cycleId,
        started,
        dryRun,
        reason: claim.reason,
      });
    }
    if (claim.action === 'run') {
      claimToken = claim.token;
    } else {
      // unguarded (no client / missing table): fail-open seed, no lease token
      try {
        await seedDiscoveryCycleSnapshot({
          cycleId,
          startedAt: started.toISOString(),
          dryRun,
        });
      } catch {
        // fail-open
      }
    }
  } else if (options.persistTruth !== false) {
    // Ad-hoc UUID cycles: seed without lease (fail-open).
    try {
      await seedDiscoveryCycleSnapshot({
        cycleId,
        startedAt: started.toISOString(),
        dryRun,
      });
    } catch {
      // fail-open
    }
  }

  // Watchdog: if the cycle hangs before final persist, still upsert a deadline row.
  let cycleFinalized = false;
  let deadlineWatchdog: ReturnType<typeof setTimeout> | null = null;
  if (deadlineAt !== null && options.persistTruth !== false) {
    const ms = Math.max(1_000, deadlineAt - Date.now());
    deadlineWatchdog = setTimeout(() => {
      void (async () => {
        if (cycleFinalized) return;
        try {
          await persistDeadlineDiscoverySnapshot({
            cycleId,
            startedAt: started.toISOString(),
            dryRun,
            reason: 'soft_deadline_watchdog',
            claimToken,
            ...(options.leaseSupabase !== undefined ? { supabase: options.leaseSupabase } : {}),
          });
          console.warn(
            `[day8] deadline_watchdog cycle=${cycleId.slice(0, 12)} snapshot upserted`,
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`[day8] deadline_watchdog_failed ${message.slice(0, 120)}`);
        }
      })();
    }, ms);
  }

  const funnel = emptyFunnel(cycleId, dryRun);
  const sources: DiscoverySourceOutcome[] = [];
  const allCandidates: HunterCandidate[] = [];
  let hunterSourceRuns: HunterRunMetrics[] = [];
  const terminalTraces: VerifiedYieldCandidateTrace[] = [];
  const verifiedYield = emptyVerifiedYieldFunnel(cycleId);

  const nearReadyBudget = deadline?.allocate('near_ready_measure') ?? null;
  const nearReadyStarted = Date.now();
  const nearReadyPromise = selectNearReadyStickyTargets({
    // Measure the same eligibility window as sticky acquisition (short cooldown).
    config: { maxTargets: 0, cooldownHours: 1 },
    now,
  });
  const nearReadyMeasure =
    nearReadyBudget !== null
      ? await (async () => {
          const raced = await raceWithBudget(nearReadyPromise, nearReadyBudget);
          if (!raced.ok) {
            return {
              targets: [],
              poolNearReady: 0,
              poolOneDayAway: 0,
              poolTwoDaysAway: 0,
              poolThreeDaysAway: 0,
              budgetAllocation: { one: 0, two: 0, threePlus: 0 },
              cooldownSkipped: 0,
              alreadyReadySkipped: 0,
              observedTodaySkipped: 0,
              budgetLimited: 0,
              todayYmd: '',
            };
          }
          return raced.value;
        })()
      : await nearReadyPromise;
  deadline?.recordUsed('near_ready_measure', Date.now() - nearReadyStarted);
  verifiedYield.near_ready = {
    one_day_away: nearReadyMeasure.poolOneDayAway,
    two_days_away: nearReadyMeasure.poolTwoDaysAway,
    three_days_away: nearReadyMeasure.poolThreeDaysAway,
    pool_near_ready: nearReadyMeasure.poolNearReady,
  };

  // --- 1) Hunter multi-source collect (isolated, budget-capped) ---
  const hunterSources = selectContinuousSources(excludeEnvUrls);
  funnel.sources_requested += hunterSources.length;

  const hunterBudget = deadline?.allocate('hunter_collect') ?? null;
  const hunterStarted = Date.now();
  const hunterAbort = new AbortController();
  try {
    const collectPromise = runHunterCollect({
      config,
      rotationWave: options.rotationWave ?? 0,
      now,
      sources: hunterSources,
      persistHealth: false,
      ...(hunterBudget !== null ? { budgetMs: hunterBudget, signal: hunterAbort.signal } : {}),
    });
    const raced =
      hunterBudget !== null
        ? await raceWithBudget(collectPromise, hunterBudget, () => hunterAbort.abort())
        : { ok: true as const, value: await collectPromise };

    if (raced.ok) {
      const collected = raced.value;
      hunterSourceRuns = collected.sourceRuns;
      for (const run of collected.sourceRuns) {
        sources.push(classifyHunterRun(run));
      }
      allCandidates.push(...collected.candidates);
      if (collected.stoppedReason === 'soft_deadline') {
        // Aggregate note — individual source rows already carry soft_deadline.
        if (!sources.some((s) => s.errorCode === 'soft_deadline')) {
          sources.push({
            sourceId: 'hunter_collect',
            status: 'skipped',
            canonicalStatus: 'SKIPPED',
            candidates: collected.candidates.length,
            errorCode: 'soft_deadline',
            errorMessageSafe: 'hunter_collect_budget_exhausted',
          });
        }
      }
    } else {
      // Outer race fired before engine returned — still not a cycle FAILED.
      sources.push({
        sourceId: 'hunter_collect',
        status: 'skipped',
        canonicalStatus: 'SKIPPED',
        candidates: 0,
        errorCode: 'soft_deadline',
        errorMessageSafe: 'hunter_collect_budget_exhausted',
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sources.push({
      sourceId: 'hunter_collect',
      status: 'failed',
      canonicalStatus: 'FAILED',
      candidates: 0,
      errorCode: 'hunter_collect_threw',
      errorMessageSafe: message.slice(0, 160),
    });
  } finally {
    deadline?.recordUsed('hunter_collect', Date.now() - hunterStarted);
  }

  // --- 2) Sticky near-ready + PM evidence (independent of hunter budget) ---
  const stickyBudget = deadline?.allocate('sticky_pm') ?? null;
  const canRunSticky =
    includeSticky &&
    (deadline === null || (stickyBudget !== null && stickyBudget > 0 && !deadline.isExpired()));

  if (includeSticky && !canRunSticky) {
    funnel.sources_requested += 3;
    sources.push({
      sourceId: STICKY_NEAR_READY_SOURCE_ID,
      status: 'skipped',
      canonicalStatus: 'SKIPPED',
      candidates: 0,
      errorCode: 'soft_deadline',
      errorMessageSafe: 'sticky_skipped_no_cycle_budget',
    });
    sources.push({
      sourceId: PM_EVIDENCE_SOURCE_ID,
      status: 'skipped',
      canonicalStatus: 'SKIPPED',
      candidates: 0,
      errorCode: 'soft_deadline',
      errorMessageSafe: 'pm_evidence_skipped_no_cycle_budget',
    });
    sources.push({
      sourceId: STICKY_HISTORY_READY_SOURCE_ID,
      status: 'skipped',
      canonicalStatus: 'SKIPPED',
      candidates: 0,
      errorCode: 'soft_deadline',
      errorMessageSafe: 'sticky_history_ready_skipped_no_cycle_budget',
    });
  } else if (canRunSticky) {
    const stickyStarted = Date.now();
    funnel.sources_requested += 1;
    try {
      const stickyPromise = collectStickyNearReadyCandidates(
        { config, rotationWave: options.rotationWave ?? 0, now },
        { maxTargets: maxPrioritized, cooldownHours: 1 },
      );
      const stickyRaced =
        stickyBudget !== null
          ? await raceWithBudget(stickyPromise, Math.max(1_000, Math.floor(stickyBudget * 0.55)))
          : { ok: true as const, value: await stickyPromise };
      if (stickyRaced.ok) {
        const sticky = stickyRaced.value;
        sources.push(
          classifyStickyResult({
            ok: sticky.ok,
            candidates: sticky.candidates.length,
            errorCode: sticky.errorCode,
            errorMessageSafe: sticky.errorMessageSafe,
          }),
        );
        if (sticky.ok && sticky.candidates.length > 0) {
          allCandidates.push(...sticky.candidates);
        }
      } else {
        sources.push({
          sourceId: STICKY_NEAR_READY_SOURCE_ID,
          status: 'skipped',
          canonicalStatus: 'SKIPPED',
          candidates: 0,
          errorCode: 'soft_deadline',
          errorMessageSafe: 'sticky_budget_exhausted',
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sources.push({
        sourceId: STICKY_NEAR_READY_SOURCE_ID,
        status: 'failed',
        canonicalStatus: 'FAILED',
        candidates: 0,
        errorCode: 'sticky_threw',
        errorMessageSafe: message.slice(0, 160),
      });
    }

    // PM ∩ discovery-evidence (product_id) — still no URL paste
    funnel.sources_requested += 1;
    const pmRemaining =
      stickyBudget !== null
        ? Math.max(0, stickyBudget - (Date.now() - stickyStarted))
        : null;
    try {
      const pmPromise = collectPmEvidenceBackedCandidates(
        { config, rotationWave: options.rotationWave ?? 0, now },
        { maxTargets: maxPrioritized },
      );
      const pmRaced =
        pmRemaining !== null
          ? await raceWithBudget(pmPromise, Math.max(500, pmRemaining))
          : { ok: true as const, value: await pmPromise };
      if (pmRaced.ok) {
        const pmEv = pmRaced.value;
        const outcome = classifyStickyResult({
          ok: pmEv.ok,
          candidates: pmEv.candidates.length,
          errorCode: pmEv.errorCode,
          errorMessageSafe: pmEv.errorMessageSafe,
        });
        outcome.sourceId = PM_EVIDENCE_SOURCE_ID;
        sources.push(outcome);
        if (pmEv.ok && pmEv.candidates.length > 0) {
          allCandidates.push(...pmEv.candidates);
        }
      } else {
        sources.push({
          sourceId: PM_EVIDENCE_SOURCE_ID,
          status: 'skipped',
          canonicalStatus: 'SKIPPED',
          candidates: 0,
          errorCode: 'soft_deadline',
          errorMessageSafe: 'pm_evidence_budget_exhausted',
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sources.push({
        sourceId: PM_EVIDENCE_SOURCE_ID,
        status: 'failed',
        canonicalStatus: 'FAILED',
        candidates: 0,
        errorCode: 'pm_evidence_threw',
        errorMessageSafe: message.slice(0, 160),
      });
    }

    // Day 11 — historyReady reactivation (still within sticky_pm budget remainder)
    funnel.sources_requested += 1;
    const hrRemaining =
      stickyBudget !== null
        ? Math.max(0, stickyBudget - (Date.now() - stickyStarted))
        : null;
    try {
      const hrPromise = collectHistoryReadyReactivationCandidates(
        { config, rotationWave: options.rotationWave ?? 0, now },
        { maxTargets: Math.min(8, maxPrioritized), cooldownHours: 1 },
      );
      const hrRaced =
        hrRemaining !== null
          ? await raceWithBudget(hrPromise, Math.max(500, hrRemaining))
          : { ok: true as const, value: await hrPromise };
      if (hrRaced.ok) {
        const hr = hrRaced.value;
        const outcome = classifyStickyResult({
          ok: hr.ok,
          candidates: hr.candidates.length,
          errorCode: hr.errorCode,
          errorMessageSafe: hr.errorMessageSafe,
        });
        outcome.sourceId = STICKY_HISTORY_READY_SOURCE_ID;
        sources.push(outcome);
        if (hr.ok && hr.candidates.length > 0) {
          allCandidates.push(...hr.candidates);
        }
      } else {
        sources.push({
          sourceId: STICKY_HISTORY_READY_SOURCE_ID,
          status: 'skipped',
          canonicalStatus: 'SKIPPED',
          candidates: 0,
          errorCode: 'soft_deadline',
          errorMessageSafe: 'sticky_history_ready_budget_exhausted',
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sources.push({
        sourceId: STICKY_HISTORY_READY_SOURCE_ID,
        status: 'failed',
        canonicalStatus: 'FAILED',
        candidates: 0,
        errorCode: 'sticky_history_ready_threw',
        errorMessageSafe: message.slice(0, 160),
      });
    } finally {
      deadline?.recordUsed('sticky_pm', Date.now() - stickyStarted);
    }
  }

  for (const s of sources) {
    if (s.status === 'success') funnel.sources_succeeded += 1;
    else if (s.status === 'blocked' || s.status === 'retryable') funnel.sources_blocked += 1;
    else if (s.status === 'failed') funnel.sources_failed += 1;
    else if (s.status === 'empty' || s.status === 'skipped') funnel.sources_empty += 1;
  }

  funnel.candidates_discovered = allCandidates.length;
  verifiedYield.discovered = funnel.candidates_discovered;

  // --- 3) Canonicalize / quality filter / dedupe ---
  let invalid = 0;
  let unsupported = 0;
  const valid = allCandidates.filter((c) => {
    const url = (c.url || '').trim();
    if (!url || isHomepageOrNonProduct(url)) {
      invalid += 1;
      return false;
    }
    const hasId =
      Boolean(extractMercadoLibreItemId(url)) ||
      Boolean(extractAmazonAsin(url)) ||
      Boolean(extractLiverpoolProductId(url)) ||
      Boolean(c.fingerprint && c.fingerprint.includes(':')) ||
      Boolean(c.externalId);
    if (!hasId) {
      unsupported += 1;
    }
    return true;
  });
  funnel.invalid = invalid;
  funnel.unsupported = unsupported;

  const beforeDedupe = valid.length;
  const deduped = dedupeHunterCandidates(valid);
  funnel.duplicates = Math.max(0, beforeDedupe - deduped.length);
  funnel.candidates_canonicalized = deduped.length;
  funnel.identified = deduped.filter(
    (c) =>
      Boolean(c.fingerprint) ||
      Boolean(c.externalId) ||
      Boolean(extractMercadoLibreItemId(c.url)) ||
      Boolean(extractAmazonAsin(c.url)) ||
      Boolean(extractLiverpoolProductId(c.url)),
  ).length;
  verifiedYield.canonicalized = funnel.candidates_canonicalized;
  verifiedYield.identity_valid = funnel.identified;

  // --- 4) Prioritize: sticky near-ready first, then Offer Standard (+ Day 6 health/PM boost) ---
  const stickyFirst = [...deduped].sort((a, b) => {
    const aAct = a.rawMetadata?.historyReadyActivated === true ? 1 : 0;
    const bAct = b.rawMetadata?.historyReadyActivated === true ? 1 : 0;
    if (aAct !== bAct) return bAct - aAct;
    const aSticky = a.rawMetadata?.priceMemoryDriven === true ? 1 : 0;
    const bSticky = b.rawMetadata?.priceMemoryDriven === true ? 1 : 0;
    if (aSticky !== bSticky) return bSticky - aSticky;
    const aDays = Number(a.rawMetadata?.daysUntilReady ?? 99);
    const bDays = Number(b.rawMetadata?.daysUntilReady ?? 99);
    return aDays - bDays;
  });

  const daysUntilReadyByUrl: Record<string, number> = {};
  const sourceHealth: Record<string, string> = {};
  for (const s of sources) {
    if (s.canonicalStatus === 'SUCCESS' || s.canonicalStatus === 'PARTIAL') {
      sourceHealth[s.sourceId] = 'healthy';
    } else if (s.canonicalStatus === 'DEGRADED' || s.canonicalStatus === 'BLOCKED_EXTERNAL') {
      sourceHealth[s.sourceId] = 'degraded';
    } else if (s.canonicalStatus === 'SKIPPED' || s.canonicalStatus === 'BLOCKED_AUTH') {
      sourceHealth[s.sourceId] = 'disabled';
    } else if (s.canonicalStatus === 'FAILED') {
      sourceHealth[s.sourceId] = 'down';
    }
  }
  for (const c of stickyFirst) {
    const days = Number(c.rawMetadata?.daysUntilReady);
    if (Number.isFinite(days)) {
      daysUntilReadyByUrl[c.url] = days;
    }
  }

  const ingestPool: IngestItem[] = stickyFirst.map((c) => c.ingestItem);
  const ranked = prioritizeAcquisitionPool(ingestPool, {
    sourceHealth,
    daysUntilReadyByUrl,
  }).slice(0, maxPrioritized);
  funnel.offer_standard_pass = ranked.length;
  verifiedYield.offer_standard_pass = ranked.length;

  const rankedCandidates = ranked
    .map((item) => {
      const url = item.precomputedMeta?.canonicalUrl || item.url;
      return stickyFirst.find((c) => c.url === url || c.ingestItem.url === item.url);
    })
    .filter((c): c is HunterCandidate => Boolean(c));

  verifiedYield.pm_ready = rankedCandidates.filter(
    (c) => c.rawMetadata?.priceMemoryDriven === true,
  ).length;

  // --- 5) Enrich + DQE + S6.1 (no mint yet) ---
  const gateSamples: DiscoveryCycleReport['gateSamples'] = [];
  const candidateObservations: DiscoveryCandidateObservation[] = [];
  const MAX_CANDIDATE_OBSERVATIONS = 50;
  const mintable: Array<{ candidate: HunterCandidate; meta: ParsedOfferMetadata }> = [];
  let automationCounts = emptyAutomationCycleCounts();
  const enrichBudget = deadline?.allocate('enrich_eval') ?? null;
  const enrichStarted = Date.now();
  const enrichDeadlineAt =
    enrichBudget !== null ? enrichStarted + enrichBudget : null;

  for (const cand of rankedCandidates) {
    if (
      pastDeadline() ||
      (enrichDeadlineAt !== null && Date.now() >= enrichDeadlineAt)
    ) {
      console.warn(
        `[day10] soft_deadline cycle=${cycleId.slice(0, 12)} stopping enrich`,
      );
      deadline?.markEndedBy('deadline');
      break;
    }
    const productId =
      typeof cand.rawMetadata?.productId === 'string'
        ? cand.rawMetadata.productId
        : extractMercadoLibreItemId(cand.url);
    const priorDays =
      typeof cand.rawMetadata?.priorDays === 'number' ? cand.rawMetadata.priorDays : null;
    const daysUntilReady =
      typeof cand.rawMetadata?.daysUntilReady === 'number'
        ? cand.rawMetadata.daysUntilReady
        : null;

    const enriched = await enrichCandidateMeta(cand, config, funnel);
    const meta = enriched.meta;
    if (!meta || !meta.title?.trim() || !(meta.discountPrice > 0)) {
      funnel.dqe_failed += 1;
      const terminal = assignPrimaryTerminalReason({
        dryRun,
        extracted: false,
        fetchBlocked: enriched.fetchBlocked,
        identityValid: false,
      });
      bumpTerminalReason(verifiedYield, terminal);
      pushTerminalTrace(terminalTraces, {
        url: cand.url,
        sourceId: discoverySourceIdForCandidate(cand),
        productId,
        daysUntilReady,
        priorDays,
        historyReady: false,
        dqeDecision: null,
        s61Decision: null,
        reasonCodes: enriched.fetchBlocked ? ['FETCH_BLOCKED'] : ['EXTRACTION_FAILED'],
        primaryTerminalReason: terminal,
      });
      if (candidateObservations.length < MAX_CANDIDATE_OBSERVATIONS) {
        candidateObservations.push(
          buildCandidateObservation({
            url: cand.url,
            sourceId: discoverySourceIdForCandidate(cand),
            productId,
            historyReady: false,
            meta: null,
            acquisitionPath: enriched.acquisitionPath,
            originalRecoveredVia: enriched.originalRecoveredVia,
            qualityDecision: 'EXTRACTION_FAILED',
            wouldInsert: false,
            dqeDecision: null,
            primaryTerminal: terminal,
            reasonCodes: enriched.fetchBlocked ? ['FETCH_BLOCKED'] : ['EXTRACTION_FAILED'],
            provenanceDiag: null,
          }),
        );
      }
      automationCounts = accumulateAutomationOutcome(
        automationCounts,
        automationOutcomeFromTerminal(terminal, [], {
          dryRun,
          fetchBlocked: enriched.fetchBlocked,
        }),
        { dryRun },
      );
      continue;
    }
    funnel.extracted += 1;

    const historyReady = meta.signals?.historyReady === true;
    if (historyReady) funnel.price_memory_ready += 1;
    else funnel.price_memory_not_ready += 1;

    const dealQuality = evaluateDealQualityFromParsedMeta(meta, {
      source: 'continuous_discovery',
      productFingerprint: strongProductFingerprintForUrl(meta.canonicalUrl),
    });
    const dqeVerified = dealQuality.decision === 'VERIFIED_DEAL';
    if (dqeVerified) {
      funnel.dqe_verified += 1;
      verifiedYield.dqe_verified += 1;
    } else if (dealQuality.decision === 'POTENTIAL_DEAL') {
      funnel.dqe_potential += 1;
      verifiedYield.dqe_potential += 1;
    } else if (
      dealQuality.decision === 'NO_VERIFIED_DEAL' ||
      dealQuality.decision === 'REJECT'
    ) {
      funnel.dqe_blocked += 1;
    } else {
      funnel.dqe_failed += 1;
    }

    const gate = evaluateMachineCandidateGate({
      url: meta.canonicalUrl,
      meta,
      config,
      verifierDecision: 'pending',
      verifierReasons: [],
      duplicate: null,
      dealScore: null,
      dealQuality,
    });

    // Day 12 — observe-only provenance gap diagnosis (never upgrades trust).
    const provenanceDiag = diagnoseProvenanceCompleteness({
      meta,
      expectedProductId: productId,
      currentEvidenceAbsent: enriched.fetchBlocked && !meta.signals?.currentPriceProvenance,
    });
    const reasonCodesWithDiag = appendProvenanceDiagnostics(
      gate.reasonCodes,
      provenanceDiag,
    );

    gateSamples.push({
      url: meta.canonicalUrl,
      qualityDecision: gate.qualityDecision,
      wouldInsert: gate.wouldInsert,
      historyReady,
      reasonCodes: reasonCodesWithDiag,
      provenanceGap: provenanceDiag.gap,
      originalRecoveredVia: enriched.originalRecoveredVia,
      acquisitionPath: enriched.acquisitionPath,
    });

    const s61Pass =
      gate.wouldInsert === true && gate.qualityDecision === 'VERIFIED_OPPORTUNITY';
    const terminal = assignPrimaryTerminalReason({
      dryRun,
      identityValid: true,
      extracted: true,
      // Live fetch may fail while PM tip still yields evaluable meta — do not override DQE/S6.1.
      fetchBlocked: false,
      historyReady,
      dqeDecision: dealQuality.decision,
      s61WouldInsert: gate.wouldInsert,
      s61QualityDecision: gate.qualityDecision,
      reasonCodes: reasonCodesWithDiag,
    });
    bumpTerminalReason(verifiedYield, terminal);
    pushTerminalTrace(terminalTraces, {
      url: meta.canonicalUrl,
      sourceId: discoverySourceIdForCandidate(cand),
      productId,
      daysUntilReady,
      priorDays,
      historyReady,
      dqeDecision: dealQuality.decision,
      s61Decision: gate.qualityDecision,
      reasonCodes: reasonCodesWithDiag,
      primaryTerminalReason: terminal,
    });

    if (candidateObservations.length < MAX_CANDIDATE_OBSERVATIONS) {
      candidateObservations.push(
        buildCandidateObservation({
          url: meta.canonicalUrl,
          sourceId: discoverySourceIdForCandidate(cand),
          productId,
          historyReady,
          meta,
          acquisitionPath: enriched.acquisitionPath,
          originalRecoveredVia: enriched.originalRecoveredVia,
          qualityDecision: gate.qualityDecision,
          wouldInsert: gate.wouldInsert,
          dqeDecision: dealQuality.decision,
          primaryTerminal: terminal,
          reasonCodes: reasonCodesWithDiag,
          provenanceDiag,
        }),
      );
    }

    const enrichOpts = {
      dryRun,
      enriched: true,
      dqeVerified,
      s61Passed: s61Pass,
    };

    const autoOutcome = automationOutcomeFromTerminal(terminal, reasonCodesWithDiag, {
      dryRun,
      fetchBlocked: false,
    });

    if (s61Pass) {
      funnel.s61_pass += 1;
      verifiedYield.s61_pass += 1;
      mintable.push({ candidate: cand, meta });
      if (dryRun || !allowMint) {
        automationCounts = accumulateAutomationOutcome(automationCounts, 'blocked', enrichOpts);
      }
      // else: counted at mint time
    } else {
      funnel.s61_blocked += 1;
      verifiedYield.s61_blocked += 1;
      automationCounts = accumulateAutomationOutcome(automationCounts, autoOutcome, enrichOpts);
    }
  }

  // --- 6) Optional staging mint via S7 sole writer ---
  const mintResults: DiscoveryCycleReport['mintResults'] = [];

  if (allowMint && mintable.length > 0) {
    const toMint = mintable.slice(0, mintCap);
    const runMint = async () => {
      for (const row of toMint) {
        const result = await writePendingViaS7Bridge({
          config,
          meta: row.meta,
          ingestSource: 'ml_api',
          ingestSourceDetail: `continuous_discovery|cycle:${cycleId}`,
          moderatorNote: `[day3] continuous discovery cycle ${cycleId.slice(0, 8)}`,
          requireDedicatedAuthor: true,
        });

        if (result.ok === true) {
          funnel.s7_pass += 1;
          funnel.pending_created += 1;
          funnel.observations_created += 1;
          const terminal = assignPrimaryTerminalReason({ mintOk: true, dryRun: false });
          bumpTerminalReason(verifiedYield, terminal);
          pushTerminalTrace(terminalTraces, {
            url: row.meta.canonicalUrl,
            sourceId: discoverySourceIdForCandidate(row.candidate),
            productId:
              typeof row.candidate.rawMetadata?.productId === 'string'
                ? row.candidate.rawMetadata.productId
                : extractMercadoLibreItemId(row.meta.canonicalUrl),
            daysUntilReady:
              typeof row.candidate.rawMetadata?.daysUntilReady === 'number'
                ? row.candidate.rawMetadata.daysUntilReady
                : null,
            priorDays:
              typeof row.candidate.rawMetadata?.priorDays === 'number'
                ? row.candidate.rawMetadata.priorDays
                : null,
            historyReady: row.meta.signals?.historyReady === true,
            dqeDecision: 'VERIFIED_DEAL',
            s61Decision: 'VERIFIED_OPPORTUNITY',
            reasonCodes: [],
            primaryTerminalReason: terminal,
          });
          mintResults.push({
            url: row.meta.canonicalUrl,
            ok: true,
            offerId: result.offerId,
          });
          automationCounts = accumulateAutomationOutcome(automationCounts, 'auto_processed', {
            pendingCreated: true,
            dryRun: false,
            enriched: true,
            dqeVerified: true,
            s61Passed: true,
            s7Passed: true,
            written: true,
          });
        } else if ('duplicate' in result && result.duplicate) {
          funnel.s7_blocked += 1;
          const terminal = assignPrimaryTerminalReason({ mintDuplicate: true, dryRun: false });
          bumpTerminalReason(verifiedYield, terminal);
          pushTerminalTrace(terminalTraces, {
            url: row.meta.canonicalUrl,
            sourceId: discoverySourceIdForCandidate(row.candidate),
            productId:
              typeof row.candidate.rawMetadata?.productId === 'string'
                ? row.candidate.rawMetadata.productId
                : extractMercadoLibreItemId(row.meta.canonicalUrl),
            daysUntilReady: null,
            priorDays: null,
            historyReady: row.meta.signals?.historyReady === true,
            dqeDecision: 'VERIFIED_DEAL',
            s61Decision: 'VERIFIED_OPPORTUNITY',
            reasonCodes: ['DUPLICATE'],
            primaryTerminalReason: terminal,
          });
          mintResults.push({
            url: row.meta.canonicalUrl,
            ok: false,
            duplicate: true,
            error: 'duplicate',
          });
          automationCounts = accumulateAutomationOutcome(automationCounts, 'duplicate', {
            dryRun: false,
            enriched: true,
            dqeVerified: true,
            s61Passed: true,
          });
        } else {
          funnel.s7_blocked += 1;
          const err = 'error' in result ? String(result.error) : 's7_blocked';
          const terminal = assignPrimaryTerminalReason({
            s61WouldInsert: true,
            dryRun: false,
          });
          bumpTerminalReason(verifiedYield, terminal);
          pushTerminalTrace(terminalTraces, {
            url: row.meta.canonicalUrl,
            sourceId: discoverySourceIdForCandidate(row.candidate),
            productId: null,
            daysUntilReady: null,
            priorDays: null,
            historyReady: row.meta.signals?.historyReady === true,
            dqeDecision: 'VERIFIED_DEAL',
            s61Decision: 'VERIFIED_OPPORTUNITY',
            reasonCodes: ['WRITER_BLOCK', err],
            primaryTerminalReason: terminal,
          });
          mintResults.push({
            url: row.meta.canonicalUrl,
            ok: false,
            error: err,
          });
          automationCounts = accumulateAutomationOutcome(
            automationCounts,
            classifyAutomationOutcome({ status: 'skipped', skipReason: 'writes_blocked' }),
            {
              dryRun: false,
              enriched: true,
              s61Passed: true,
            },
          );
        }
      }
    };

    if (!isMachinePendingWriteEnabled()) {
      await withMachinePendingWritesEnabled(runMint);
    } else {
      await runMint();
    }
  }

  // Dry-run must not count pending/observations as real writes
  if (dryRun) {
    funnel.pending_created = 0;
    funnel.observations_created = 0;
    funnel.s7_pass = 0;
  }

  // Day 6 — per-source funnel (answers "why zero offers?" per source)
  let bySource: Record<string, SourceFunnelStageCounts> = {};
  for (const s of sources) {
    bySource = upsertSourceFunnel(bySource, s.sourceId, {
      status: s.canonicalStatus,
      discovered: s.candidates,
      error_code: s.errorCode,
    });
  }
  for (const c of stickyFirst) {
    const sid = String(c.source);
    const idValid =
      Boolean(extractMercadoLibreItemId(c.url)) ||
      Boolean(extractAmazonAsin(c.url)) ||
      Boolean(extractLiverpoolProductId(c.url)) ||
      Boolean(c.fingerprint?.includes(':')) ||
      Boolean(c.externalId);
    const prev = bySource[sid] ?? emptySourceFunnel(sid, 'SUCCESS');
    bySource = upsertSourceFunnel(bySource, sid, {
      status: prev.status,
      canonicalized: prev.canonicalized + 1,
      identity_valid: prev.identity_valid + (idValid ? 1 : 0),
      pm_ready:
        prev.pm_ready + (c.rawMetadata?.priceMemoryDriven === true ? 1 : 0),
    });
  }
  for (const sample of gateSamples) {
    const cand = rankedCandidates.find((c) => c.url === sample.url);
    const sid = cand ? String(cand.source) : 'unknown';
    const prev = bySource[sid] ?? emptySourceFunnel(sid, 'SUCCESS');
    bySource = upsertSourceFunnel(bySource, sid, {
      offer_standard_pass: prev.offer_standard_pass + 1,
      dqe_verified: prev.dqe_verified + (sample.qualityDecision === 'VERIFIED_OPPORTUNITY' ? 1 : 0),
      dqe_potential:
        prev.dqe_potential +
        (sample.qualityDecision !== 'VERIFIED_OPPORTUNITY' && sample.wouldInsert === false
          ? 0
          : sample.historyReady
            ? 0
            : 0),
      s61_pass: prev.s61_pass + (sample.wouldInsert ? 1 : 0),
      blocked: prev.blocked + (sample.wouldInsert ? 0 : 1),
    });
  }
  for (const m of mintResults) {
    const cand = rankedCandidates.find((c) => c.url === m.url);
    const sid = cand ? String(cand.source) : 'unknown';
    const prev = bySource[sid] ?? emptySourceFunnel(sid, 'SUCCESS');
    if (m.ok) {
      bySource = upsertSourceFunnel(bySource, sid, { pending: prev.pending + 1 });
    } else if (m.duplicate) {
      bySource = upsertSourceFunnel(bySource, sid, { duplicate: prev.duplicate + 1 });
    } else {
      bySource = upsertSourceFunnel(bySource, sid, { failed: prev.failed + 1 });
    }
  }

  const sourceFunnelLog = formatSourceFunnelLog(bySource);
  if (sourceFunnelLog) {
    console.log(sourceFunnelLog);
  }

  finalizeVerifiedYieldRates(verifiedYield);

  // Day 11 — historyReady activation measurement (observe-only).
  let historyReadyActivation: HistoryReadyActivationReport | null = null;
  try {
    const census = await loadHistoryReadyCensus({ now });
    const activatedIds = new Set<string>();
    for (const c of allCandidates) {
      if (
        c.rawMetadata?.historyReadyActivated === true &&
        typeof c.rawMetadata?.productId === 'string'
      ) {
        activatedIds.add(c.rawMetadata.productId);
      }
    }
    historyReadyActivation = buildHistoryReadyActivationFromTraces(
      terminalTraces,
      census,
      { activatedProductIds: activatedIds },
    );
    verifiedYield.rates = {
      ...verifiedYield.rates,
      history_ready_to_s61_yield:
        historyReadyActivation.rates.historyReady_to_s61_yield,
    };
    console.log(
      `[day11] historyReady census=${census.history_ready} activated_today≈${census.approx_activated_today} evaluated=${historyReadyActivation.evaluated.history_ready_candidates} s61=${historyReadyActivation.evaluated.s61_pass} yield=${historyReadyActivation.rates.historyReady_to_s61_yield}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[day11] historyReady_activation_failed ${message.slice(0, 120)}`);
  }

  console.log(
    `[day7] cycle=${cycleId.slice(0, 8)} minHistory=${ML_PRICE_MIN_HISTORY_DAYS} verified_yield=${verifiedYield.rates.verified_yield} s61_yield=${verifiedYield.rates.s61_yield} hist_block=${verifiedYield.rates.history_block_rate} near_ready=${verifiedYield.near_ready.pool_near_ready}`,
  );

  const automation = buildAutomationCycleMetrics(automationCounts);
  deadline?.recordUsed('enrich_eval', Date.now() - enrichStarted);
  // Reserve persist slice (accounting only — persist itself is fail-open).
  deadline?.allocate('persist');
  if (deadline && !deadline.isExpired() && deadline.snapshot().endedBy === null) {
    deadline.markEndedBy('normal');
  } else if (deadline?.isExpired()) {
    deadline.markEndedBy('deadline');
  }
  const finished = new Date();
  const operator_verdict = explainDiscoveryCycleVerdict({
    funnel,
    sources,
    dryRun,
    allowMint,
    verifiedYield,
  });

  const cycleFunnel = buildCycleFunnelSummaryFromDiscovery({
    cycleId,
    funnel,
    operator_verdict,
    dryRun,
    automation_rate: automation.automation_rate,
    bySource,
  });

  const persistStarted = Date.now();
  const reportBase: DiscoveryCycleReport = {
    cycle_id: cycleId,
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    dryRun,
    mintAttempted: allowMint,
    sources,
    funnel,
    cycleFunnel,
    automation,
    prioritizedUrls: rankedCandidates.map((c) => c.url),
    gateSamples,
    candidateObservations,
    mintResults,
    hunterSourceRuns,
    operator_verdict,
    bySource,
    verifiedYield,
    terminalTraces,
    deadlineBudget: deadline?.snapshot() ?? null,
    historyReadyActivation,
  };

  let truthPersist: DiscoveryCycleReport['truthPersist'];
  if (options.persistTruth !== false) {
    try {
      truthPersist = await persistContinuousDiscoveryTruth(reportBase, {
        claimToken,
        ...(options.leaseSupabase !== undefined ? { supabase: options.leaseSupabase } : {}),
      });
      console.log(
        `[day8] truth_persist cycle=${cycleId.slice(0, 8)} supply=${JSON.stringify(truthPersist.supplyTruth)} snapshot=${JSON.stringify(truthPersist.snapshot)}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      truthPersist = {
        supplyTruth: { attempted: 0, persisted: 0, duplicates: 0, failed: 1 },
        snapshot: { persisted: false, reason: message.slice(0, 160) },
      };
    }
  }
  deadline?.recordUsed('persist', Date.now() - persistStarted);

  cycleFinalized = true;
  if (deadlineWatchdog) clearTimeout(deadlineWatchdog);

  return {
    ...reportBase,
    truthPersist,
    deadlineBudget: deadline?.snapshot() ?? null,
    historyReadyActivation,
  };
}

export function explainDiscoveryCycleVerdict(input: {
  funnel: DiscoveryCycleFunnel;
  sources: DiscoverySourceOutcome[];
  dryRun: boolean;
  allowMint: boolean;
  verifiedYield?: VerifiedYieldFunnel;
}): string {
  const { funnel, sources, verifiedYield } = input;
  const nearReadySuffix =
    verifiedYield != null
      ? ` nearReady=${verifiedYield.near_ready.pool_near_ready} (1d=${verifiedYield.near_ready.one_day_away}).`
      : '';
  const histBlockSuffix =
    verifiedYield?.rates.history_block_rate != null
      ? ` hist_block=${verifiedYield.rates.history_block_rate}.`
      : '';

  if (funnel.pending_created > 0) {
    return `Continuous discovery minted ${funnel.pending_created} pending offer(s); cycle_id=${funnel.cycle_id.slice(0, 8)}.${nearReadySuffix}${histBlockSuffix}`;
  }
  if (funnel.candidates_discovered === 0) {
    const blocked = sources.filter((s) => s.status === 'blocked' || s.status === 'retryable');
    if (blocked.length > 0 && sources.some((s) => s.status === 'success' || s.status === 'empty' || s.status === 'skipped')) {
      return `No candidates this cycle; ${blocked.length} source(s) blocked/retryable but cycle continued (isolation OK).${nearReadySuffix}${histBlockSuffix}`;
    }
    if (blocked.length === sources.length && sources.length > 0) {
      return `All discovery sources blocked/retryable — no usable candidates.${nearReadySuffix}${histBlockSuffix}`;
    }
    return `Discovery returned 0 candidates (sources empty or skipped).${nearReadySuffix}${histBlockSuffix}`;
  }
  if (input.dryRun || !input.allowMint) {
    return `Discovered ${funnel.candidates_discovered} → prioritized ${funnel.offer_standard_pass} → s61_pass=${funnel.s61_pass} (dry-run / no mint).${nearReadySuffix}${histBlockSuffix}`;
  }
  return `Discovered ${funnel.candidates_discovered}; s61_pass=${funnel.s61_pass}; no pending minted (gates or duplicates).${nearReadySuffix}${histBlockSuffix}`;
}
