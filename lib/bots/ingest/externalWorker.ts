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
import { classifyBotCategoryForStorage } from './classifyBotCategory';
import { enrichWithPriceIntel, nicheIdFromSourceDetail } from './priceIntel';
import { evaluateDealSafe } from '@/lib/verifier';
import { computeDealScore } from '@/lib/dealIntelligence';
import {
  buildRawObservation,
  toProvenanceSlice,
  withProcessingStatus,
} from '@/lib/dealIntelligence/rawObservation';
import {
  applyDiscoveryIntelligence,
  loadNegativeMemoryEvents,
} from '@/lib/discovery/negativeMemory';
import { strongProductFingerprintForUrl } from '@/lib/offers/findDuplicateOffer';
import {
  beginAutonomousShadowCycle,
  createDuplicateShadowContext,
  hunterSourceForIngest,
  observeIngestShadow,
  peekCurrentShadowCycleId,
  persistShadowCycleSnapshot,
  recordShadowOutcomeFromAutonomous,
} from '@/lib/autonomous';
import type { AutonomousDecisionResult } from '@/lib/autonomous/types';
import { acquireIngestCycleLock, releaseIngestCycleLock } from './ingestCycleLock';
import { getHunterHealth } from '@/lib/hunter/healthStore';
import type { HunterHealthStatus, HunterSourceId } from '@/lib/hunter/types';
import { countDuplicateKinds, countSupplyOpportunities } from './duplicateDrain';
import { enrichParsedOfferMetadata, isValidOfferImage } from '@/lib/hunter/enrichment';
import { hasMercadoLibreListingIdentity } from '@/lib/offers/resolveMercadoLibreItem';
import { normalizeOfferImageUrl } from '@/lib/offerPath';
import { recordExternalSourceBatchHealth } from '@/lib/hunter/engine';
import { qualifyParsedOfferMetadata } from '@/lib/hunter/dealQualification';
import {
  evaluateDealQualityFromParsedMeta,
  recordDealQualityDecision,
} from '@/lib/hunter/dealQuality';
import { preserveMachinePriceProvenance } from '@/lib/bots/ingest/machinePriceProvenance';
import {
  evaluateMachineLiveInsertEligibility,
  isMachinePendingWriteEnabled,
  machineGateSkipReason,
  type MachineLiveInsertEligibility,
} from '@/lib/bots/ingest/machineLiveInsertEligibility';
import { resolveCanaryInsertCap } from '@/lib/bots/ingest/machineInsertCanary';
import {
  buildSupplyOpsRunSummary,
  formatSupplyOpsRunSummaryLog,
} from '@/lib/bots/ingest/supplyOpsRunSummary';
import {
  persistIngestSupplyRuns,
  trackIngestQualification,
  type QualificationCounts,
} from '@/lib/hunter/supply/persistSnapshots';
import {
  isHunterCandidateIntelligenceEnabled,
  observeExternalWorkerBatch,
  persistHunterCandidates,
  persistHunterIntelligenceRun,
  type ObservedResolved,
} from '@/lib/hunter/candidateIntelligence';

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
  /**
   * Top-level worker evidence (machine path). Mirrored into signals by
   * preserveMachinePriceProvenance — never trusted from client bot_meta.
   */
  cardDiscountSource?: ExternalCandidateSignals['cardDiscountSource'];
  cardBadgePercent?: number | null;
  /** Advisory: PDP fetch blocked (account-verification / anti-bot). */
  pdpBlocked?: boolean | null;
};

export type ExternalWorkerBatchPayload = {
  profile?: IngestProfileId;
  dryRun?: boolean;
  candidates: ExternalWorkerCandidate[];
  /** Qué superficies visitó el worker. Diagnóstico de supply: no altera el ciclo. */
  discovery?: WorkerDiscoveryStats | null;
  /**
   * S6.7 canary: when set, hard-clamps inserts to min(budget, canaryCap, 5).
   * Omit for normal (non-canary) batches. Does not enable writes by itself.
   */
  canaryCap?: number | null;
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

  const prov = (v: unknown) =>
    typeof v === 'string' &&
    [
      'source_explicit',
      'trusted_enrichment',
      'price_intel_derivation',
      'user_declared',
      'listing_card',
      'unknown',
    ].includes(v)
      ? (v as NonNullable<ExternalCandidateSignals['currentPriceProvenance']>)
      : null;
  const currentProv = prov(signals.currentPriceProvenance);
  const originalProv = prov(signals.originalPriceProvenance);
  const discountProv =
    typeof signals.discountPercentProvenance === 'string' &&
    ['source_explicit', 'derived', 'price_intel_derivation', 'user_declared', 'unknown'].includes(
      signals.discountPercentProvenance,
    )
      ? signals.discountPercentProvenance
      : null;
  if (currentProv) out.currentPriceProvenance = currentProv;
  if (originalProv) out.originalPriceProvenance = originalProv;
  if (discountProv) out.discountPercentProvenance = discountProv;

  if (
    typeof signals.cardDiscountSource === 'string' &&
    ['badge_reconstructed', 'card_strikethrough', 'pdp', 'unknown'].includes(signals.cardDiscountSource)
  ) {
    out.cardDiscountSource = signals.cardDiscountSource;
  }
  if (typeof signals.cardBadgePercent === 'number' && Number.isFinite(signals.cardBadgePercent)) {
    out.cardBadgePercent = signals.cardBadgePercent;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

/** Live worker → ParsedOfferMetadata. Exported for dry/live identity parity (S6.8). */
export function toParsedMeta(candidate: ExternalWorkerCandidate): ParsedOfferMetadata | null {
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
  // Same identity authority as dry-run / fingerprint: item id OR /up/MLMU user-product.
  if (
    storeLower.includes('mercado') &&
    !hasMercadoLibreListingIdentity(url, canonicalUrl)
  ) {
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
  const preserved = preserveMachinePriceProvenance({
    salePrice: discountPrice,
    originalPrice,
    signals: {
      ...baseSignals,
      listingTypeId: baseSignals.listingTypeId ?? 'worker_card',
    },
    cardDiscountSource: candidate.cardDiscountSource ?? null,
    cardBadgePercent: candidate.cardBadgePercent ?? null,
  });

  return {
    canonicalUrl,
    title,
    store,
    imageUrl,
    discountPrice,
    originalPrice,
    discountPercent,
    signals: preserved.signals,
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
  const supplyRunId = crypto.randomUUID();
  const profile: IngestProfileId = payload.profile === 'mega' ? 'mega' : 'standard';
  const config = loadBotIngestConfig(profile);
  const pausedByOwner = await getBotIngestPausedFromDb();
  const writesEnabled = isMachinePendingWriteEnabled();
  const dryRun = payload.dryRun === true;
  const block = ingestRunBlockFromConfig(config, pausedByOwner);
  if (block) {
    const finishedAt = new Date().toISOString();
    const ops = buildSupplyOpsRunSummary({
      runId: supplyRunId,
      startedAt,
      finishedAt,
      profile,
      dryRun,
      machinePendingWritesEnabled: writesEnabled,
      discovered: Array.isArray(payload.candidates) ? payload.candidates.length : 0,
      identityValid: 0,
      identityInvalid: 0,
      qualityVerified: 0,
      suppressed: 0,
      duplicates: 0,
      liveEligible: 0,
      budgetRejected: 0,
      writeAttempts: 0,
      writeSuccess: 0,
      writeDuplicate: 0,
      writeFailed: 0,
      writesDisabled: 0,
      dryRunSimulated: 0,
      runBlock: block,
    });
    console.info(formatSupplyOpsRunSummaryLog(ops));
    return {
      ok: block !== 'missing_bot_user',
      enabled: block !== 'disabled' && block !== 'paused',
      pausedByOwner: block === 'paused',
      envIngestEnabled: config.enabled,
      profile,
      startedAt,
      finishedAt,
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
        ops,
      },
    };
  }

  // El worker externo puede mandar dos lotes seguidos si el scheduler libera de
  // golpe ejecuciones retrasadas. Procesarlos a la vez duplica trabajo y puede
  // pasarse del tope diario. Ver ingestCycleLock: falla abierto a propósito.
  const lock = await acquireIngestCycleLock({ lockKey: EXTERNAL_WORKER_LOCK_KEY });
  if (!lock.acquired) {
    const finishedAt = new Date().toISOString();
    const ops = buildSupplyOpsRunSummary({
      runId: supplyRunId,
      startedAt,
      finishedAt,
      profile,
      dryRun,
      machinePendingWritesEnabled: writesEnabled,
      discovered: Array.isArray(payload.candidates) ? payload.candidates.length : 0,
      identityValid: 0,
      identityInvalid: 0,
      qualityVerified: 0,
      suppressed: 0,
      duplicates: 0,
      liveEligible: 0,
      budgetRejected: 0,
      writeAttempts: 0,
      writeSuccess: 0,
      writeDuplicate: 0,
      writeFailed: 0,
      writesDisabled: 0,
      dryRunSimulated: 0,
      runBlock: 'concurrent',
      reasonCodes: { concurrent_cycle_in_progress: 1 },
    });
    console.info(formatSupplyOpsRunSummaryLog(ops));
    return {
      ok: true,
      enabled: true,
      pausedByOwner: false,
      envIngestEnabled: config.enabled,
      profile,
      startedAt,
      finishedAt,
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
        ops,
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

  /** Candidate Intelligence side-channel — never gates mint. */
  const metaByUrl = new Map<string, ParsedOfferMetadata>();
  const resolvedByUrl = new Map<string, ObservedResolved>();
  const rawCandidateIntel: Array<{ url: string; title?: string | null; reason?: string }> = [];

  const seen = new Set<string>();
  const items: IngestItem[] = [];
  for (const candidate of rawCandidates) {
    const meta = toParsedMeta(candidate);
    if (!meta) {
      markSourceSkip(sourceStats, 'ml_worker', 'worker payload inválido');
      rawCandidateIntel.push({
        url: candidate.url?.trim() || '',
        title: candidate.title?.trim() || null,
        reason: 'worker payload inválido',
      });
      continue;
    }
    const key = meta.canonicalUrl.toLowerCase();
    if (seen.has(key)) {
      markSourceSkip(sourceStats, 'ml_worker', 'duplicado dentro del lote worker');
      rawCandidateIntel.push({
        url: meta.canonicalUrl,
        title: meta.title,
        reason: 'duplicado dentro del lote worker',
      });
      continue;
    }
    seen.add(key);
    metaByUrl.set(meta.canonicalUrl, meta);
    items.push({
      url: meta.canonicalUrl,
      source: 'ml_worker',
      sourceDetail: candidate.sourceDetail?.trim() || 'worker:ml',
      precomputedMeta: meta,
      pdpBlocked: candidate.pdpBlocked === true ? true : candidate.pdpBlocked === false ? false : null,
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
    autonomous: AutonomousDecisionResult | null;
    /** S6.6 — sole quality authority result (evaluateMachineCandidateGate). */
    machineGate: MachineLiveInsertEligibility;
  };
  const resolved: Resolved[] = [];
  let scoreRejected = 0;
  let opsSuppressed = 0;
  let opsWritesDisabled = 0;
  let opsDryRunSimulated = 0;
  let opsWriteSuccess = 0;
  let opsWriteDuplicate = 0;
  let opsWriteFailed = 0;
  const shadowDup = createDuplicateShadowContext();
  beginAutonomousShadowCycle();
  const qualificationBySource: Partial<Record<IngestSourceId, QualificationCounts>> = {};
  const rejectedBySource: Partial<Record<IngestSourceId, number>> = {};
  const pendingBySource: Partial<Record<IngestSourceId, number>> = {};
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
              nicheId:
                nicheIdFromSourceDetail(item.sourceDetail) ?? config.supplyNicheId ?? null,
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
      metaByUrl.set(item.url, meta);
      metaByUrl.set(meta.canonicalUrl, meta);
      const qualification = item.qualification ?? qualifyParsedOfferMetadata(meta);
      trackIngestQualification(qualificationBySource, item.source, qualification.qualification);
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

      // QE decide coherencia (Evidence Contract). Se registra siempre.
      // El gate de pending NO puede silenciar shadow: observa → luego gate.
      let mlQuality: ReturnType<typeof evaluateDealQualityFromParsedMeta> | null = null;
      if (item.source === 'ml_worker') {
        mlQuality = evaluateDealQualityFromParsedMeta(meta, {
          source: item.source,
          qualification,
        });
        recordDealQualityDecision(mlQuality);
      }

      const verified = evaluateDealSafe({
        meta,
        config,
        source: item.source,
        url: item.url,
        enableWorkerAutoApprove: true,
      });
      // Insert-time duplicate SÍ se observa (ya pasó gates duros + verifier). Dedupe intra-lote no.
      const autonomous = await observeIngestShadow({
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
        results.push({ url: item.url, source: item.source, status: 'skipped', reason });
        markSourceSkip(sourceStats, item.source, reason);
        continue;
      }

      // S6.6: S6.1 evaluateMachineCandidateGate is the sole quality authority.
      // DQE (mlQuality) remains observational only — never insert bypass / never fallback.
      // Early duplicate check optional here; final arbiter = insertIngestedOffer UNIQUE.
      const dealScoreAdvisory = computeDealScore({
        meta: {
          discountPrice: meta.discountPrice,
          originalPrice: meta.originalPrice,
          discountPercent: meta.discountPercent,
        },
        signals: meta.signals ?? null,
      });
      const machineGate = evaluateMachineLiveInsertEligibility({
        url: item.url,
        meta,
        config,
        verifierDecision: verified.ingestDecision,
        verifierReasons: verified.reasons,
        duplicate: null,
        dealScore: dealScoreAdvisory,
        pdpBlocked: item.pdpBlocked,
      });
      if (!machineGate.eligible) {
        opsSuppressed += 1;
        const reason = machineGateSkipReason(machineGate);
        resolvedByUrl.set(item.url, {
          meta,
          decision: verified.ingestDecision,
          total: verified.score,
          breakdown: verified.breakdown,
          machineQualityDecision: machineGate.gateReason ?? null,
          dqeQualification: qualification.qualification,
          reasonCodes: machineGate.reasonCodes ?? [],
        });
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
        autonomous,
        machineGate,
      });
      resolvedByUrl.set(item.url, {
        meta,
        decision: verified.ingestDecision,
        total: verified.score,
        breakdown: verified.breakdown,
        machineQualityDecision: machineGate.gateReason ?? null,
        dqeQualification: qualification.qualification,
        reasonCodes: machineGate.reasonCodes ?? [],
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
  const maxPerRunCap = Math.max(organicCap, config.workerMaxPerRun);
  const budgetCap = Math.min(slotsDaily, maxPerRunCap);
  const maxInsertsThisBatch = resolveCanaryInsertCap(budgetCap, payload.canaryCap);

  const autoApproved = 0;
  let insertedThisRun = 0;

  // Discovery intelligence: negative memory → source quality → category policy → diversity
  const fingerprints = resolved
    .map((row) => strongProductFingerprintForUrl(row.meta.canonicalUrl || row.item.url))
    .filter((fp): fp is string => Boolean(fp));
  const nmEvents =
    shadowDup.supabase && fingerprints.length > 0
      ? await loadNegativeMemoryEvents(shadowDup.supabase, fingerprints)
      : new Map();
  const byUrl = new Map(resolved.map((row) => [row.item.url, row]));
  const intel = applyDiscoveryIntelligence({
    candidates: resolved.map((row) => ({
      id: row.item.url,
      url: row.meta.canonicalUrl || row.item.url,
      title: row.meta.title,
      score: row.total,
      source: row.item.source,
      category: classifyBotCategoryForStorage(row.meta, config.techCategoryIdSet),
      discountPercent: row.meta.discountPercent,
      price: row.meta.discountPrice,
    })),
    eventsByFingerprint: nmEvents,
    limit: maxInsertsThisBatch,
    now: nowWorker,
  });
  for (const s of intel.suppressed) {
    markSourceSkip(sourceStats, 'ml_worker', `negative_memory:${s.reason}`);
    results.push({
      url: s.id,
      source: 'ml_worker',
      status: 'skipped',
      reason: `negative_memory:${s.reason}`,
    });
    opsSuppressed += 1;
    const existing = resolvedByUrl.get(s.id);
    if (existing) {
      resolvedByUrl.set(s.id, { ...existing, negativeMemoryLevel: 'SUPPRESS' });
    }
  }
  const shortlistIds = new Set(intel.shortlist.map((c) => c.id));
  const suppressedIds = new Set(intel.suppressed.map((s) => s.id));
  const diversityCutUrls = resolved
    .map((row) => row.item.url)
    .filter((url) => !shortlistIds.has(url) && !suppressedIds.has(url));
  for (const url of diversityCutUrls) {
    results.push({
      url,
      source: 'ml_worker',
      status: 'skipped',
      reason: 'diversity_cut',
    });
    markSourceSkip(sourceStats, 'ml_worker', 'diversity_cut');
  }
  const insertQueue = intel.shortlist
    .map((c) => {
      const row = byUrl.get(c.id);
      if (!row) return null;
      return { ...row, score: c.score };
    })
    .filter((row): row is Resolved & { score: number } => row != null);

  for (const row of insertQueue) {
    // S9.1: auto_approve scoring decision never authorizes approved mint.
    // Machine insert is always pending; human moderation owns approval.
    const status = 'pending' as const;
    const title = optimizeIngestTitle(row.meta);
    const dealScore = computeDealScore({
      meta: {
        discountPrice: row.meta.discountPrice,
        originalPrice: row.meta.originalPrice,
        discountPercent: row.meta.discountPercent,
      },
      signals: row.meta.signals ?? null,
    });
    const sourceEventId = `${supplyRunId}:${row.item.source}:${row.item.url}`.slice(0, 240);
    const rawSlice = toProvenanceSlice(
      withProcessingStatus(
        buildRawObservation({
          sourceId: row.item.source,
          sourceEventId,
          url: row.meta.canonicalUrl || row.item.url,
          merchant: row.meta.store,
          salePrice: row.meta.discountPrice,
          listPrice: row.meta.originalPrice,
          currency: 'MXN',
          title: row.meta.title,
          sourceDetail: row.item.sourceDetail ?? null,
          supplyRunId,
          captureMethod: 'browser_justified',
          processingStatus: 'scored',
        }),
        'inserted',
      ),
      dealScore,
    );

    if (payload.dryRun) {
      insertedThisRun += 1;
      opsDryRunSimulated += 1;
      results.push({
        url: row.item.url,
        source: row.item.source,
        status: 'inserted',
        offerId: `dry-run-${insertedThisRun}`,
      });
      sourceStats[row.item.source].inserted += 1;
      pendingBySource[row.item.source] = (pendingBySource[row.item.source] ?? 0) + 1;
      continue;
    }

    // S6.6 / S6.7: machine pending DB writes stay OFF until explicit canary activation.
    // Quality may pass while writes remain disabled — no production insert by default.
    if (!isMachinePendingWriteEnabled()) {
      const reason = 'machine_pending_writes_disabled';
      opsWritesDisabled += 1;
      results.push({ url: row.item.url, source: row.item.source, status: 'skipped', reason });
      markSourceSkip(sourceStats, row.item.source, reason);
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
        dealScore,
        rawObservation: rawSlice,
        gateAction: 'insert_pending',
        gateReason: row.machineGate.gateReason || 's61_verified_opportunity',
      });
      if (ins.ok) {
        insertedThisRun += 1;
        opsWriteSuccess += 1;
        void recordShadowOutcomeFromAutonomous({
          offerId: ins.offerId,
          result: row.autonomous,
          sourceId: row.item.source,
          sourceDetail: row.item.sourceDetail,
          shadowCycleId: peekCurrentShadowCycleId(),
          qualification: row.item.qualification?.qualification ?? null,
        });
        results.push({ url: row.item.url, source: row.item.source, status: 'inserted', offerId: ins.offerId });
        sourceStats[row.item.source].inserted += 1;
        pendingBySource[row.item.source] = (pendingBySource[row.item.source] ?? 0) + 1;
      } else if ('duplicate' in ins && ins.duplicate) {
        opsWriteDuplicate += 1;
        results.push({
          url: row.item.url,
          source: row.item.source,
          status: 'duplicate',
          duplicateKind: ins.duplicateKind,
          supplyOpportunity: ins.supplyOpportunity,
        });
        sourceStats[row.item.source].duplicate += 1;
      } else if ('error' in ins) {
        opsWriteFailed += 1;
        results.push({ url: row.item.url, source: row.item.source, status: 'error', message: ins.error });
        sourceStats[row.item.source].errors += 1;
      }
    } catch (error) {
      opsWriteFailed += 1;
      const message = error instanceof Error ? error.message : String(error);
      results.push({ url: row.item.url, source: row.item.source, status: 'error', message });
      sourceStats[row.item.source].errors += 1;
    }
  }

  const skipReasonCounts = buildSkipSummary(results, sourceStats);
  const duplicateKindCounts = countDuplicateKinds(results);
  const supplyOpportunities = countSupplyOpportunities(results);
  const budgetRejected = Math.max(0, resolved.length - insertQueue.length);
  const identityInvalid = Math.max(0, rawCandidates.length - items.length);
  const finishedAt = new Date().toISOString();
  const ops = buildSupplyOpsRunSummary({
    runId: supplyRunId,
    startedAt,
    finishedAt,
    profile,
    dryRun,
    machinePendingWritesEnabled: writesEnabled,
    discovered: rawCandidates.length,
    identityValid: items.length,
    identityInvalid,
    qualityVerified: resolved.length,
    suppressed: opsSuppressed,
    duplicates:
      results.filter((r) => r.status === 'duplicate').length +
      (skipReasonCounts['duplicado dentro del lote worker'] ?? 0),
    liveEligible: resolved.length,
    budgetRejected,
    writeAttempts: stageCounts.insertedAttempted,
    writeSuccess: opsWriteSuccess,
    writeDuplicate: opsWriteDuplicate,
    writeFailed: opsWriteFailed,
    writesDisabled: opsWritesDisabled,
    dryRunSimulated: opsDryRunSimulated,
    reasonCodes: skipReasonCounts,
    discoverySeedsAttempted: discovery?.seedsAttempted,
    discoverySeedsFailed: discovery?.seedsFailed,
  });
  console.info(formatSupplyOpsRunSummaryLog(ops));

  const summary: IngestCycleReport['summary'] = {
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
    ops,
  };

  // Shadow vive en memoria del isolate: sin este snapshot el panel admin no lo ve nunca.
  const shadow = await persistShadowCycleSnapshot({ supabase: shadowDup.supabase });
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

  // Candidate Intelligence (observation): persist every analyzed candidate. Fail-soft.
  if (isHunterCandidateIntelligenceEnabled()) {
    try {
      const observed = observeExternalWorkerBatch({
        runId: supplyRunId,
        startedAt,
        finishedAt,
        dryRun,
        rawCandidateUrls: rawCandidateIntel,
        itemUrls: items.map((i) => i.url),
        sliceUrls: slice.map((i) => i.url),
        results,
        metaByUrl,
        resolvedByUrl,
        nmSuppressedUrls: suppressedIds,
        diversityCutUrls,
      });
      summary.candidateIntelligence = observed.summary;
      const wrote = await persistHunterCandidates(shadowDup.supabase, observed.records);
      if (!wrote.ok) {
        console.warn('[hunter_candidate_intelligence] persist candidates failed', wrote.error);
      }
      const runWrote = await persistHunterIntelligenceRun(shadowDup.supabase, observed.summary);
      if (!runWrote.ok) {
        console.warn('[hunter_candidate_intelligence] persist run failed', runWrote.error);
      } else {
        console.info(
          `[hunter_candidate_intelligence] run=${supplyRunId} candidates=${observed.summary.candidateCount} rejected=${observed.summary.rejectedCount} needs_review=${observed.summary.needsReviewCount} would_insert=${observed.summary.wouldInsertCount}`,
        );
      }
    } catch (err) {
      console.warn(
        '[hunter_candidate_intelligence] observe failed',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

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
