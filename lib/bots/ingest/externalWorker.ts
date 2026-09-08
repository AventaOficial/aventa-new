import { countBotOffersCreatedSinceMulti, getBotOfferCountStartUtc } from './botIngestDailyState';
import { loadBotIngestConfig, type BotIngestConfig } from './config';
import { getBotIngestPausedFromDb } from './botIngestPaused';
import { ingestRunBlockFromConfig } from './ingestRunGate';
import { getZonedHourMinute } from './ingestZonedTime';
import type { ParsedOfferMetadata } from './fetchParsedOfferMetadata';
import type {
  IngestCycleReport,
  IngestItem,
  IngestProfileId,
  IngestSingleResult,
  IngestSourceId,
  IngestSourceStats,
  WorkerDiscoveryStats,
  WorkerSeedStat,
} from './types';
import { emptyIngestSourceStats } from './types';
import { insertIngestedOffer } from './insertIngestedOffer';
import { optimizeIngestTitle } from './optimizeIngestTitle';
import { isLowQualityTitle } from './isLowQualityTitle';
import { type ScoreBreakdown } from './scoreIngestCandidate';
import { enrichWithPriceIntel } from './priceIntel';
import { evaluateDealSafe } from '@/lib/verifier';
import {
  beginAutonomousShadowCycle,
  createDuplicateShadowContext,
  hunterSourceForIngest,
  observeIngestShadow,
  persistShadowCycleSnapshot,
} from '@/lib/autonomous';
import { acquireIngestCycleLock, releaseIngestCycleLock } from './ingestCycleLock';
import { getHunterHealth } from '@/lib/hunter/healthStore';
import type { HunterHealthStatus, HunterSourceId } from '@/lib/hunter/types';
import { countDuplicateKinds, countSupplyOpportunities } from './duplicateDrain';
import { enrichParsedOfferMetadata, isValidOfferImage } from '@/lib/hunter/enrichment';
import { extractMercadoLibreItemId } from '@/lib/offers/offerUrlFingerprint';
import { normalizeOfferImageUrl } from '@/lib/offerPath';
import { recordExternalSourceBatchHealth } from '@/lib/hunter/engine';

const MAX_WORKER_DISCOUNT_PERCENT = 85;

/** Un solo ciclo de lote externo a la vez, sea cual sea el isolate que lo atienda. */
const EXTERNAL_WORKER_LOCK_KEY = 'ingest:ml_worker';

/**
 * Salud real de las fuentes del lote, leída de DB una sola vez por ciclo.
 *
 * `buildAutonomousInput` cae por defecto a la memoria del proceso, que en este
 * endpoint siempre está vacía porque el hunter corrió en el runner de GitHub y no
 * en este isolate. Sin esto, el 100% de los candidatos sale como `source_degraded`
 * y ninguno podría llegar nunca a AUTO_APPROVE.
 *
 * Solo alimenta la observación shadow. Si la lectura falla la fuente queda como
 * desconocida o degradada, que es el valor fail-closed que ya asumía el motor:
 * nunca convierte un fallo de lectura en permiso para auto-aprobar.
 */
async function readShadowSourceHealth(
  items: readonly IngestItem[]
): Promise<Map<IngestSourceId, HunterHealthStatus | null>> {
  const out = new Map<IngestSourceId, HunterHealthStatus | null>();
  const wanted = new Map<HunterSourceId, IngestSourceId[]>();
  for (const item of items) {
    out.set(item.source, null);
    const hunterId = hunterSourceForIngest(item.source);
    if (!hunterId) continue;
    wanted.set(hunterId, [...(wanted.get(hunterId) ?? []), item.source]);
  }
  if (wanted.size === 0) return out;

  try {
    const rows = await getHunterHealth([...wanted.keys()]);
    for (const row of rows) {
      for (const ingestId of wanted.get(row.sourceId) ?? []) out.set(ingestId, row.status);
    }
  } catch {
    // Observabilidad degradada, nunca un ciclo caído.
  }
  return out;
}

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
  /** Qué superficies visitó el worker. Diagnóstico de supply: no altera el ciclo. */
  discovery?: WorkerDiscoveryStats | null;
};

/**
 * Normaliza lo que reporta el worker. Viene de un proceso externo, así que se
 * valida como entrada no confiable: campos raros se descartan en vez de
 * propagarse al resumen.
 */
function toDiscoveryStats(raw: unknown): WorkerDiscoveryStats | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const int = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.trunc(Number(v))) : 0);
  const bySeed = Array.isArray(r.bySeed)
    ? r.bySeed.slice(0, 40).flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const e = entry as Record<string, unknown>;
        const id = typeof e.id === 'string' ? e.id.slice(0, 60) : '';
        if (!id) return [];
        const status = e.status === 'failed' || e.status === 'zero_results' ? e.status : 'ok';
        return [
          {
            id,
            status: status as WorkerSeedStat['status'],
            rawLinks: int(e.rawLinks),
            accepted: int(e.accepted),
          },
        ];
      })
    : [];

  return {
    cycleIndex: int(r.cycleIndex),
    seedsAvailable: int(r.seedsAvailable),
    seedsAttempted: int(r.seedsAttempted),
    seedsSuccessful: int(r.seedsSuccessful),
    seedsZeroResults: int(r.seedsZeroResults),
    seedsFailed: int(r.seedsFailed),
    bySeed,
  };
}

function randomIntInclusive(lo: number, hi: number): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
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

function isBlockedWorkerUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    const path = url.pathname.toLowerCase();
    return (
      /\/gz\//i.test(path) ||
      /account-verification/i.test(path) ||
      /\/login/i.test(path) ||
      /\/registration/i.test(path) ||
      /\/ofertas(?:\/|$)/i.test(path) ||
      /\/categorias?/i.test(path) ||
      /\/ayuda\//i.test(path)
    );
  } catch {
    return true;
  }
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
  const imageUrl = normalizeOfferImageUrl(candidate.imageUrl) ?? '';
  const canonicalUrl = candidate.canonicalUrl?.trim() || url;
  const discountPrice = Number(candidate.discountPrice);
  const originalPrice =
    candidate.originalPrice != null && Number.isFinite(Number(candidate.originalPrice))
      ? Number(candidate.originalPrice)
      : null;

  if (!url || !title || !canonicalUrl || !Number.isFinite(discountPrice) || discountPrice <= 0) {
    return null;
  }
  if (isBlockedWorkerUrl(url) || isBlockedWorkerUrl(canonicalUrl)) {
    return null;
  }
  const storeLower = store.toLowerCase();
  if (storeLower.includes('mercado') && !extractMercadoLibreItemId(canonicalUrl) && !extractMercadoLibreItemId(url)) {
    return null;
  }

  const computedDiscount =
    originalPrice != null && originalPrice > discountPrice
      ? Math.round((1 - discountPrice / originalPrice) * 100)
      : 0;
  const rawPercent =
    candidate.discountPercent != null && Number.isFinite(Number(candidate.discountPercent))
      ? Math.round(Number(candidate.discountPercent))
      : computedDiscount;
  const discountPercent = Math.max(0, Math.min(MAX_WORKER_DISCOUNT_PERCENT, rawPercent));

  const baseSignals = normalizeSignals(candidate.signals) ?? {};
  const signals: ExternalCandidateSignals = {
    ...baseSignals,
    listingTypeId: baseSignals.listingTypeId ?? 'worker_card',
  };

  return {
    canonicalUrl,
    title,
    store,
    imageUrl,
    discountPrice,
    originalPrice,
    discountPercent,
    signals,
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
  const pausedByOwner = await getBotIngestPausedFromDb();
  const block = ingestRunBlockFromConfig(config, pausedByOwner);
  if (block) {
    return {
      ok: block !== 'missing_bot_user',
      enabled: block !== 'disabled' && block !== 'paused',
      pausedByOwner: block === 'paused',
      envIngestEnabled: config.enabled,
      profile,
      startedAt,
      finishedAt: new Date().toISOString(),
      maxPerRun: 0,
      runMode: block === 'paused' ? 'skipped' : block === 'disabled' ? 'off' : 'error',
      dailyInsertedApprox: null,
      dailyCap: config.dailyMaxOffers,
      rotationWave: null,
      results: [],
      summary: {
        inserted: 0,
        duplicate: 0,
        skipped: 0,
        errors: block === 'missing_bot_user' ? 1 : 0,
        rejected: 0,
        autoApproved: 0,
      },
    };
  }

  // El worker externo puede mandar dos lotes seguidos si el scheduler libera de
  // golpe ejecuciones retrasadas. Procesarlos a la vez duplica trabajo y puede
  // pasarse del tope diario. Ver ingestCycleLock: falla abierto a propósito.
  const lock = await acquireIngestCycleLock({ lockKey: EXTERNAL_WORKER_LOCK_KEY });
  if (!lock.acquired) {
    return {
      ok: true,
      enabled: true,
      pausedByOwner: false,
      envIngestEnabled: config.enabled,
      profile,
      startedAt,
      finishedAt: new Date().toISOString(),
      maxPerRun: 0,
      runMode: 'skipped',
      dailyInsertedApprox: null,
      dailyCap: config.dailyMaxOffers,
      rotationWave: null,
      results: [],
      summary: {
        inserted: 0,
        duplicate: 0,
        skipped: 0,
        errors: 0,
        rejected: 0,
        autoApproved: 0,
        skipReasonCounts: { concurrent_cycle_in_progress: 1 },
      },
    };
  }

  const sourceStats = emptySourceStats();
  const results: IngestSingleResult[] = [];
  const stageCounts = {
    collected: 0,
    evaluated: 0,
    resolved: 0,
    insertedAttempted: 0,
  };

  const rawCandidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const discovery = toDiscoveryStats(payload.discovery);
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

  // itemsFound (health DB) = rawCandidates.length. Shadow/enrichment NO usan ese universo.
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
  const shadowDup = createDuplicateShadowContext();
  beginAutonomousShadowCycle();
  // El worker externo corre en OTRO isolate: la salud en memoria llega vacía y todo
  // candidato saldría como `source_degraded`. Se lee de DB una vez por ciclo.
  const shadowSourceHealth = await readShadowSourceHealth(slice);
  const enrichCache = new Map<string, ParsedOfferMetadata>();

  for (const item of slice) {
    sourceStats[item.source].evaluated += 1;
    stageCounts.evaluated += 1;
    try {
      // ml_worker: conservar discountPercent/precios de la card; intel solo en signals.
      const precomputed = item.precomputedMeta;
      const meta = precomputed
        ? await (async () => {
            const priced = await enrichWithPriceIntel({ ...precomputed }, config, {
              preserveLabelDiscount: item.source === 'ml_worker',
            });
            return (
              await enrichParsedOfferMetadata(priced, {
                source: item.source,
                sourceDetail: item.sourceDetail,
                skipHtml: isValidOfferImage(priced.imageUrl),
                cache: enrichCache,
              })
            ).meta;
          })()
        : null;
      if (!meta) {
        const reason = 'sin metadatos';
        results.push({ url: item.url, source: item.source, status: 'skipped', reason });
        markSourceSkip(sourceStats, item.source, reason);
        continue;
      }
      // Quality gates: NO observe. Shadow evaluated ≠ hunter found. Decisión documentada.
      if (isBlockedWorkerUrl(meta.canonicalUrl) || isBlockedWorkerUrl(item.url)) {
        const reason = 'url no producto (login/verificación/listado)';
        results.push({ url: item.url, source: item.source, status: 'skipped', reason });
        markSourceSkip(sourceStats, item.source, reason);
        continue;
      }
      if (meta.originalPrice == null || meta.originalPrice <= meta.discountPrice) {
        const reason = 'sin precio original verificable';
        results.push({ url: item.url, source: item.source, status: 'skipped', reason });
        markSourceSkip(sourceStats, item.source, reason);
        continue;
      }
      if (meta.discountPercent < config.minDiscountPercent || meta.discountPercent > MAX_WORKER_DISCOUNT_PERCENT) {
        const reason = `descuento ${meta.discountPercent}% fuera de rango`;
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

      const verified = evaluateDealSafe({
        meta,
        config,
        source: item.source,
        url: item.url,
        enableWorkerAutoApprove: true,
      });
      // Insert-time duplicate SÍ se observa (ya pasó gates + verifier). Dedupe intra-lote no.
      await observeIngestShadow({
        verifier: verified,
        meta,
        source: item.source,
        sourceDetail: item.sourceDetail,
        config,
        supabase: shadowDup.supabase,
        duplicateCache: shadowDup.cache,
        sourceHealth: shadowSourceHealth.get(item.source) ?? null,
      });
      if (verified.decision === 'reject') {
        scoreRejected += 1;
        const reason =
          verified.reasons[0] ?? `score ${verified.score} < mínimo publicación`;
        results.push({ url: item.url, source: item.source, status: 'skipped', reason });
        markSourceSkip(sourceStats, item.source, reason);
        continue;
      }

      resolved.push({
        item,
        meta,
        decision: verified.ingestDecision,
        total: verified.score,
        breakdown: verified.breakdown,
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
  const organicCap = inMorningSustained
    ? randomIntInclusive(config.morningMaxPerRunMin, config.morningMaxPerRunMax)
    : randomIntInclusive(config.normalMaxPerRunMin, config.normalMaxPerRunMax);
  // El worker trae un lote ya filtrado: no limitar a 1–3 como el ciclo API.
  const maxPerRunCap = Math.max(organicCap, config.workerMaxPerRun);
  const maxInsertsThisBatch = Math.min(slotsDaily, maxPerRunCap);

  let autoApproved = 0;
  let insertedThisRun = 0;

  for (const row of resolved) {
    if (insertedThisRun >= maxInsertsThisBatch) break;

    // Camino legacy: apagado en producción. El verifier puede seguir concluyendo
    // 'auto_approve' (y el shadow registrarlo), pero el bot no escribe 'approved'.
    const allowAuto = config.legacyAutoApproveWriteEnabled && row.decision === 'auto_approve';
    const status = allowAuto ? 'approved' : 'pending';
    const title = optimizeIngestTitle(row.meta);

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
        ingestSource: row.item.source,
        ingestSourceDetail: row.item.sourceDetail ?? undefined,
        decision: row.decision,
      });
      if (ins.ok) {
        insertedThisRun += 1;
        results.push({ url: row.item.url, source: row.item.source, status: 'inserted', offerId: ins.offerId });
        sourceStats[row.item.source].inserted += 1;
        if (status === 'approved') autoApproved += 1;
      } else if ('duplicate' in ins && ins.duplicate) {
        results.push({
          url: row.item.url,
          source: row.item.source,
          status: 'duplicate',
          duplicateKind: ins.duplicateKind,
          supplyOpportunity: ins.supplyOpportunity,
        });
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
  const duplicateKindCounts = countDuplicateKinds(results);
  const supplyOpportunities = countSupplyOpportunities(results);
  const summary = {
    inserted: results.filter((r) => r.status === 'inserted').length,
    duplicate: results.filter((r) => r.status === 'duplicate').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    errors: results.filter((r) => r.status === 'error').length,
    rejected: scoreRejected,
    autoApproved,
    ...(Object.keys(skipReasonCounts).length > 0 ? { skipReasonCounts } : {}),
    ...(Object.keys(duplicateKindCounts).length > 0 ? { duplicateKindCounts } : {}),
    ...(supplyOpportunities > 0 ? { supplyOpportunities } : {}),
    ...(discovery ? { discovery } : {}),
    sourceStats,
    stageCounts,
  };

  const finishedAt = new Date().toISOString();
  // Shadow vive en memoria del isolate: sin este snapshot el panel admin no lo ve nunca.
  await persistShadowCycleSnapshot({ supabase: shadowDup.supabase });
  const latencyMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
  try {
    await recordExternalSourceBatchHealth({
      sourceId: 'ml_worker',
      ok: summary.errors === 0,
      itemsFound: rawCandidates.length,
      itemsInserted: summary.inserted,
      duplicates: summary.duplicate,
      skipped: summary.skipped,
      errors: summary.errors,
      latencyMs: Number.isFinite(latencyMs) ? latencyMs : 0,
      expectedIntervalMs: 30 * 60 * 1000,
      errorCode: summary.errors > 0 ? 'batch_errors' : null,
      errorMessageSafe: summary.errors > 0 ? `worker batch errors=${summary.errors}` : null,
    });
  } catch {
    /* health no debe tumbar el batch */
  }

  // Se suelta al terminar. Si este isolate muriera antes, el TTL lo libera igual.
  await releaseIngestCycleLock({ lockKey: EXTERNAL_WORKER_LOCK_KEY, holder: lock.holder });

  return {
    ok: summary.errors === 0,
    enabled: true,
    envIngestEnabled: config.enabled,
    profile,
    startedAt,
    finishedAt,
    maxPerRun: maxInsertsThisBatch,
    runMode: inMorningSustained ? 'morning_sustained' : 'normal',
    dailyInsertedApprox: countToday + summary.inserted,
    dailyCap: config.dailyMaxOffers,
    rotationWave: null,
    results,
    summary,
  };
}
