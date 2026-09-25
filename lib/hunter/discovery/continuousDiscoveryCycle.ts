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
  HunterEngineCollectResult,
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
  STICKY_NEAR_READY_SOURCE_ID,
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
import { persistContinuousDiscoveryTruth } from './persistContinuousDiscoveryTruth';

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
  }>;
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
};

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
      }
    }
  }

  if (!meta) return { meta: null, fetchBlocked };

  try {
    meta = await enrichWithPriceIntel(meta, config, { preserveLabelDiscount: true });
  } catch {
    /* keep meta */
  }
  return { meta, fetchBlocked };
}

/**
 * Single cycle authority for continuous discovery.
 */
export async function runContinuousDiscoveryCycle(
  options: RunContinuousDiscoveryCycleOptions = {},
): Promise<DiscoveryCycleReport> {
  const started = new Date();
  const cycleId = randomUUID();
  const dryRun = options.dryRun !== false;
  const config = options.config ?? loadBotIngestConfig();
  const excludeEnvUrls = options.excludeEnvUrls !== false;
  const includeSticky = options.includeStickyNearReady !== false;
  const maxPrioritized = Math.max(1, options.maxPrioritized ?? 20);
  const mintCap = Math.max(0, Math.min(5, options.mintCap ?? 2));
  const allowMint = options.allowStagingMint === true && !dryRun;
  const now = options.now ?? new Date();

  const funnel = emptyFunnel(cycleId, dryRun);
  const sources: DiscoverySourceOutcome[] = [];
  const allCandidates: HunterCandidate[] = [];
  let hunterSourceRuns: HunterRunMetrics[] = [];
  const terminalTraces: VerifiedYieldCandidateTrace[] = [];
  const verifiedYield = emptyVerifiedYieldFunnel(cycleId);

  const nearReadyMeasure = await selectNearReadyStickyTargets({
    // Measure the same eligibility window as sticky acquisition (short cooldown).
    config: { maxTargets: 0, cooldownHours: 1 },
    now,
  });
  verifiedYield.near_ready = {
    one_day_away: nearReadyMeasure.poolOneDayAway,
    two_days_away: nearReadyMeasure.poolTwoDaysAway,
    three_days_away: nearReadyMeasure.poolThreeDaysAway,
    pool_near_ready: nearReadyMeasure.poolNearReady,
  };

  // --- 1) Hunter multi-source collect (isolated) ---
  const hunterSources = selectContinuousSources(excludeEnvUrls);
  funnel.sources_requested += hunterSources.length;

  try {
    const collected: HunterEngineCollectResult = await runHunterCollect({
      config,
      rotationWave: options.rotationWave ?? 0,
      now,
      sources: hunterSources,
      persistHealth: false,
    });
    hunterSourceRuns = collected.sourceRuns;
    for (const run of collected.sourceRuns) {
      sources.push(classifyHunterRun(run));
    }
    allCandidates.push(...collected.candidates);
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
  }

  // --- 2) Sticky near-ready (Price Memory driven) ---
  if (includeSticky) {
    funnel.sources_requested += 1;
    try {
      const sticky = await collectStickyNearReadyCandidates(
        { config, rotationWave: options.rotationWave ?? 0, now },
        { maxTargets: maxPrioritized, cooldownHours: 1 },
      );
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
    try {
      const pmEv = await collectPmEvidenceBackedCandidates(
        { config, rotationWave: options.rotationWave ?? 0, now },
        { maxTargets: maxPrioritized },
      );
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
  const mintable: Array<{ candidate: HunterCandidate; meta: ParsedOfferMetadata }> = [];
  let automationCounts = emptyAutomationCycleCounts();

  for (const cand of rankedCandidates) {
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
        sourceId: String(cand.source),
        productId,
        daysUntilReady,
        priorDays,
        historyReady: false,
        dqeDecision: null,
        s61Decision: null,
        reasonCodes: enriched.fetchBlocked ? ['FETCH_BLOCKED'] : ['EXTRACTION_FAILED'],
        primaryTerminalReason: terminal,
      });
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

    gateSamples.push({
      url: meta.canonicalUrl,
      qualityDecision: gate.qualityDecision,
      wouldInsert: gate.wouldInsert,
      historyReady,
      reasonCodes: gate.reasonCodes,
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
      reasonCodes: gate.reasonCodes,
    });
    bumpTerminalReason(verifiedYield, terminal);
    pushTerminalTrace(terminalTraces, {
      url: meta.canonicalUrl,
      sourceId: String(cand.source),
      productId,
      daysUntilReady,
      priorDays,
      historyReady,
      dqeDecision: dealQuality.decision,
      s61Decision: gate.qualityDecision,
      reasonCodes: gate.reasonCodes,
      primaryTerminalReason: terminal,
    });

    const enrichOpts = {
      dryRun,
      enriched: true,
      dqeVerified,
      s61Passed: s61Pass,
    };

    const autoOutcome = automationOutcomeFromTerminal(terminal, gate.reasonCodes, {
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
            sourceId: String(row.candidate.source),
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
            sourceId: String(row.candidate.source),
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
            sourceId: String(row.candidate.source),
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
  console.log(
    `[day7] cycle=${cycleId.slice(0, 8)} minHistory=${ML_PRICE_MIN_HISTORY_DAYS} verified_yield=${verifiedYield.rates.verified_yield} s61_yield=${verifiedYield.rates.s61_yield} hist_block=${verifiedYield.rates.history_block_rate} near_ready=${verifiedYield.near_ready.pool_near_ready}`,
  );

  const automation = buildAutomationCycleMetrics(automationCounts);
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
    mintResults,
    hunterSourceRuns,
    operator_verdict,
    bySource,
    verifiedYield,
    terminalTraces,
  };

  let truthPersist: DiscoveryCycleReport['truthPersist'];
  if (options.persistTruth !== false) {
    try {
      truthPersist = await persistContinuousDiscoveryTruth(reportBase);
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

  return { ...reportBase, truthPersist };
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
