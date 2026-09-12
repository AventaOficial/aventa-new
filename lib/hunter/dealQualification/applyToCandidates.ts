import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import type { HunterCandidate } from '../types';
import { qualifyCandidate } from './qualifyCandidate';
import { recordDealQualification } from './metrics';
import type { DealQualificationInput, DealQualificationResult, PromotionKind } from './types';

const PROMO_KINDS = new Set<PromotionKind>([
  '2x1',
  '3x2',
  'combo',
  'coupon',
  'liquidation',
  'special_price',
  'quantity_discount',
]);

function asPromoKind(value: unknown): PromotionKind | null {
  return typeof value === 'string' && PROMO_KINDS.has(value as PromotionKind)
    ? (value as PromotionKind)
    : null;
}

export function qualificationInputFromParsedMeta(
  meta: Pick<
    ParsedOfferMetadata,
    'discountPrice' | 'originalPrice' | 'discountPercent' | 'signals'
  >,
): DealQualificationInput {
  const signals = meta.signals ?? {};
  const originalProvenance = signals.originalPriceProvenance ?? 'unknown';
  const discountProvenance = signals.discountPercentProvenance ?? 'unknown';
  const explicitDiscount =
    discountProvenance === 'derived' || discountProvenance === 'price_intel_derivation'
      ? null
      : (signals.explicitDiscountPercent ?? null);
  return {
    currentPrice: meta.discountPrice,
    originalPrice: meta.originalPrice,
    explicitDiscountPercent: explicitDiscount,
    explicitSavings: signals.explicitSavings ?? null,
    promotionKind: asPromoKind(signals.promotionType),
    promotionBoundToProduct: signals.promotionBoundToProduct === true,
    unboundPromotionMention: signals.unboundPromotionMention === true,
    currentPriceProvenance: signals.currentPriceProvenance ?? 'unknown',
    originalPriceProvenance: originalProvenance,
    discountPercentProvenance: discountProvenance,
    derivedDiscountPercent:
      discountProvenance === 'price_intel_derivation'
        ? (signals.effectiveDiscountPercent ?? meta.discountPercent)
        : null,
  };
}

export function qualifyParsedOfferMetadata(meta: ParsedOfferMetadata): DealQualificationResult {
  return qualifyCandidate(qualificationInputFromParsedMeta(meta));
}

export function qualifyHunterCandidate(candidate: HunterCandidate): DealQualificationResult {
  const meta = candidate.ingestItem.precomputedMeta;
  if (meta) return qualifyParsedOfferMetadata(meta);
  return qualifyCandidate({
    currentPrice: candidate.price,
    originalPrice: candidate.originalPrice,
    explicitDiscountPercent: null,
    explicitSavings: null,
    promotionKind: asPromoKind(candidate.rawMetadata.promotionType),
    promotionBoundToProduct: candidate.rawMetadata.promotionBoundToProduct === true,
    unboundPromotionMention: candidate.rawMetadata.unboundPromotionMention === true,
    currentPriceProvenance: 'source_explicit',
    originalPriceProvenance: candidate.originalPrice != null ? 'source_explicit' : 'unknown',
    discountPercentProvenance: 'unknown',
  });
}

export function attachQualification(
  candidate: HunterCandidate,
  qualification: DealQualificationResult,
): HunterCandidate {
  return {
    ...candidate,
    rawMetadata: {
      ...candidate.rawMetadata,
      dealQualification: qualification.qualification,
      dealQualificationReasons: qualification.reasons,
      dealPriceEvidence: qualification.signals.priceEvidence,
      originalPriceProvenance: qualification.originalPriceProvenance,
    },
    ingestItem: {
      ...candidate.ingestItem,
      qualification,
    },
  };
}

/**
 * Filtra catálogo sin evidencia. Sigue en el mismo pipeline: solo decide qué entra.
 */
export function filterQualifiedHunterCandidates(candidates: HunterCandidate[]): {
  forIngest: HunterCandidate[];
  skipped: HunterCandidate[];
  skipReasonCounts: Record<string, number>;
  evaluated: number;
  samples: Array<{
    title: string | null;
    url: string;
    price: number | null;
    originalPrice: number | null;
    qualification: string;
    reasons: string[];
  }>;
} {
  const skipReasonCounts: Record<string, number> = {};
  const forIngest: HunterCandidate[] = [];
  const skipped: HunterCandidate[] = [];
  const samples: Array<{
    title: string | null;
    url: string;
    price: number | null;
    originalPrice: number | null;
    qualification: string;
    reasons: string[];
  }> = [];
  for (const candidate of candidates) {
    const qualification = qualifyHunterCandidate(candidate);
    recordDealQualification(candidate.source, qualification);
    const tagged = attachQualification(candidate, qualification);
    if (samples.length < 10) {
      samples.push({
        title: tagged.title,
        url: tagged.url,
        price: tagged.price,
        originalPrice: tagged.originalPrice,
        qualification: qualification.qualification,
        reasons: qualification.reasons,
      });
    }
    if (!qualification.continueToPipeline) {
      const reason = qualification.primaryReason;
      skipReasonCounts[reason] = (skipReasonCounts[reason] ?? 0) + 1;
      skipped.push(tagged);
      continue;
    }
    forIngest.push(tagged);
  }
  return { forIngest, skipped, skipReasonCounts, evaluated: candidates.length, samples };
}
