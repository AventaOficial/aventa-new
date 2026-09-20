import { createHash } from 'node:crypto';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import type { ScoreBreakdown } from '@/lib/bots/ingest/scoreIngestCandidate';
import { strongProductFingerprintForUrl } from '@/lib/offers/findDuplicateOffer';
import { validateOfferImageUrl } from '@/lib/offers/imageValidation';
import { explainScoreBreakdown } from './scoreExplanation';
import { classifyIngestDisposition, type Disposition } from './taxonomy';
import type { HunterCandidateRecord } from './types';
import {
  DECISION_POLICY_VERSION,
  HUNTER_VERSION,
  NORMALIZATION_VERSION,
  SCORING_VERSION,
} from './versions';

export function candidateKeyForUrl(url: string): string {
  const normalized = url.trim().toLowerCase();
  return createHash('sha256').update(normalized).digest('hex').slice(0, 32);
}

export function inferRetailer(url: string, source: string): string | null {
  const u = url.toLowerCase();
  if (u.includes('mercadolibre.') || u.includes('mercadolivre.') || source.includes('ml')) {
    return 'mercadolibre_mx';
  }
  if (u.includes('amazon.') || source.includes('amazon')) return 'amazon_mx';
  if (u.includes('walmart.')) return 'walmart_mx';
  if (u.includes('chedraui.')) return 'chedraui_mx';
  if (u.includes('bodegaaurrera.') || u.includes('bodega')) return 'bodega_aurrera_mx';
  return source || null;
}

export function buildHunterCandidateRecord(input: {
  runId: string;
  source: string;
  sourceDetail?: string | null;
  url: string;
  meta?: ParsedOfferMetadata | null;
  status: 'skipped' | 'inserted' | 'duplicate' | 'error' | 'would_insert' | 'resolved';
  reason?: string | null;
  scoreDecision?: 'auto_approve' | 'pending' | 'reject' | null;
  scoreTotal?: number | null;
  breakdown?: ScoreBreakdown | null;
  machineEligible?: boolean | null;
  machineQualityDecision?: string | null;
  dqeQualification?: string | null;
  reasonCodes?: string[];
  negativeMemoryLevel?: string | null;
  insertedOfferId?: string | null;
  duplicateOf?: string | null;
  evidence?: Record<string, unknown>;
  dispositionOverride?: Disposition | null;
  diversityCut?: boolean;
}): HunterCandidateRecord {
  const meta = input.meta ?? null;
  const canonical = (meta?.canonicalUrl || input.url).trim();
  const disposition =
    input.dispositionOverride ??
    classifyIngestDisposition({
      status: input.status,
      reason: input.reason,
      scoreDecision: input.scoreDecision,
      machineEligible: input.machineEligible,
    });
  const explanation = explainScoreBreakdown(input.breakdown, input.scoreTotal);
  const fp =
    strongProductFingerprintForUrl(canonical) ??
    strongProductFingerprintForUrl(input.url) ??
    null;
  const imageValidation = validateOfferImageUrl(meta?.imageUrl, {
    titleHint: meta?.title,
  });

  return {
    runId: input.runId,
    candidateKey: candidateKeyForUrl(canonical || input.url),
    source: input.source,
    retailer: inferRetailer(canonical || input.url, input.source),
    sourceUrl: input.url,
    canonicalUrl: canonical || input.url,
    title: meta?.title?.trim() || null,
    description: null,
    imageUrl: imageValidation.normalizedUrl,
    seller: meta?.store?.trim() || null,
    brand: null,
    category: meta?.signals?.categoryId?.trim() || null,
    subcategory: null,
    originalPrice:
      meta?.originalPrice != null && Number.isFinite(meta.originalPrice)
        ? meta.originalPrice
        : null,
    salePrice:
      meta?.discountPrice != null && Number.isFinite(meta.discountPrice)
        ? meta.discountPrice
        : null,
    discountPercentage:
      meta?.discountPercent != null && Number.isFinite(meta.discountPercent)
        ? Math.round(meta.discountPercent)
        : null,
    coupon: null,
    shippingCost: null,
    currency: 'MXN',
    availability: null,
    sellerRating: null,
    productRating: meta?.signals?.ratingAverage ?? null,
    reviewCount: meta?.signals?.ratingCount ?? null,
    productFingerprint: fp,
    duplicateOf: input.duplicateOf ?? null,
    duplicateClusterId: fp,
    hunterScore: explanation.total,
    scoreBreakdown: input.breakdown ?? {},
    scoreExplanation: explanation.signals,
    dqeQualification: input.dqeQualification ?? null,
    machineQualityDecision: input.machineQualityDecision ?? null,
    reasonCodes: input.reasonCodes ?? [],
    decision: disposition.decision,
    reasonCode: disposition.reasonCode,
    reasonDetail: disposition.reasonDetail,
    rejectionStage: disposition.stage,
    evidence: {
      scoreSummary: explanation.summary,
      sourceDetail: input.sourceDetail ?? null,
      ...(input.evidence ?? {}),
    },
    rawMetadata: {
      listingTypeId: meta?.signals?.listingTypeId ?? null,
      soldQuantity: meta?.signals?.soldQuantity ?? null,
    },
    negativeMemoryLevel: input.negativeMemoryLevel ?? null,
    insertedOfferId: input.insertedOfferId ?? null,
    affiliateStatus: null,
    discoveredAt: new Date().toISOString(),
    hunterVersion: HUNTER_VERSION,
    normalizationVersion: NORMALIZATION_VERSION,
    scoringVersion: SCORING_VERSION,
    decisionPolicyVersion: DECISION_POLICY_VERSION,
    originalUrl: input.url,
    affiliateUrl: null,
    titleRaw: meta?.title?.trim() || null,
    titleNormalized: meta?.title?.trim() || null,
    imageUrlOriginal: meta?.imageUrl?.trim() || null,
    imageUrlResolved: imageValidation.normalizedUrl,
    imageValidationStatus: imageValidation.status,
    imageValidationReason: imageValidation.reason,
    productIdentifier: fp,
    urlDiagnosis: {},
    validationErrors: imageValidation.needsReview ? [imageValidation.reason] : [],
    diversityCut: input.diversityCut === true,
    negativeMemoryMatch: input.negativeMemoryLevel ?? null,
  };
}
