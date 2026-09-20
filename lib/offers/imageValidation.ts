/**
 * Deterministic offer image validation — no external AI.
 * Observability first: classify status + reason without blocking mint unless caller chooses.
 */

import { normalizeOfferImageUrl } from '@/lib/offerPath';
import { isHighConfidenceJunkImage } from '@/lib/offers/selectOfferImages';
import { isValidOfferImage } from '@/lib/hunter/enrichment/isValidOfferImage';

export const IMAGE_VALIDATION_STATUSES = [
  'ok',
  'missing',
  'empty',
  'junk',
  'placeholder',
  'broken_url',
  'host_untrusted',
  'tiny_thumb',
  'possible_product_mismatch',
  'unknown',
] as const;

export type ImageValidationStatus = (typeof IMAGE_VALIDATION_STATUSES)[number];

export type ImageValidationResult = {
  status: ImageValidationStatus;
  reason: string;
  normalizedUrl: string | null;
  /** Soft signal for moderation — never auto-publishes. */
  needsReview: boolean;
};

const TRUSTED_IMAGE_HOST_SUFFIXES = [
  'mlstatic.com',
  'media-amazon.com',
  'ssl-images-amazon.com',
  'images-amazon.com',
  'supabase.co',
  'aventaofertas.com',
  'googleusercontent.com',
] as const;

function hostTrusted(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return TRUSTED_IMAGE_HOST_SUFFIXES.some((s) => h === s || h.endsWith(`.${s}`));
}

/**
 * Validate a product image URL deterministically.
 * Does not fetch HTTP (caller may attach http status separately).
 */
export function validateOfferImageUrl(
  raw: string | null | undefined,
  opts?: { titleHint?: string | null },
): ImageValidationResult {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) {
    return {
      status: 'missing',
      reason: 'image_url_empty',
      normalizedUrl: null,
      needsReview: true,
    };
  }

  const normalized = normalizeOfferImageUrl(trimmed);
  if (!normalized) {
    return {
      status: 'broken_url',
      reason: 'normalize_failed_or_placeholder_path',
      normalizedUrl: null,
      needsReview: true,
    };
  }

  if (normalized.startsWith('data:')) {
    return {
      status: 'junk',
      reason: 'data_uri_not_allowed',
      normalizedUrl: null,
      needsReview: true,
    };
  }

  let hostname = '';
  try {
    hostname = new URL(normalized).hostname;
  } catch {
    return {
      status: 'broken_url',
      reason: 'invalid_url',
      normalizedUrl: null,
      needsReview: true,
    };
  }

  if (!hostTrusted(hostname)) {
    return {
      status: 'host_untrusted',
      reason: `host_not_in_allowlist:${hostname}`,
      normalizedUrl: normalized,
      needsReview: true,
    };
  }

  if (isHighConfidenceJunkImage(normalized) || /placeholder|grey-pixel|1x1/i.test(normalized)) {
    return {
      status: 'placeholder',
      reason: 'junk_or_placeholder_pattern',
      normalizedUrl: normalized,
      needsReview: true,
    };
  }

  if (/_AC_US\d{1,2}_|_SS\d{1,2}_|_SR\d{1,3},\d{1,3}_/i.test(normalized)) {
    return {
      status: 'tiny_thumb',
      reason: 'amazon_tiny_thumb',
      normalizedUrl: normalized,
      needsReview: true,
    };
  }

  if (!isValidOfferImage(normalized)) {
    return {
      status: 'junk',
      reason: 'failed_is_valid_offer_image',
      normalizedUrl: normalized,
      needsReview: true,
    };
  }

  // Without semantic model we cannot prove product↔image match.
  // Soft flag when title is empty (higher mismatch risk for scraped galleries).
  if (!opts?.titleHint?.trim()) {
    return {
      status: 'possible_product_mismatch',
      reason: 'no_title_to_cross_check',
      normalizedUrl: normalized,
      needsReview: true,
    };
  }

  return {
    status: 'ok',
    reason: 'passed_deterministic_checks',
    normalizedUrl: normalized,
    needsReview: false,
  };
}
