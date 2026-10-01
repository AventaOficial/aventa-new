import type { DealQualityTelemetry } from '@/lib/hunter/dealQuality';
import type { DealScore } from '@/lib/dealIntelligence';
import type { RawObservationProvenanceSlice } from '@/lib/dealIntelligence/rawObservation';
import type { ParsedOfferMetadata } from './fetchParsedOfferMetadata';
import type { ScoreBreakdown, ScoreDecision } from './scoreIngestCandidate';

export const BOT_META_VERSION = 1;

type BuildInput = {
  meta: ParsedOfferMetadata;
  scoreBreakdown?: ScoreBreakdown;
  ingestSource?: string;
  ingestSourceDetail?: string;
  decision?: ScoreDecision;
  /** Telemetría Deal Quality Engine V1 (no cambia status). */
  dealQuality?: DealQualityTelemetry | null;
  /** DealScore v1 — advisory; never publishes. */
  dealScore?: DealScore | null;
  /** Compact RawObservation provenance (hash/meta only — no HTML dump). */
  rawObservation?: RawObservationProvenanceSlice | null;
  /** Verifier / gate decision labels for audit. */
  gateAction?: string | null;
  gateReason?: string | null;
  /** S6.1 reason codes for decision trace. */
  gateReasonCodes?: string[] | null;
  hunterDecisionTrace?: Record<string, unknown> | null;
};

function compact<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value == null) continue;
    if (typeof value === 'number' && !Number.isFinite(value)) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Empaqueta las señales que el bot ya calcula (vendidos, rating, intel de precio,
 * desglose del score) para que moderación pueda decidir sin foto.
 * Devuelve `null` cuando no hay nada que guardar.
 */
export function buildBotMeta({
  meta,
  scoreBreakdown,
  ingestSource,
  ingestSourceDetail,
  decision,
  dealQuality: dealQualityInput,
  dealScore: dealScoreInput,
  rawObservation: rawObsInput,
  gateAction,
  gateReason,
  hunterDecisionTrace,
}: BuildInput): Record<string, unknown> | null {
  const s = meta.signals;

  const signals = s
    ? compact({
        ratingAverage: s.ratingAverage,
        ratingCount: s.ratingCount,
        soldQuantity: s.soldQuantity,
        condition: s.condition,
        categoryId: s.categoryId,
        listingTypeId: s.listingTypeId,
        priceLowest30d: s.priceLowest30d,
        priceLowest90d: s.priceLowest90d,
        priceVsLowest90dPct: s.priceVsLowest90dPct,
        habitual30d: s.habitual30d,
        savingsVsHabitualPct: s.savingsVsHabitualPct,
        effectiveDiscountPercent: s.effectiveDiscountPercent,
        suspectedArtificialListPrice: s.suspectedArtificialListPrice,
        priceIntelSource: s.priceIntelSource,
        historyReady: s.historyReady,
        cardDiscountSource: s.cardDiscountSource,
        cardBadgePercent: s.cardBadgePercent,
        currentPriceProvenance: s.currentPriceProvenance,
        originalPriceProvenance: s.originalPriceProvenance,
        discountPercentProvenance: s.discountPercentProvenance,
        promotionBoundToProduct: s.promotionBoundToProduct,
        imageProvenance: s.imageProvenance,
      })
    : {};

  const score = scoreBreakdown
    ? compact({
        total: scoreBreakdown.total,
        discount: scoreBreakdown.discount,
        popularity: scoreBreakdown.popularity,
        rating: scoreBreakdown.rating,
        category: scoreBreakdown.category,
        priceAppeal: scoreBreakdown.priceAppeal,
        historical: scoreBreakdown.historical,
      })
    : {};

  const dealScore = dealScoreSnapshot(dealScoreInput);
  const rawObservation = rawObservationSnapshot(rawObsInput);

  const hasSignals = Object.keys(signals).length > 0;
  const hasScore = Object.keys(score).length > 0;
  const dealQuality = dealQualitySnapshot(dealQualityInput);
  const hasQuality = dealQuality != null;
  const hasDealScore = dealScore != null;
  const hasRaw = rawObservation != null;
  if (
    !hasSignals &&
    !hasScore &&
    !ingestSource &&
    !hasQuality &&
    !hasDealScore &&
    !hasRaw &&
    !gateAction &&
    !hunterDecisionTrace
  ) {
    return null;
  }

  return compact({
    v: BOT_META_VERSION,
    capturedAt: new Date().toISOString(),
    source: ingestSource,
    sourceDetail: ingestSourceDetail,
    decision,
    gateAction: gateAction ?? null,
    gateReason: gateReason ?? null,
    imageFromSource: meta.imageUrl?.trim() ? true : false,
    ...(hasScore ? { score } : {}),
    ...(hasSignals ? { signals } : {}),
    ...(hasQuality ? { dealQuality } : {}),
    ...(hasDealScore ? { dealScore } : {}),
    ...(hasRaw ? { rawObservation } : {}),
    ...(hunterDecisionTrace ? { hunterDecisionTrace } : {}),
  });
}

function dealQualitySnapshot(
  raw: DealQualityTelemetry | null | undefined,
): Record<string, unknown> | null {
  if (!raw) return null;
  return compact({
    decision: raw.decision,
    confidence: raw.confidence,
    recommendedAction: raw.recommendedAction,
    qualification: raw.qualification,
    policyVersion: raw.policyVersion,
    at: raw.at,
    reasons: raw.reasons.slice(0, 8),
    positiveSignals: raw.positiveSignals.slice(0, 12),
    negativeSignals: raw.negativeSignals.slice(0, 12),
    missingEvidence: raw.missingEvidence.slice(0, 8),
  });
}

function dealScoreSnapshot(raw: DealScore | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  return compact({
    score: raw.score,
    confidence: raw.confidence,
    version: raw.version,
    historicalLowClaimed: raw.historicalLowClaimed,
    reasonCodes: raw.reasonCodes.slice(0, 12),
    reasons: raw.reasons.slice(0, 8),
    warnings: raw.warnings.slice(0, 6),
  });
}

function rawObservationSnapshot(
  raw: RawObservationProvenanceSlice | null | undefined,
): Record<string, unknown> | null {
  if (!raw) return null;
  return compact({
    schemaVersion: raw.schemaVersion,
    observationId: raw.observationId,
    sourceEventId: raw.sourceEventId,
    sourceId: raw.sourceId,
    observedAt: raw.observedAt,
    url: raw.url,
    evidenceHash: raw.evidenceHash,
    parserVersion: raw.parserVersion,
    normalizationVersion: raw.normalizationVersion,
    identityStatus: raw.identityStatus,
    productFingerprint: raw.productFingerprint,
    processingStatus: raw.processingStatus,
    dealScoreVersion: raw.dealScoreVersion,
    dealScore: raw.dealScore,
    dealScoreConfidence: raw.dealScoreConfidence,
    originalPriceProvenance: raw.originalPriceProvenance,
    cardDiscountSource: raw.cardDiscountSource,
  });
}
