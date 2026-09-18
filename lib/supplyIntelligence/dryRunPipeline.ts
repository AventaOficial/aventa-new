/**
 * SourceAdapter dry-run pipeline — S4.
 *
 * SOURCE → RawObservation → normalize → DealScore/DQE/Verifier signals → gate
 * → DISCOVERED | NORMALIZED | SCORED | SUPPRESSED | DUPLICATE | WOULD_INSERT | FAILED
 *
 * NEVER inserts offers.pending.
 * NEVER calls Distribution / Telegram / Rewards.
 */

import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import {
  evaluateMachineCandidateGate,
  type CandidateGateAction,
} from '@/lib/bots/ingest/candidateInsertGate';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import { scoreIngestCandidate } from '@/lib/bots/ingest/scoreIngestCandidate';
import {
  computeDealScore,
  DEAL_SCORE_VERSION,
  type DealScore,
} from '@/lib/dealIntelligence';
import {
  dedupeRawObservationsByIdempotency,
  withProcessingStatus,
  type RawObservation,
} from '@/lib/dealIntelligence/rawObservation';
import type { DuplicateOfferKind } from '@/lib/offers/findDuplicateOffer';
import { strongProductFingerprintForUrl } from '@/lib/offers/findDuplicateOffer';
import type { SourceAdapter, SourceAdapterSafety } from './sourceAdapter';
import {
  createMlWorkerListingAdapter,
  ML_WORKER_ADAPTER_SOURCE_ID,
  normalizeMlWorkerListing,
  type MlWorkerListingDiscoverInput,
} from './adapters/mlWorkerListingAdapter';

export type DryRunOutcomeStatus =
  | 'DISCOVERED'
  | 'NORMALIZED'
  | 'SCORED'
  | 'SUPPRESSED'
  | 'DUPLICATE'
  | 'WOULD_INSERT'
  | 'FAILED';

export type DryRunItemResult = {
  status: DryRunOutcomeStatus;
  reason: string;
  sourceEventId: string | null;
  observationId: string | null;
  observationIdempotencyKey: string | null;
  productFingerprint: string | null;
  dealScore: number | null;
  dealScoreVersion: string | null;
  gateAction: CandidateGateAction | null;
  latencyMs: number;
  /** Explicit: dry-run never mutates offers. */
  offerInserted: false;
};

export type DryRunReport = {
  sourceId: string;
  runId: string;
  startedAt: string;
  finishedAt: string;
  dryRun: true;
  safety: SourceAdapterSafety;
  sampleSizeRequested: number;
  discoveries: number;
  normalizationSuccesses: number;
  normalizationFailures: number;
  verifierRejects: number;
  lowQualitySuppressions: number;
  duplicateSuppressions: number;
  wouldInsertCount: number;
  errorCount: number;
  scoreDistribution: { min: number | null; max: number | null; avg: number | null };
  latencyMs: number;
  discoverLatencyMs: number;
  items: DryRunItemResult[];
  note: string;
};

export type DryRunDuplicateLookup = (input: {
  canonicalUrl: string;
  productFingerprint: string | null;
}) => { kind: DuplicateOfferKind; price?: number | null } | null;

export type RunSourceAdapterDryRunOptions = {
  adapter: SourceAdapter;
  listingMetasBySourceEventId: Map<string, ParsedOfferMetadata>;
  config: BotIngestConfig;
  maxItems?: number;
  runId?: string;
  now?: Date;
  duplicateLookup?: DryRunDuplicateLookup;
};

function emptyScoreDist(): DryRunReport['scoreDistribution'] {
  return { min: null, max: null, avg: null };
}

function readDistributionFlag(): boolean {
  const v = (process.env.DISTRIBUTION_ENGINE_ENABLED ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function buildSourceAdapterSafety(): SourceAdapterSafety {
  return {
    distributionEngineEnabled: readDistributionFlag(),
    adapterCanInsertOffers: false,
    dryRunForced: true,
  };
}

/** Minimal BotIngestConfig for dry-run gates — mirrors production defaults, no env mutation. */
export function createDryRunGateConfig(
  over: Partial<BotIngestConfig> = {},
): BotIngestConfig {
  return {
    profile: 'standard',
    enabled: true,
    botUserId: 'dry-run',
    botUserIdTech: null,
    botUserIdStaples: null,
    botAuthorDualMode: false,
    botUserIdsForQuota: ['dry-run'],
    morningSustainedEnabled: false,
    morningHourStart: 5,
    morningHourEndExclusive: 11,
    morningMaxPerRunMin: 2,
    morningMaxPerRunMax: 5,
    timezone: 'America/Mexico_City',
    normalMaxPerRunMin: 1,
    normalMaxPerRunMax: 3,
    boostMaxOffers: 20,
    boostLocalHourStart: 7,
    boostLocalMinuteEnd: 30,
    dailyMaxOffers: 120,
    candidatePoolMax: 40,
    maxPerRun: 5,
    minDiscountPercent: 20,
    category: null,
    supplyNicheId: null,
    urlsFromEnv: [],
    discoverMlEnabled: false,
    mlQueries: [],
    mlCategoryIds: [],
    mlUseDefaultQueries: true,
    mlSearchLimitPerRequest: 50,
    mlMaxCollect: 80,
    mlSortTrending: 'sold_quantity_desc',
    techCategoryIds: ['MLM1648'],
    techCategoryIdSet: new Set(['MLM1648']),
    amazonAsins: [],
    amazonDpBase: 'https://www.amazon.com.mx/dp/',
    amazonSource: 'scrape',
    amazonPaapiEnabled: false,
    amazonPaapiAccessKey: null,
    amazonPaapiSecretKey: null,
    amazonPaapiPartnerTag: null,
    amazonPaapiHost: 'webservices.amazon.com.mx',
    amazonPaapiRegion: 'us-east-1',
    minSoldQuantityMl: 50,
    minRatingAverage: 4,
    minRatingReviewsCount: 5,
    mlFetchReviews: false,
    mlReviewFetchMax: 0,
    keepaEnabled: false,
    keepaApiKey: null,
    keepaDomainId: 11,
    autoApproveEnabled: false,
    legacyAutoApproveWriteEnabled: false,
    autoApproveMinScore: 78,
    autoApproveWorkerMinScore: 55,
    autoApproveWorkerMinDiscountPercent: 28,
    autoApproveRequireImage: true,
    workerMaxPerRun: 10,
    rejectBelowScore: 40,
    forcePendingMinScore: null,
    scoreWeights: {
      discount: 0.28,
      popularity: 0.22,
      rating: 0.2,
      category: 0.15,
      priceAppeal: 0.15,
    },
    titleBlocklistGenericRe: null,
    titleBlocklistSpamRe: null,
    ...over,
  } as BotIngestConfig;
}

function scoreStats(scores: number[]): DryRunReport['scoreDistribution'] {
  if (scores.length === 0) return emptyScoreDist();
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const avg = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
  return { min, max, avg };
}

export function evaluateObservationDryRun(input: {
  observation: RawObservation;
  meta: ParsedOfferMetadata | null;
  config: BotIngestConfig;
  duplicate?: { kind: DuplicateOfferKind; price?: number | null } | null;
}): {
  status: DryRunOutcomeStatus;
  reason: string;
  dealScore: DealScore | null;
  gateAction: CandidateGateAction | null;
  observation: RawObservation;
} {
  if (!input.meta) {
    return {
      status: 'FAILED',
      reason: 'missing_normalized_meta',
      dealScore: null,
      gateAction: null,
      observation: withProcessingStatus(input.observation, 'failed'),
    };
  }

  const scored = scoreIngestCandidate(input.meta, input.meta.signals, input.config);
  const dealScore = computeDealScore({
    meta: {
      discountPrice: input.meta.discountPrice,
      originalPrice: input.meta.originalPrice,
      discountPercent: input.meta.discountPercent,
    },
    signals: input.meta.signals ?? null,
  });

  const gate = evaluateMachineCandidateGate({
    url: input.meta.canonicalUrl,
    meta: input.meta,
    config: input.config,
    verifierDecision: scored.decision,
    verifierReasons:
      scored.decision === 'reject'
        ? [`score ${scored.breakdown.total} < ${input.config.rejectBelowScore}`]
        : [],
    duplicate: input.duplicate
      ? { kind: input.duplicate.kind, price: input.duplicate.price ?? null }
      : null,
    dealScore,
  });

  if (gate.action === 'invalid' || gate.action === 'suppress') {
    return {
      status: 'SUPPRESSED',
      reason: gate.reason,
      dealScore,
      gateAction: gate.action,
      observation: withProcessingStatus(input.observation, 'suppressed'),
    };
  }
  if (gate.action === 'reject_quality') {
    return {
      status: 'SUPPRESSED',
      reason: gate.reason,
      dealScore,
      gateAction: gate.action,
      observation: withProcessingStatus(input.observation, 'suppressed'),
    };
  }
  if (gate.action === 'duplicate') {
    return {
      status: 'DUPLICATE',
      reason: gate.reason,
      dealScore,
      gateAction: gate.action,
      observation: withProcessingStatus(input.observation, 'duplicate'),
    };
  }

  return {
    status: 'WOULD_INSERT',
    reason: 'passed_machine_gates_dry_run',
    dealScore,
    gateAction: 'insert_pending',
    observation: withProcessingStatus(input.observation, 'scored'),
  };
}

export async function runSourceAdapterDryRun(
  opts: RunSourceAdapterDryRunOptions,
): Promise<DryRunReport> {
  const startedAt = (opts.now ?? new Date()).toISOString();
  const t0 = Date.now();
  const runId = opts.runId ?? `dry_${Date.now().toString(36)}`;
  const maxItems = Math.min(50, Math.max(1, opts.maxItems ?? 20));
  const safety = buildSourceAdapterSafety();

  const discover = await opts.adapter.discover({
    maxItems,
    now: opts.now,
    runId,
  });

  const items: DryRunItemResult[] = [];
  const scores: number[] = [];
  let normalizationSuccesses = 0;
  let normalizationFailures = 0;
  let verifierRejects = 0;
  let lowQualitySuppressions = 0;
  let duplicateSuppressions = 0;
  let wouldInsertCount = 0;
  let errorCount = 0;

  const discoveredObs: RawObservation[] = [];

  for (const item of discover.items) {
    const itemT0 = Date.now();
    if (item.status === 'rejected') {
      normalizationFailures += 1;
      items.push({
        status: 'FAILED',
        reason: item.reason,
        sourceEventId: null,
        observationId: null,
        observationIdempotencyKey: null,
        productFingerprint: null,
        dealScore: null,
        dealScoreVersion: null,
        gateAction: null,
        latencyMs: Date.now() - itemT0,
        offerInserted: false,
      });
      continue;
    }

    discoveredObs.push(item.observation);
    normalizationSuccesses += 1;

    const meta =
      opts.listingMetasBySourceEventId.get(item.observation.sourceEvent.sourceEventId) ?? null;
    const fp =
      item.observation.identity.productFingerprint ??
      (meta ? strongProductFingerprintForUrl(meta.canonicalUrl) : null);

    const dup =
      opts.duplicateLookup?.({
        canonicalUrl: item.observation.url,
        productFingerprint: fp,
      }) ?? null;

    const evaluated = evaluateObservationDryRun({
      observation: item.observation,
      meta,
      config: opts.config,
      duplicate: dup,
    });

    if (evaluated.dealScore) scores.push(evaluated.dealScore.score);
    if (evaluated.status === 'WOULD_INSERT') wouldInsertCount += 1;
    if (evaluated.status === 'DUPLICATE') duplicateSuppressions += 1;
    if (evaluated.status === 'SUPPRESSED') {
      if (evaluated.gateAction === 'reject_quality') verifierRejects += 1;
      else lowQualitySuppressions += 1;
    }
    if (evaluated.status === 'FAILED') errorCount += 1;

    items.push({
      status: evaluated.status,
      reason: evaluated.reason,
      sourceEventId: item.observation.sourceEvent.sourceEventId,
      observationId: item.observation.observationId,
      observationIdempotencyKey: item.observation.idempotencyKey,
      productFingerprint: fp,
      dealScore: evaluated.dealScore?.score ?? null,
      dealScoreVersion: evaluated.dealScore?.version ?? DEAL_SCORE_VERSION,
      gateAction: evaluated.gateAction,
      latencyMs: Date.now() - itemT0,
      offerInserted: false,
    });
  }

  const deduped = dedupeRawObservationsByIdempotency(discoveredObs);
  const finishedAt = new Date(opts.now?.getTime() ?? Date.now()).toISOString();

  return {
    sourceId: opts.adapter.id,
    runId,
    startedAt,
    finishedAt,
    dryRun: true,
    safety,
    sampleSizeRequested: maxItems,
    discoveries: discoveredObs.length,
    normalizationSuccesses,
    normalizationFailures,
    verifierRejects,
    lowQualitySuppressions,
    duplicateSuppressions,
    wouldInsertCount,
    errorCount,
    scoreDistribution: scoreStats(scores),
    latencyMs: Date.now() - t0,
    discoverLatencyMs: discover.latencyMs,
    items,
    note: `dry-run only · would_insert=${wouldInsertCount} · batch_obs_dupes=${deduped.duplicateKeys.length} · DISTRIBUTION_ENGINE_ENABLED=${safety.distributionEngineEnabled} · offers_inserted=0`,
  };
}

export async function runMlWorkerListingDryRun(input: {
  candidates: MlWorkerListingDiscoverInput['candidates'];
  config?: BotIngestConfig;
  maxItems?: number;
  runId?: string;
  now?: Date;
  duplicateLookup?: DryRunDuplicateLookup;
}): Promise<DryRunReport> {
  const adapter = createMlWorkerListingAdapter({ candidates: input.candidates });
  const metaByEvent = new Map<string, ParsedOfferMetadata>();
  for (const c of input.candidates) {
    const n = normalizeMlWorkerListing(c);
    if (n.ok) metaByEvent.set(n.value.sourceEventId, n.value.meta);
  }
  return runSourceAdapterDryRun({
    adapter,
    listingMetasBySourceEventId: metaByEvent,
    config: input.config ?? createDryRunGateConfig(),
    maxItems: input.maxItems,
    runId: input.runId,
    now: input.now,
    duplicateLookup: input.duplicateLookup,
  });
}

export const S4_SOURCE_ID = ML_WORKER_ADAPTER_SOURCE_ID;
