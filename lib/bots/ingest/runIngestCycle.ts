import { loadBotIngestConfig } from './config';
import { getBotIngestPausedFromDb } from './botIngestPaused';
import { ingestRunBlockFromConfig } from './ingestRunGate';
import {
  countBotOffersCreatedSinceMulti,
  getBotOfferCountStartUtc,
  getBotIngestLastBoostYmd,
  setBotIngestLastBoostYmd,
} from './botIngestDailyState';
import { collectIngestItems } from './collectIngestItems';
import { fetchParsedOfferMetadataDetailed } from './fetchParsedOfferMetadata';
import { isLowQualityTitle } from './isLowQualityTitle';
import { type ScoreBreakdown } from './scoreIngestCandidate';
import { computeSourceRotationWave, formatYmdInTz, getZonedHourMinute } from './ingestZonedTime';
import { sleep } from './ingestHttp';
import type { IngestCycleReport, IngestSingleResult, IngestProfileId, IngestSourceId, IngestSourceStats, IngestItem } from './types';
import { emptyIngestSourceStats } from './types';
import type { ParsedOfferMetadata } from './fetchParsedOfferMetadata';
import { enrichWithPriceIntel } from './priceIntel';
import { evaluateDealSafe } from '@/lib/verifier';
import {
  beginAutonomousShadowCycle,
  createDuplicateShadowContext,
  observeIngestShadow,
  persistShadowCycleSnapshot,
} from '@/lib/autonomous';
import type { AutonomousDecisionResult } from '@/lib/autonomous/types';
import { countDuplicateKinds, countSupplyOpportunities } from './duplicateDrain';
import { enrichParsedOfferMetadata, isValidOfferImage } from '@/lib/hunter/enrichment';
import { isDayToDaySourceId } from '@/lib/hunter/dayToDay';
import {
  qualifyParsedOfferMetadata,
  recordDealQualification,
} from '@/lib/hunter/dealQualification';
import {
  persistIngestSupplyRuns,
  trackIngestQualification,
  type QualificationCounts,
} from '@/lib/hunter/supply/persistSnapshots';
import { selectTopKByScore } from './candidateInsertGate';
import {
  assertZeroSilentDrops,
  isHunterCandidateIntelligenceEnabled,
  observeIngestBatch,
  persistHunterCandidates,
  persistHunterIntelligenceRun,
  type ObservedResolved,
} from '@/lib/hunter/candidateIntelligence';
import {
  applyWouldCutAnnotations,
  earlyPersistDiscoverySightings,
  isHunterDiscoveryExperimentEnabled,
} from '@/lib/hunter/candidateIntelligence/discoveryExperimentPublic';
import { parseDiscoverySourceDetail } from '@/lib/hunter/candidateIntelligence/discoveryScheduler';

/** S9.1 — legacy cycle must not mint offers; live writes go through S9→S7. */
export const S91_DISCOVERY_ONLY_SKIP_REASON =
  's91_discovery_only_use_s9_for_writes' as const;

function emptySummary() {
  return { inserted: 0, duplicate: 0, skipped: 0, errors: 0, rejected: 0, autoApproved: 0 };
}

function randomIntInclusive(lo: number, hi: number): number {
  const a = Math.ceil(lo);
  const b = Math.floor(hi);
  if (b <= a) return a;
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return a + (buf[0] % (b - a + 1));
}

function isAmazonMeta(meta: ParsedOfferMetadata, item: IngestItem): boolean {
  return item.source === 'amazon_asin' || meta.store.toLowerCase().includes('amazon');
}

function passesAmazonHardFilters(
  meta: ParsedOfferMetadata,
  config: ReturnType<typeof loadBotIngestConfig>
): boolean {
  const s = meta.signals;
  if (s?.ratingCount != null && s.ratingCount >= config.minRatingReviewsCount) {
    if ((s.ratingAverage ?? 0) < config.minRatingAverage) return false;
  }
  return true;
}

export async function runIngestCycle(): Promise<IngestCycleReport> {
  const startedAt = new Date().toISOString();
  return runIngestCycleForProfile('standard', startedAt);
}

function emptySourceStats(): Record<IngestSourceId, IngestSourceStats> {
  return emptyIngestSourceStats();
}

function markSourceSkip(
  stats: Record<IngestSourceId, IngestSourceStats>,
  source: IngestSourceId,
  reason: string
) {
  stats[source].skipped += 1;
  const map = stats[source].skipReasonCounts ?? {};
  map[reason] = (map[reason] ?? 0) + 1;
  stats[source].skipReasonCounts = map;
}

export async function runIngestCycleForProfile(
  profile: IngestProfileId = 'standard',
  startedAt = new Date().toISOString(),
  opts?: { config?: ReturnType<typeof loadBotIngestConfig> }
): Promise<IngestCycleReport> {
  const config = opts?.config ?? loadBotIngestConfig(profile);
  const results: IngestSingleResult[] = [];
  const sourceStats = emptySourceStats();
  const stageCounts = {
    collected: 0,
    evaluated: 0,
    resolved: 0,
    insertedAttempted: 0,
  };

  const pausedByOwner = await getBotIngestPausedFromDb();
  const block = ingestRunBlockFromConfig(config, pausedByOwner);
  if (block === 'paused') {
    return {
      ok: true,
      enabled: false,
      pausedByOwner: true,
      envIngestEnabled: config.enabled,
      profile,
      startedAt,
      finishedAt: new Date().toISOString(),
      maxPerRun: 0,
      runMode: 'skipped',
      dailyInsertedApprox: null,
      dailyCap: config.dailyMaxOffers,
      rotationWave: null,
      results,
      summary: emptySummary(),
    };
  }

  if (block === 'disabled') {
    return {
      ok: true,
      enabled: false,
      profile,
      startedAt,
      finishedAt: new Date().toISOString(),
      maxPerRun: 0,
      runMode: 'off',
      dailyInsertedApprox: null,
      dailyCap: config.dailyMaxOffers,
      rotationWave: null,
      results,
      summary: emptySummary(),
    };
  }

  if (block === 'missing_bot_user') {
    return {
      ok: false,
      enabled: true,
      profile,
      startedAt,
      finishedAt: new Date().toISOString(),
      maxPerRun: 0,
      runMode: 'error',
      dailyInsertedApprox: null,
      dailyCap: config.dailyMaxOffers,
      rotationWave: null,
      results: [
        {
          url: '',
          status: 'error',
          message:
            'BOT_INGEST_USER_ID (o TECH+STAPLES) es obligatorio cuando BOT_INGEST_ENABLED=true',
        },
      ],
      summary: { ...emptySummary(), errors: 1 },
    };
  }

  const now = new Date();
  const tz = config.timezone;
  const ymd = formatYmdInTz(now, tz);
  const { hour, minute } = getZonedHourMinute(now, tz);
  const lastBoost = await getBotIngestLastBoostYmd();

  const inMorningSustained =
    config.morningSustainedEnabled &&
    hour >= config.morningHourStart &&
    hour < config.morningHourEndExclusive;

  const inLegacyBoost =
    !inMorningSustained &&
    lastBoost !== ymd &&
    hour === config.boostLocalHourStart &&
    minute <= config.boostLocalMinuteEnd;

  let targetMax: number;
  if (inMorningSustained) {
    targetMax = randomIntInclusive(config.morningMaxPerRunMin, config.morningMaxPerRunMax);
  } else if (inLegacyBoost) {
    targetMax = config.boostMaxOffers;
  } else {
    targetMax = randomIntInclusive(config.normalMaxPerRunMin, config.normalMaxPerRunMax);
  }

  const fastPace = inMorningSustained || inLegacyBoost;

  const dayStart = getBotOfferCountStartUtc(tz, now);
  const countToday = await countBotOffersCreatedSinceMulti(config.botUserIdsForQuota, dayStart);
  const remaining = Math.max(0, config.dailyMaxOffers - countToday);

  if (remaining <= 0) {
    return {
      ok: true,
      enabled: true,
      profile,
      startedAt,
      finishedAt: new Date().toISOString(),
      maxPerRun: 0,
      runMode: 'daily_cap',
      dailyInsertedApprox: countToday,
      dailyCap: config.dailyMaxOffers,
      rotationWave: computeSourceRotationWave(now, tz),
      results: [
        {
          url: '',
          status: 'skipped',
          reason: `tope diario alcanzado (${config.dailyMaxOffers})`,
        },
      ],
      summary: { ...emptySummary(), skipped: 1 },
    };
  }

  targetMax = Math.min(targetMax, remaining);

  const delayLo = fastPace ? 90 : 200;
  const delayHi = fastPace ? 240 : 560;

  const rotationWave = computeSourceRotationWave(now, tz);
  const collection = await collectIngestItems(config, rotationWave);
  const pool = collection.items;
  for (const [source, diagnostics] of Object.entries(collection.discoveryDiagnostics ?? {})) {
    const typedSource = source as IngestSourceId;
    if (typeof diagnostics?.collectedCount === 'number') {
      sourceStats[typedSource].collected += diagnostics.collectedCount;
    }
    if (diagnostics?.skipReasonCounts) {
      for (const [reason, count] of Object.entries(diagnostics.skipReasonCounts)) {
        sourceStats[typedSource].skipped += count;
        const map = sourceStats[typedSource].skipReasonCounts ?? {};
        map[reason] = (map[reason] ?? 0) + count;
        sourceStats[typedSource].skipReasonCounts = map;
      }
    }
  }
  for (const item of pool) {
    if (sourceStats[item.source].collected === 0) sourceStats[item.source].collected += 1;
  }
  const slice = pool.slice(0, config.candidatePoolMax);
  stageCounts.collected = slice.length;

  const metaByUrl = new Map<string, ParsedOfferMetadata>();
  const resolvedByUrl = new Map<string, ObservedResolved>();
  const discoverySkipUrls: Array<{
    url: string;
    title?: string | null;
    reason?: string;
    source?: string;
  }> = [];
  for (const [source, diagnostics] of Object.entries(collection.discoveryDiagnostics ?? {})) {
    for (const skip of diagnostics?.skippedCandidates ?? []) {
      discoverySkipUrls.push({
        url: skip.url,
        title: skip.title,
        reason: skip.reason,
        source,
      });
    }
  }

  type Resolved = {
    item: IngestItem;
    meta: ParsedOfferMetadata;
    decision: 'auto_approve' | 'pending' | 'reject';
    total: number;
    breakdown: ScoreBreakdown;
    autonomous: AutonomousDecisionResult | null;
  };

  const resolved: Resolved[] = [];
  let scoreRejected = 0;
  const shadowDup = createDuplicateShadowContext();
  beginAutonomousShadowCycle();
  const enrichCache = new Map<string, ParsedOfferMetadata>();
  const supplyRunId = crypto.randomUUID();
  const qualificationBySource: Partial<Record<IngestSourceId, QualificationCounts>> = {};
  const rejectedBySource: Partial<Record<IngestSourceId, number>> = {};
  const pendingBySource: Partial<Record<IngestSourceId, number>> = {};

  // Discovery Experiment: early persist pool URLs + discovery skips (zero silent drops).
  if (isHunterDiscoveryExperimentEnabled()) {
    try {
      const sightings = [
        ...pool.map((item) => {
          const detail = item.sourceDetail ?? null;
          const parsed = parseDiscoverySourceDetail(detail);
          return {
            canonicalUrl: item.url,
            source: item.source,
            title: item.precomputedMeta?.title ?? null,
            salePrice: item.precomputedMeta?.discountPrice ?? null,
            originalPrice: item.precomputedMeta?.originalPrice ?? null,
            discountPct: item.precomputedMeta?.discountPercent ?? null,
            rotCategoryId:
              item.precomputedMeta?.signals?.categoryId ?? parsed.rotCategoryId ?? null,
            rotQuery: parsed.rotQuery,
            rotSeedId: parsed.rotSeedId,
            rotPage: parsed.page,
            rawMetadata: { sourceDetail: detail },
          };
        }),
        ...discoverySkipUrls
          .filter((s) => Boolean(s.url?.trim()))
          .map((s) => ({
            canonicalUrl: s.url,
            source: s.source ?? 'ml_api',
            title: s.title ?? null,
            salePrice: null as number | null,
            originalPrice: null as number | null,
            discountPct: null as number | null,
            rotCategoryId: null as string | null,
            rawMetadata: { discoverySkip: true, reason: s.reason ?? null },
          })),
      ];
      const early = await earlyPersistDiscoverySightings({
        supabase: shadowDup.supabase,
        runId: supplyRunId,
        sightings,
        minDiscountPercent: config.minDiscountPercent,
      });
      if (early.error) {
        console.warn('[hunter_discovery_experiment] early persist', early.error);
      } else if (early.enabled) {
        console.info(
          `[hunter_discovery_experiment] early run=${supplyRunId} variant=${early.variant} events=${early.eventsWritten} candidates=${early.candidatesWritten}`,
        );
      }
    } catch (err) {
      console.warn(
        '[hunter_discovery_experiment] early persist failed',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  for (const item of slice) {
    sourceStats[item.source].evaluated += 1;
    stageCounts.evaluated += 1;
    try {
      const parseAttempt = item.precomputedMeta
        ? { meta: { ...item.precomputedMeta }, diagnostic: 'ok' as const }
        : await fetchParsedOfferMetadataDetailed(item.url);
      const meta = parseAttempt.meta
        ? (
            await enrichParsedOfferMetadata(
              await enrichWithPriceIntel({ ...parseAttempt.meta }, config),
              {
                source: item.source,
                sourceDetail: item.sourceDetail,
                skipHtml:
                  !item.precomputedMeta ||
                  isValidOfferImage(parseAttempt.meta.imageUrl),
                cache: enrichCache,
              }
            )
          ).meta
        : null;
      if (!meta) {
        const reason =
          parseAttempt.diagnostic === 'timeout'
            ? 'timeout al obtener metadatos'
            : parseAttempt.diagnostic === 'http_error'
              ? `HTTP ${parseAttempt.httpStatus ?? '?'} al obtener metadatos`
              : parseAttempt.diagnostic === 'missing_title'
                ? 'sin título parseable'
                : parseAttempt.diagnostic === 'missing_discount_price'
                  ? 'sin precio actual parseable'
                  : 'sin metadatos';
        results.push({ url: item.url, source: item.source, status: 'skipped', reason });
        markSourceSkip(sourceStats, item.source, reason);
        await sleep(randomIntInclusive(delayLo, delayHi));
        continue;
      }
      metaByUrl.set(item.url, meta);
      if (meta.canonicalUrl) metaByUrl.set(meta.canonicalUrl, meta);

      // Quality gates: NO observe (mismo contrato que processExternalWorkerBatch).
      const qualification = item.qualification ?? qualifyParsedOfferMetadata(meta);
      trackIngestQualification(qualificationBySource, item.source, qualification.qualification);
      if (isDayToDaySourceId(item.source)) {
        if (!item.qualification) {
          recordDealQualification(item.source, qualification);
        }
        if (!qualification.continueToPipeline) {
          const reason = qualification.primaryReason;
          results.push({ url: item.url, source: item.source, status: 'skipped', reason });
          markSourceSkip(sourceStats, item.source, reason);
          continue;
        }
      }

      if (meta.originalPrice == null || meta.originalPrice <= meta.discountPrice) {
        const reason =
          parseAttempt.diagnostic === 'missing_original_price'
            ? 'sin precio original verificable'
            : 'sin precio original verificable';
        results.push({ url: item.url, source: item.source, status: 'skipped', reason });
        markSourceSkip(sourceStats, item.source, reason);
        continue;
      }
      if (meta.discountPercent == null || meta.discountPercent < config.minDiscountPercent) {
        const reason =
          meta.discountPercent == null
            ? 'descuento desconocido (sin evidencia calculable)'
            : `descuento ${meta.discountPercent}% < mínimo ${config.minDiscountPercent}%`;
        results.push({
          url: item.url,
          source: item.source,
          status: 'skipped',
          reason,
        });
        markSourceSkip(sourceStats, item.source, reason);
        continue;
      }
      if (isLowQualityTitle(meta.title, config)) {
        const reason = 'título marcado como baja calidad';
        results.push({ url: item.url, source: item.source, status: 'skipped', reason });
        markSourceSkip(sourceStats, item.source, reason);
        continue;
      }
      if (isAmazonMeta(meta, item) && !passesAmazonHardFilters(meta, config)) {
        const reason = 'rating Amazon bajo umbral';
        results.push({ url: item.url, source: item.source, status: 'skipped', reason });
        markSourceSkip(sourceStats, item.source, reason);
        continue;
      }

      const verified = evaluateDealSafe({
        meta,
        config,
        source: item.source,
        url: item.url,
      });
      // Duplicado de insert (más abajo) sí se observó. Skips de quality, no.
      const autonomous = await observeIngestShadow({
        verifier: verified,
        meta,
        source: item.source,
        sourceDetail: item.sourceDetail,
        config,
        supabase: shadowDup.supabase,
        duplicateCache: shadowDup.cache,
      });
      if (verified.decision === 'reject') {
        rejectedBySource[item.source] = (rejectedBySource[item.source] ?? 0) + 1;
        scoreRejected += 1;
        const reason =
          verified.reasons[0] ?? `score ${verified.score} < mínimo publicación`;
        resolvedByUrl.set(item.url, {
          meta,
          decision: verified.ingestDecision,
          total: verified.score,
          breakdown: verified.breakdown,
          dqeQualification: qualification.qualification,
        });
        results.push({
          url: item.url,
          source: item.source,
          status: 'skipped',
          reason,
        });
        markSourceSkip(sourceStats, item.source, reason);
        continue;
      }

      resolved.push({
        item,
        meta,
        decision: verified.ingestDecision,
        total: verified.score,
        breakdown: verified.breakdown,
        autonomous,
      });
      resolvedByUrl.set(item.url, {
        meta,
        decision: verified.ingestDecision,
        total: verified.score,
        breakdown: verified.breakdown,
        dqeQualification: qualification.qualification,
      });
      stageCounts.resolved += 1;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      results.push({ url: item.url, source: item.source, status: 'error', message });
      sourceStats[item.source].errors += 1;
    }

    await sleep(randomIntInclusive(delayLo, delayHi));
  }

  const insertQueue = selectTopKByScore(
    resolved.map((r) => ({ ...r, score: r.total })),
    targetMax,
  );
  const insertQueueUrls = new Set(insertQueue.map((r) => r.item.url));
  const topKCutUrls = resolved
    .map((r) => r.item.url)
    .filter((url) => !insertQueueUrls.has(url));
  for (const url of topKCutUrls) {
    const row = resolved.find((r) => r.item.url === url);
    results.push({
      url,
      source: row?.item.source ?? 'ml_api',
      status: 'skipped',
      reason: 'score_shortlist_cut',
    });
    if (row) markSourceSkip(sourceStats, row.item.source, 'score_shortlist_cut');
  }

  // S9.1: discovery-only. Never call insertIngestedOffer from legacy cron.
  // Canonical mint: S9 → withMachinePendingWritesEnabled → writePendingViaS7Bridge → S7.
  const autoApproved = 0;
  for (const r of insertQueue) {
    results.push({
      url: r.item.url,
      source: r.item.source,
      status: 'skipped',
      reason: S91_DISCOVERY_ONLY_SKIP_REASON,
    });
    markSourceSkip(sourceStats, r.item.source, S91_DISCOVERY_ONLY_SKIP_REASON);
  }

  if (inLegacyBoost) {
    await setBotIngestLastBoostYmd(ymd);
  }

  const skipReasonCounts: Record<string, number> = {};
  for (const stats of Object.values(sourceStats)) {
    for (const [reason, count] of Object.entries(stats.skipReasonCounts ?? {})) {
      skipReasonCounts[reason] = (skipReasonCounts[reason] ?? 0) + count;
    }
  }
  for (const r of results) {
    if (r.status === 'skipped') {
      skipReasonCounts[r.reason] = (skipReasonCounts[r.reason] ?? 0) + 1;
    }
  }

  const duplicateKindCounts = countDuplicateKinds(results);
  const supplyOpportunities = countSupplyOpportunities(results);
  const summary: IngestCycleReport['summary'] = {
    inserted: 0,
    duplicate: results.filter((r) => r.status === 'duplicate').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    errors: results.filter((r) => r.status === 'error').length,
    rejected: scoreRejected,
    autoApproved,
    ...(Object.keys(skipReasonCounts).length > 0 ? { skipReasonCounts } : {}),
    ...(Object.keys(duplicateKindCounts).length > 0 ? { duplicateKindCounts } : {}),
    ...(supplyOpportunities > 0 ? { supplyOpportunities } : {}),
    sourceStats,
    stageCounts: {
      ...stageCounts,
      insertedAttempted: 0,
    },
  };

  const shadow = await persistShadowCycleSnapshot({ supabase: shadowDup.supabase });
  const finishedAt = new Date().toISOString();
  await persistIngestSupplyRuns({
    runId: supplyRunId,
    startedAt,
    finishedAt,
    sourceStats,
    qualificationBySource,
    rejectedBySource,
    pendingBySource,
    shadowCycleId: shadow.persisted ? shadow.cycleId : null,
    supabase: shadowDup.supabase ?? undefined,
  });

  if (isHunterCandidateIntelligenceEnabled()) {
    try {
      const observed = observeIngestBatch({
        runId: supplyRunId,
        startedAt,
        finishedAt,
        dryRun: true,
        source: 'ml_api',
        rawCandidateUrls: discoverySkipUrls,
        itemUrls: pool.map((i) => i.url),
        sliceUrls: slice.map((i) => i.url),
        results,
        metaByUrl,
        resolvedByUrl,
        topKCutUrls,
      });
      summary.candidateIntelligence = observed.summary;
      const recon = assertZeroSilentDrops(observed.summary);
      if (!recon.ok) {
        console.warn(
          `[hunter_candidate_intelligence] reconciliation gap run=${supplyRunId} discovered=${recon.discovered} terminal=${recon.terminalSum} gap=${recon.gap}`,
        );
      }
      const topKSet = new Set(topKCutUrls.map((u) => u.toLowerCase()));
      const annotated = isHunterDiscoveryExperimentEnabled()
        ? applyWouldCutAnnotations(observed.records, { topKUrls: topKSet }).map((r) => ({
            ...r,
            experimentId: r.experimentId ?? 'discovery_exp_v2',
            wouldTopkCut:
              r.wouldTopkCut === true || topKSet.has(r.canonicalUrl.toLowerCase()),
            persistedPreGate: r.persistedPreGate === true,
          }))
        : observed.records;
      const wrote = await persistHunterCandidates(shadowDup.supabase, annotated);
      if (!wrote.ok) {
        console.warn('[hunter_candidate_intelligence] persist candidates failed', wrote.error);
      }
      const runWrote = await persistHunterIntelligenceRun(shadowDup.supabase, observed.summary);
      if (!runWrote.ok) {
        console.warn('[hunter_candidate_intelligence] persist run failed', runWrote.error);
      } else {
        console.info(
          `[hunter_candidate_intelligence] cycle run=${supplyRunId} candidates=${observed.summary.candidateCount} rejected=${observed.summary.rejectedCount} would_insert=${observed.summary.wouldInsertCount} recon_ok=${recon.ok}`,
        );
      }
    } catch (err) {
      console.warn(
        '[hunter_candidate_intelligence] cycle observe failed',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return {
    ok: summary.errors === 0,
    enabled: true,
    profile,
    startedAt,
    finishedAt,
    maxPerRun: targetMax,
    runMode: 'discovery_only',
    dailyInsertedApprox: countToday,
    dailyCap: config.dailyMaxOffers,
    rotationWave,
    results,
    summary,
  };
}
