import { createHash } from 'node:crypto';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import type { ScoreBreakdown } from '@/lib/bots/ingest/scoreIngestCandidate';
import { resolveCanonicalDiscount } from '@/lib/bots/ingest/canonicalDiscount';
import { strongProductFingerprintForUrl } from '@/lib/offers/findDuplicateOffer';
import { validateOfferImageUrl } from '@/lib/offers/imageValidation';
import { resolveCandidateIdentity } from './candidateIdentity';
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
  if (u.includes('mercadolibre.') || u.includes('mercadolivre.') || u.includes('meli.la') || source.includes('ml')) {
    return 'mercadolibre_mx';
  }
  if (u.includes('amazon.') || u.includes('amzn.to') || u.includes('a.co/') || source.includes('amazon')) {
    return 'amazon_mx';
  }
  if (u.includes('walmart.') || u.includes('walmart.page.link')) return 'walmart_mx';
  if (u.includes('chedraui.')) return 'chedraui_mx';
  if (u.includes('bodegaaurrera.') || u.includes('bodega-aurrera.')) return 'bodega_aurrera_mx';
  if (u.includes('liverpool.')) return 'liverpool_mx';
  if (u.includes('coppel.')) return 'coppel_mx';
  if (u.includes('elpalaciodehierro.')) return 'palacio_hierro_mx';
  if (u.includes('sears.com.mx')) return 'sears_mx';
  if (u.includes('suburbia.')) return 'suburbia_mx';
  if (u.includes('elektra.')) return 'elektra_mx';
  if (u.includes('sanborns.')) return 'sanborns_mx';
  if (u.includes('costco.') || u.includes('cost.co')) return 'costco_mx';
  if (u.includes('sams.com.mx')) return 'sams_mx';
  if (u.includes('officedepot.')) return 'office_depot_mx';
  if (u.includes('officemax.')) return 'office_max_mx';
  if (u.includes('soriana.')) return 'soriana_mx';
  if (u.includes('cityclub.')) return 'city_club_mx';
  if (u.includes('heb.com.mx')) return 'heb_mx';
  if (u.includes('lacomer.')) return 'la_comer_mx';
  if (u.includes('citymarket.com.mx')) return 'city_market_mx';
  if (u.includes('fresko.com.mx')) return 'fresko_mx';
  if (u.includes('superama.')) return 'superama_mx';
  if (u.includes('homedepot.')) return 'home_depot_mx';
  if (u.includes('sodimac.')) return 'sodimac_mx';
  if (u.includes('cyberpuerta.')) return 'cyberpuerta_mx';
  if (u.includes('ddtech.')) return 'ddtech_mx';
  if (u.includes('pcel.com')) return 'pcel_mx';
  if (u.includes('doto.com.mx')) return 'doto_mx';
  if (u.includes('steren.')) return 'steren_mx';
  if (u.includes('radioshack.')) return 'radioshack_mx';
  if (u.includes('claroshop.')) return 'claroshop_mx';
  if (u.includes('ebay.') || u.includes('ebay.to')) return 'ebay';
  if (u.includes('shein.')) return 'shein';
  if (u.includes('temu.')) return 'temu';
  if (u.includes('aliexpress.')) return 'aliexpress';
  if (u.includes('shopee.') || u.includes('shp.ee')) return 'shopee_mx';
  if (u.includes('nike.com')) return 'nike';
  if (u.includes('adidas.')) return 'adidas';
  if (u.includes('apple.com')) return 'apple';
  if (u.includes('ishopmixup.') || u.includes('mixup.com.mx')) return 'ishop_mixup_mx';
  if (u.includes('innovasport.')) return 'innovasport_mx';
  if (u.includes('priceshoes.')) return 'price_shoes_mx';
  if (u.includes('andrea.com.mx')) return 'andrea_mx';
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

  const identity = resolveCandidateIdentity({
    canonicalUrl: canonical || input.url,
    sourceUrl: input.url,
    productFingerprint: fp,
    source: input.source,
    sourceItemId:
      typeof input.evidence?.sourceItemId === 'string' ? input.evidence.sourceItemId : null,
  });

  const truth = resolveCanonicalDiscount({
    salePrice: meta?.discountPrice,
    originalPrice: meta?.originalPrice,
    suppliedDiscountPercentage: meta?.discountPercent,
    originalPriceProvenance: meta?.signals?.originalPriceProvenance ?? null,
    cardDiscountSource: meta?.signals?.cardDiscountSource ?? null,
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
    // null when UNKNOWN — never persist 0 as stand-in for missing evidence
    discountPercentage: truth.discountPercentage,
    discountClass: truth.discountClass,
    discountClassV1: truth.discountClassV1 ?? null,
    discountConfidence: truth.confidence,
    discountSource: truth.source,
    priceEvidence: {
      calculationStatus: truth.calculationStatus,
      salePrice: truth.evidence.salePrice,
      originalPrice: truth.evidence.originalPrice,
      suppliedDiscountPercentage: truth.evidence.suppliedDiscountPercentage,
      computedDiscountPercentage: truth.evidence.computedDiscountPercentage,
      delta: truth.evidence.delta,
      reasonForDiscrepancy: truth.evidence.reasonForDiscrepancy,
      effectiveDiscountPercent: meta?.signals?.effectiveDiscountPercent ?? null,
      discountConflict: meta?.signals?.discountConflict ?? null,
    },
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
      identityType: identity.identityType,
      identityKey: identity.identityKey,
      sourceItemId: identity.sourceItemId,
      productIdentity: identity.productIdentity,
      variantIdentity: identity.variantIdentity,
      urlOnly: identity.urlOnly,
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
    productIdentifier: identity.productIdentity ?? identity.sourceItemId ?? fp,
    urlDiagnosis: {},
    validationErrors: imageValidation.needsReview ? [imageValidation.reason] : [],
    diversityCut: input.diversityCut === true,
    negativeMemoryMatch: input.negativeMemoryLevel ?? null,
  };
}
