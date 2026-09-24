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

export type ReadinessSummary = {
  checks: string[];
  warnings: string[];
  conflicts: string[];
};

/** Explicación compacta para moderación. No es un score. */
export function explainOfferReadiness(input: {
  title: string | null;
  image: string | null;
  price: number | null;
  urlOk: boolean;
  seller: string | null;
  store: string | null;
  availability: string | null;
  previousPrice: number | null;
  conflicts: string[];
}): ReadinessSummary {
  const checks: string[] = [];
  const warnings: string[] = [];
  if (input.title?.trim()) checks.push('title');
  if (input.image?.trim()) checks.push('image');
  if (input.price != null && input.price > 0) checks.push('price');
  if (input.urlOk) checks.push('url');
  if (input.seller?.trim()) checks.push('seller');
  else warnings.push('seller unavailable');
  if (!input.previousPrice || !(input.previousPrice > 0)) warnings.push('previous price unavailable');
  if (input.availability === 'unknown') warnings.push('availability unknown');
  const seller = input.seller?.trim().toLowerCase() ?? '';
  const store = input.store?.trim().toLowerCase() ?? '';
  if (seller && store && !seller.includes(store) && !store.includes(seller)) {
    warnings.push('seller marketplace');
  }
  return {
    checks,
    warnings,
    conflicts: input.conflicts,
  };
}
