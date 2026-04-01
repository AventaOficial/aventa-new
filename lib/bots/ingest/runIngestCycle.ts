import { loadBotIngestConfig } from './config';
import { getBotIngestPausedFromDb } from './botIngestPaused';
import {
  countBotOffersCreatedSince,
  getBotOfferCountStartUtc,
  getBotIngestLastBoostYmd,
  setBotIngestLastBoostYmd,
} from './botIngestDailyState';
import { collectIngestItems } from './collectIngestItems';
import { fetchParsedOfferMetadata } from './fetchParsedOfferMetadata';
import { insertIngestedOffer } from './insertIngestedOffer';
import { isLowQualityTitle } from './isLowQualityTitle';
import { optimizeIngestTitle } from './optimizeIngestTitle';
import { scoreIngestCandidate, type ScoreBreakdown } from './scoreIngestCandidate';
import { computeSourceRotationWave, formatYmdInTz, getZonedHourMinute } from './ingestZonedTime';
import { sleep } from './ingestHttp';
import { recalculateUserReputation } from '@/lib/server/reputation';
import type { IngestCycleReport, IngestSingleResult } from './types';
import type { IngestItem } from './types';
import type { ParsedOfferMetadata } from './fetchParsedOfferMetadata';

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
  const config = loadBotIngestConfig();
  const results: IngestSingleResult[] = [];

  const pausedByOwner = await getBotIngestPausedFromDb();
  if (pausedByOwner) {
    return {
      ok: true,
      enabled: false,
      pausedByOwner: true,
      envIngestEnabled: config.enabled,
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

  if (!config.enabled) {
    return {
      ok: true,
      enabled: false,
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

  if (!config.botUserId) {
    return {
      ok: false,
      enabled: true,
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
          message: 'BOT_INGEST_USER_ID es obligatorio cuando BOT_INGEST_ENABLED=true',
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
  const countToday = await countBotOffersCreatedSince(config.botUserId, dayStart);
  const remaining = Math.max(0, config.dailyMaxOffers - countToday);

  if (remaining <= 0) {
    return {
      ok: true,
      enabled: true,
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
  const pool = await collectIngestItems(config, rotationWave);
  const slice = pool.slice(0, config.candidatePoolMax);

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
    try {
      const meta = item.precomputedMeta
        ? { ...item.precomputedMeta }
        : await fetchParsedOfferMetadata(item.url);
      if (!meta) {
        results.push({ url: item.url, status: 'skipped', reason: 'sin metadatos' });
        await sleep(randomIntInclusive(delayLo, delayHi));
        continue;
      }

      if (meta.originalPrice == null || meta.originalPrice <= meta.discountPrice) {
        results.push({ url: item.url, status: 'skipped', reason: 'sin precio original verificable' });
        continue;
      }
      if (meta.discountPercent < config.minDiscountPercent) {
        results.push({
          url: item.url,
          status: 'skipped',
          reason: `descuento ${meta.discountPercent}% < mínimo ${config.minDiscountPercent}%`,
        });
        continue;
      }
      if (isLowQualityTitle(meta.title, config)) {
        results.push({ url: item.url, status: 'skipped', reason: 'título marcado como baja calidad' });
        continue;
      }
      if (isAmazonMeta(meta, item) && !passesAmazonHardFilters(meta, config)) {
        results.push({ url: item.url, status: 'skipped', reason: 'rating Amazon bajo umbral' });
        continue;
      }

      const scored = scoreIngestCandidate(meta, meta.signals, config);
      if (scored.decision === 'reject') {
        scoreRejected += 1;
        results.push({
          url: item.url,
          status: 'skipped',
          reason: `score ${scored.breakdown.total} < mínimo publicación`,
        });
        continue;
      }

      resolved.push({
        item,
        meta,
        decision: scored.decision,
        total: scored.breakdown.total,
        breakdown: scored.breakdown,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      results.push({ url: item.url, status: 'error', message });
    }

    await sleep(randomIntInclusive(delayLo, delayHi));
  }

  resolved.sort((a, b) => b.total - a.total);

  let autoApproved = 0;
  let insertedThisRun = 0;

  for (const r of resolved) {
    if (insertedThisRun >= targetMax) break;

    const allowAuto =
      config.autoApproveEnabled && r.decision === 'auto_approve';
    const status = allowAuto ? 'approved' : 'pending';
    const title = optimizeIngestTitle(r.meta);

    try {
      const ins = await insertIngestedOffer(r.meta, config, {
        status,
        titleOverride: title,
        ingestScore: r.total,
        scoreBreakdown: r.breakdown,
      });
      if (ins.ok) {
        insertedThisRun += 1;
        results.push({ url: r.item.url, status: 'inserted', offerId: ins.offerId });
        if (status === 'approved') autoApproved += 1;
      } else if ('duplicate' in ins && ins.duplicate) {
        results.push({ url: r.item.url, status: 'duplicate' });
      } else if ('error' in ins) {
        results.push({ url: r.item.url, status: 'error', message: ins.error });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      results.push({ url: r.item.url, status: 'error', message });
    }

    await sleep(randomIntInclusive(Math.max(120, delayLo), delayHi + 120));
  }

  if (inLegacyBoost) {
    await setBotIngestLastBoostYmd(ymd);
  }

  const insertedCount = results.filter((x) => x.status === 'inserted').length;
  if (insertedCount > 0 && config.botUserId) {
    recalculateUserReputation(config.botUserId).catch(() => {});
  }

  const skipReasonCounts: Record<string, number> = {};
  for (const r of results) {
    if (r.status === 'skipped') {
      skipReasonCounts[r.reason] = (skipReasonCounts[r.reason] ?? 0) + 1;
    }
  }

  const summary = {
    inserted: results.filter((r) => r.status === 'inserted').length,
    duplicate: results.filter((r) => r.status === 'duplicate').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    errors: results.filter((r) => r.status === 'error').length,
    rejected: scoreRejected,
    autoApproved,
    ...(Object.keys(skipReasonCounts).length > 0 ? { skipReasonCounts } : {}),
  };

  return {
    ok: summary.errors === 0,
    enabled: true,
    startedAt,
    finishedAt: new Date().toISOString(),
    maxPerRun: targetMax,
    runMode: inMorningSustained ? 'morning_sustained' : inLegacyBoost ? 'boost' : 'normal',
    dailyInsertedApprox: countToday + summary.inserted,
    dailyCap: config.dailyMaxOffers,
    rotationWave,
    results,
    summary,
  };
}
