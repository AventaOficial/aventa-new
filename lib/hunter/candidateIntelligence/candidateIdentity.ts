/**
 * Explicit candidate identity — never invents IDs.
 * Distinguishes URL-only vs marketplace item ids vs fingerprints.
 */

import { extractAmazonAsin } from '@/lib/offers/offerUrlFingerprint';
import { extractMercadoLibreItemId } from '@/lib/offers/resolveMercadoLibreItem';

export const IDENTITY_TYPES = [
  'ml_item',
  'asin',
  'fingerprint',
  'product_identifier',
  'url',
  'unknown',
] as const;

export type IdentityType = (typeof IDENTITY_TYPES)[number];

export type CandidateIdentity = {
  identityType: IdentityType;
  /** Stable key for novelty / jaccard (typed prefix). */
  identityKey: string | null;
  sourceItemId: string | null;
  canonicalUrl: string | null;
  productIdentity: string | null;
  variantIdentity: string | null;
  /** True when identityKey is only the URL (no stronger evidence). */
  urlOnly: boolean;
};

export type ResolveIdentityInput = {
  canonicalUrl?: string | null;
  sourceUrl?: string | null;
  productFingerprint?: string | null;
  productIdentifier?: string | null;
  source?: string | null;
  /** Explicit marketplace id when adapter already knows it. */
  sourceItemId?: string | null;
};

function normUrl(raw: string | null | undefined): string | null {
  const u = (raw ?? '').trim();
  if (!u) return null;
  try {
    const parsed = new URL(u);
    parsed.hash = '';
    return parsed.href.toLowerCase();
  } catch {
    return u.toLowerCase();
  }
}

/**
 * Resolve identity without inventing. Preference order:
 * 1. explicit sourceItemId / MLM / ASIN from URL
 * 2. productFingerprint
 * 3. productIdentifier (non-URL)
 * 4. canonical URL
 * 5. unknown
 */
export function resolveCandidateIdentity(input: ResolveIdentityInput): CandidateIdentity {
  const canonicalUrl = normUrl(input.canonicalUrl || input.sourceUrl);
  const explicit = input.sourceItemId?.trim() || null;
  const fp = input.productFingerprint?.trim() || null;
  const pid = input.productIdentifier?.trim() || null;

  const mlFromUrl = canonicalUrl ? extractMercadoLibreItemId(canonicalUrl) : null;
  const asinFromUrl = canonicalUrl ? extractAmazonAsin(canonicalUrl) : null;

  const mlId = explicit && /^ML[A-Z]?\d+/i.test(explicit) ? explicit.toUpperCase() : mlFromUrl;
  if (mlId) {
    return {
      identityType: 'ml_item',
      identityKey: `ml_item:${mlId}`,
      sourceItemId: mlId,
      canonicalUrl,
      productIdentity: mlId,
      variantIdentity: null,
      urlOnly: false,
    };
  }

  const asin =
    explicit && /^[A-Z0-9]{10}$/i.test(explicit)
      ? explicit.toUpperCase()
      : asinFromUrl
        ? asinFromUrl.toUpperCase()
        : null;
  if (asin) {
    return {
      identityType: 'asin',
      identityKey: `asin:${asin}`,
      sourceItemId: asin,
      canonicalUrl,
      productIdentity: asin,
      variantIdentity: null,
      urlOnly: false,
    };
  }

  if (fp) {
    return {
      identityType: 'fingerprint',
      identityKey: `fp:${fp}`,
      sourceItemId: explicit,
      canonicalUrl,
      productIdentity: fp,
      variantIdentity: null,
      urlOnly: false,
    };
  }

  if (pid && (!canonicalUrl || pid.toLowerCase() !== canonicalUrl)) {
    return {
      identityType: 'product_identifier',
      identityKey: `pid:${pid}`,
      sourceItemId: explicit ?? pid,
      canonicalUrl,
      productIdentity: pid,
      variantIdentity: null,
      urlOnly: false,
    };
  }

  if (canonicalUrl) {
    return {
      identityType: 'url',
      identityKey: `url:${canonicalUrl}`,
      sourceItemId: explicit,
      canonicalUrl,
      productIdentity: null,
      variantIdentity: null,
      urlOnly: true,
    };
  }

  return {
    identityType: 'unknown',
    identityKey: null,
    sourceItemId: explicit,
    canonicalUrl: null,
    productIdentity: null,
    variantIdentity: null,
    urlOnly: false,
  };
}
