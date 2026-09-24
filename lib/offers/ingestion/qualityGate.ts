import type { OfferReadiness } from '@/lib/offers/ingestion/types';
import type { UrlPipelineResult } from '@/lib/offers/ingestion/types';

export type OfferQualityInput = {
  url: UrlPipelineResult | null;
  title: string | null;
  image: string | null;
  price: number | null;
  store: string | null;
  extractionStatus?: 'success' | 'partial' | 'failed' | null;
  conflicts?: string[];
  pdpAttempted: boolean;
};

export type OfferQualityResult = {
  readiness: OfferReadiness;
  requiredMissing: string[];
  strongMissing: string[];
  blockedReasons: string[];
  readyForReview: boolean;
};

/**
 * Gates before moderation. Incomplete offers are not verified.
 * Does not publish. Does not mint.
 */
export function evaluateOfferQuality(input: OfferQualityInput): OfferQualityResult {
  const requiredMissing: string[] = [];
  const strongMissing: string[] = [];
  const blockedReasons: string[] = [];

  if (!input.url?.rawUrl) requiredMissing.push('url');
  if (input.url?.urlUncertain) blockedReasons.push('url_uncertain');
  if (!input.url?.canonicalUrl && !input.url?.normalizedUrl) requiredMissing.push('canonical_url');
  if (!input.store?.trim()) requiredMissing.push('store');
  if (input.price == null || !(input.price > 0)) requiredMissing.push('price');
  if (!input.pdpAttempted) requiredMissing.push('pdp_evidence');
  if (input.extractionStatus === 'failed') blockedReasons.push('pdp_failed');

  if (!input.title?.trim()) strongMissing.push('title');
  if (!input.image?.trim()) strongMissing.push('image');

  if (blockedReasons.length > 0 || requiredMissing.includes('url')) {
    return {
      readiness: 'blocked',
      requiredMissing,
      strongMissing,
      blockedReasons,
      readyForReview: false,
    };
  }

  if (!input.pdpAttempted) {
    return {
      readiness: 'discovered',
      requiredMissing,
      strongMissing,
      blockedReasons,
      readyForReview: false,
    };
  }

  if (requiredMissing.length > 0) {
    return {
      readiness: 'enriched',
      requiredMissing,
      strongMissing,
      blockedReasons,
      readyForReview: false,
    };
  }

  if (strongMissing.length > 0 || (input.conflicts?.length ?? 0) > 0) {
    return {
      readiness: 'partially_verified',
      requiredMissing,
      strongMissing,
      blockedReasons,
      readyForReview: true,
    };
  }

  return {
    readiness: 'ready_for_review',
    requiredMissing,
    strongMissing,
    blockedReasons,
    readyForReview: true,
  };
}
