import { countBotOffersCreatedSinceMulti, getBotOfferCountStartUtc } from './botIngestDailyState';
import { loadBotIngestConfig, type BotIngestConfig } from './config';
import { getZonedHourMinute } from './ingestZonedTime';
import type { ParsedOfferMetadata } from './fetchParsedOfferMetadata';
import type {
  IngestCycleReport,
  IngestItem,
  IngestProfileId,
  IngestSingleResult,
  IngestSourceId,
  IngestSourceStats,
} from './types';
import { insertIngestedOffer } from './insertIngestedOffer';
import { optimizeIngestTitle } from './optimizeIngestTitle';
import { isLowQualityTitle } from './isLowQualityTitle';
import { scoreIngestCandidate, type ScoreBreakdown } from './scoreIngestCandidate';
import { enrichWithPriceIntel } from './priceIntel';

type ExternalCandidateSignals = NonNullable<ParsedOfferMetadata['signals']>;

export type ExternalWorkerCandidate = {
  url: string;
  title: string;
  store?: string | null;
  imageUrl?: string | null;
  discountPrice: number;
  originalPrice: number | null;
  discountPercent?: number | null;
  canonicalUrl?: string | null;
  sourceDetail?: string | null;
  signals?: Partial<ExternalCandidateSignals> | null;
};

export type ExternalWorkerBatchPayload = {
  profile?: IngestProfileId;
  dryRun?: boolean;
  candidates: ExternalWorkerCandidate[];
};

function randomIntInclusive(lo: number, hi: number): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function emptySourceStats(): Record<IngestSourceId, IngestSourceStats> {
  return {
    env_urls: { collected: 0, evaluated: 0, inserted: 0, duplicate: 0, skipped: 0, errors: 0 },
    rss: { collected: 0, evaluated: 0, inserted: 0, duplicate: 0, skipped: 0, errors: 0 },
    ml_api: { collected: 0, evaluated: 0, inserted: 0, duplicate: 0, skipped: 0, errors: 0 },
    amazon_asin: { collected: 0, evaluated: 0, inserted: 0, duplicate: 0, skipped: 0, errors: 0 },
    ml_worker: { collected: 0, evaluated: 0, inserted: 0, duplicate: 0, skipped: 0, errors: 0 },
  };
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

function normalizeSignals(
  signals: Partial<ExternalCandidateSignals> | null | undefined
): ParsedOfferMetadata['signals'] | undefined {
  if (!signals) return undefined;
  const out: ExternalCandidateSignals = {};

  if (typeof signals.ratingAverage === 'number' && Number.isFinite(signals.ratingAverage)) {
    out.ratingAverage = signals.ratingAverage;
  }
  if (typeof signals.ratingCount === 'number' && Number.isFinite(signals.ratingCount)) {
    out.ratingCount = signals.ratingCount;
  }
  if (typeof signals.soldQuantity === 'number' && Number.isFinite(signals.soldQuantity)) {
    out.soldQuantity = signals.soldQuantity;
  }
  if (typeof signals.condition === 'string' && signals.condition.trim()) {
    out.condition = signals.condition.trim();
  }
  if (typeof signals.categoryId === 'string' && signals.categoryId.trim()) {
    out.categoryId = signals.categoryId.trim();
  }
  if (typeof signals.listingTypeId === 'string' && signals.listingTypeId.trim()) {
    out.listingTypeId = signals.listingTypeId.trim();
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

function toParsedMeta(candidate: ExternalWorkerCandidate): ParsedOfferMetadata | null {
  const url = candidate.url?.trim();
  const title = candidate.title?.trim();
  const store = candidate.store?.trim() || 'Mercado Libre';
  const imageUrl = candidate.imageUrl?.trim() || '/placeholder.png';
  const canonicalUrl = candidate.canonicalUrl?.trim() || url;
  const discountPrice = Number(candidate.discountPrice);
  const originalPrice =
    candidate.originalPrice != null && Number.isFinite(Number(candidate.originalPrice))
      ? Number(candidate.originalPrice)
      : null;

  if (!url || !title || !canonicalUrl || !Number.isFinite(discountPrice) || discountPrice <= 0) {
    return null;
  }

  const computedDiscount =
    originalPrice != null && originalPrice > discountPrice
      ? Math.round((1 - discountPrice / originalPrice) * 100)
      : 0;
  const discountPercent =
    candidate.discountPercent != null && Number.isFinite(Number(candidate.discountPercent))
      ? Math.max(0, Math.round(Number(candidate.discountPercent)))
      : computedDiscount;

  return {
    canonicalUrl,
    title,
    store,
    imageUrl,
    discountPrice,
    originalPrice,
    discountPercent,
    ...(normalizeSignals(candidate.signals) ? { signals: normalizeSignals(candidate.signals) } : {}),
  };
}

function isAmazonMeta(meta: ParsedOfferMetadata, item: IngestItem): boolean {
  return item.source === 'amazon_asin' || meta.store.toLowerCase().includes('amazon');
}

function passesAmazonHardFilters(meta: ParsedOfferMetadata, config: BotIngestConfig): boolean {
  const s = meta.signals;
  if (s?.ratingCount != null && s.ratingCount >= config.minRatingReviewsCount) {
    if ((s.ratingAverage ?? 0) < config.minRatingAverage) return false;
  }
  return true;
}

function isPromoUnverifiedItem(item: IngestItem, meta: ParsedOfferMetadata): boolean {
  return (
    item.source === 'ml_worker' &&
    (item.sourceDetail ?? '').includes('promo-unverified') &&
    meta.discountPercent > 0
  );
}

function buildSkipSummary(results: IngestSingleResult[], sourceStats: Record<IngestSourceId, IngestSourceStats>) {
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
  return skipReasonCounts;
}

export async function processExternalWorkerBatch(
  payload: ExternalWorkerBatchPayload
): Promise<IngestCycleReport> {
  const startedAt = new Date().toISOString();
  const profile: IngestProfileId = payload.profile === 'mega' ? 'mega' : 'standard';
  const config = loadBotIngestConfig(profile);
  const sourceStats = emptySourceStats();
  const results: IngestSingleResult[] = [];
  const stageCounts = {
    collected: 0,
    evaluated: 0,
    resolved: 0,
    insertedAttempted: 0,
  };

  const rawCandidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  sourceStats.ml_worker.collected = rawCandidates.length;

  const seen = new Set<string>();
  const items: IngestItem[] = [];
  for (const candidate of rawCandidates) {
    const meta = toParsedMeta(candidate);
    if (!meta) {
      markSourceSkip(sourceStats, 'ml_worker', 'worker payload inválido');
      continue;
    }
    const key = meta.canonicalUrl.toLowerCase();
    if (seen.has(key)) {
      markSourceSkip(sourceStats, 'ml_worker', 'duplicado dentro del lote worker');
      continue;
    }
    seen.add(key);
    items.push({
      url: meta.canonicalUrl,
      source: 'ml_worker',
      sourceDetail: candidate.sourceDetail?.trim() || 'worker:ml',
      precomputedMeta: meta,
    });
  }

  const slice = items.slice(0, config.candidatePoolMax);
  stageCounts.collected = slice.length;

  type Resolved = {
    item: IngestItem;
    meta: ParsedOfferMetadata;
    decision: 'auto_approve' | 'pending' | 'reject';
    total: number;
    breakdown: ScoreBreakdown;
  };
  const resolved: Resolved[] = [];
  let scoreRejected = 0;

  for (const item of slice) {
    sourceStats[item.source].evaluated += 1;
    stageCounts.evaluated += 1;
    try {
      const meta = item.precomputedMeta ? await enrichWithPriceIntel({ ...item.precomputedMeta }, config) : null;
      if (!meta) {
        const reason = 'sin metadatos';
        results.push({ url: item.url, source: item.source, status: 'skipped', reason });
        markSourceSkip(sourceStats, item.source, reason);
        continue;
      }
      const promoUnverified = isPromoUnverifiedItem(item, meta);
      if (!promoUnverified && (meta.originalPrice == null || meta.originalPrice <= meta.discountPrice)) {
        const reason = 'sin precio original verificable';
        results.push({ url: item.url, source: item.source, status: 'skipped', reason });
        markSourceSkip(sourceStats, item.source, reason);
        continue;
      }
      if (meta.discountPercent < config.minDiscountPercent) {
        const reason = `descuento ${meta.discountPercent}% < mínimo ${config.minDiscountPercent}%`;
        results.push({ url: item.url, source: item.source, status: 'skipped', reason });
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

      const scored = scoreIngestCandidate(meta, meta.signals, config);
      if (scored.decision === 'reject') {
        scoreRejected += 1;
        const reason = `score ${scored.breakdown.total} < mínimo publicación`;
        results.push({ url: item.url, source: item.source, status: 'skipped', reason });
        markSourceSkip(sourceStats, item.source, reason);
        continue;
      }

      resolved.push({
        item,
        meta,
        decision: scored.decision,
        total: scored.breakdown.total,
        breakdown: scored.breakdown,
      });
      stageCounts.resolved += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ url: item.url, source: item.source, status: 'error', message });
      sourceStats[item.source].errors += 1;
    }
  }

  resolved.sort((a, b) => b.total - a.total);

  const nowWorker = new Date();
  const dayStart = getBotOfferCountStartUtc(config.timezone, nowWorker);
  const countToday = await countBotOffersCreatedSinceMulti(config.botUserIdsForQuota, dayStart);
  const slotsDaily = Math.max(0, config.dailyMaxOffers - countToday);

  const { hour } = getZonedHourMinute(nowWorker, config.timezone);
  const inMorningSustained =
    config.morningSustainedEnabled &&
    hour >= config.morningHourStart &&
    hour < config.morningHourEndExclusive;
  const maxPerRunCap = inMorningSustained
    ? randomIntInclusive(config.morningMaxPerRunMin, config.morningMaxPerRunMax)
    : randomIntInclusive(config.normalMaxPerRunMin, config.normalMaxPerRunMax);
  const maxInsertsThisBatch = Math.min(slotsDaily, maxPerRunCap);

  let autoApproved = 0;
  let insertedThisRun = 0;

  for (const row of resolved) {
    if (insertedThisRun >= maxInsertsThisBatch) break;

    const allowAuto = config.autoApproveEnabled && row.decision === 'auto_approve';
    const status = allowAuto ? 'approved' : 'pending';
    const title = optimizeIngestTitle(row.meta);
      const moderatorNote = isPromoUnverifiedItem(row.item, row.meta)
        ? 'promo ML sin precio original verificable; revisar descuento manualmente'
        : undefined;

    if (payload.dryRun) {
      insertedThisRun += 1;
      results.push({
        url: row.item.url,
        source: row.item.source,
        status: 'inserted',
        offerId: `dry-run-${insertedThisRun}`,
      });
      sourceStats[row.item.source].inserted += 1;
      if (status === 'approved') autoApproved += 1;
      continue;
    }

    stageCounts.insertedAttempted += 1;
    try {
      const ins = await insertIngestedOffer(row.meta, config, {
        status,
        titleOverride: title,
        ingestScore: row.total,
        scoreBreakdown: row.breakdown,
          moderatorNote,
      });
      if (ins.ok) {
        insertedThisRun += 1;
        results.push({ url: row.item.url, source: row.item.source, status: 'inserted', offerId: ins.offerId });
        sourceStats[row.item.source].inserted += 1;
        if (status === 'approved') autoApproved += 1;
      } else if ('duplicate' in ins && ins.duplicate) {
        results.push({ url: row.item.url, source: row.item.source, status: 'duplicate' });
        sourceStats[row.item.source].duplicate += 1;
      } else if ('error' in ins) {
        results.push({ url: row.item.url, source: row.item.source, status: 'error', message: ins.error });
        sourceStats[row.item.source].errors += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ url: row.item.url, source: row.item.source, status: 'error', message });
      sourceStats[row.item.source].errors += 1;
    }
  }

  const skipReasonCounts = buildSkipSummary(results, sourceStats);
  const summary = {
    inserted: results.filter((r) => r.status === 'inserted').length,
    duplicate: results.filter((r) => r.status === 'duplicate').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    errors: results.filter((r) => r.status === 'error').length,
    rejected: scoreRejected,
    autoApproved,
    ...(Object.keys(skipReasonCounts).length > 0 ? { skipReasonCounts } : {}),
    sourceStats,
    stageCounts,
  };

  return {
    ok: summary.errors === 0,
    enabled: true,
    envIngestEnabled: config.enabled,
    profile,
    startedAt,
    finishedAt: new Date().toISOString(),
    maxPerRun: maxInsertsThisBatch,
    runMode: inMorningSustained ? 'morning_sustained' : 'normal',
    dailyInsertedApprox: countToday + summary.inserted,
    dailyCap: config.dailyMaxOffers,
    rotationWave: null,
    results,
    summary,
  };
}
