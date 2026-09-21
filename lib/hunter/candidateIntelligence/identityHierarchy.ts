/**
 * Identity hierarchy — never invents IDs.
 *
 * SOURCE_ITEM_ID → LISTING_ID → PRODUCT_ID → VARIANT_ID → URL
 *
 * Strength explicitly declared when weaker layers are missing.
 */

import { extractAmazonAsin } from '@/lib/offers/offerUrlFingerprint';
import { extractMercadoLibreItemId } from '@/lib/offers/resolveMercadoLibreItem';
import type { ResolveIdentityInput } from './candidateIdentity';

export type IdentityStrength =
  | 'source_item'
  | 'listing'
  | 'product'
  | 'variant'
  | 'fingerprint'
  | 'url'
  | 'unknown';

export type IdentityHierarchy = {
  sourceItemId: string | null;
  listingId: string | null;
  productId: string | null;
  variantId: string | null;
  url: string | null;
  /** Best available typed key for novelty. */
  bestKey: string | null;
  strength: IdentityStrength;
  /** True when only URL evidence exists. */
  urlOnly: boolean;
  note: string;
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
 * Resolve hierarchical identity. Does not invent catalog/variant IDs.
 * For ML: item id is both source_item and listing; product catalog id only if provided.
 * For Amazon: ASIN is source_item + product when no separate parent ASIN given.
 */
export function resolveIdentityHierarchy(
  input: ResolveIdentityInput & {
    listingId?: string | null;
    productId?: string | null;
    variantId?: string | null;
  },
): IdentityHierarchy {
  const url = normUrl(input.canonicalUrl || input.sourceUrl);
  const explicit = input.sourceItemId?.trim() || null;
  const listingIn = input.listingId?.trim() || null;
  const productIn = input.productId?.trim() || null;
  const variantIn = input.variantId?.trim() || null;
  const fp = input.productFingerprint?.trim() || null;
  const pid = input.productIdentifier?.trim() || null;

  const ml = url ? extractMercadoLibreItemId(url) : null;
  const asin = url ? extractAmazonAsin(url) : null;
  const mlId =
    explicit && /^ML[A-Z]?\d+/i.test(explicit) ? explicit.toUpperCase() : ml ? ml.toUpperCase() : null;
  const asinId =
    explicit && /^[A-Z0-9]{10}$/i.test(explicit)
      ? explicit.toUpperCase()
      : asin
        ? asin.toUpperCase()
        : null;

  if (mlId) {
    const productId = productIn || (pid && pid.toUpperCase() !== mlId ? pid : null);
    const listingId = listingIn || mlId;
    const strength: IdentityStrength = productId && productId !== mlId ? 'product' : 'listing';
    return {
      sourceItemId: mlId,
      listingId,
      productId: productId || mlId,
      variantId: variantIn,
      url,
      bestKey: productId && productId !== mlId ? `product:${productId}` : `listing:${listingId}`,
      strength,
      urlOnly: false,
      note:
        productId && productId !== mlId
          ? 'ML listing + distinct product id.'
          : 'ML item id used as listing; no separate catalog product evidence.',
    };
  }

  if (asinId) {
    return {
      sourceItemId: asinId,
      listingId: listingIn || asinId,
      productId: productIn || asinId,
      variantId: variantIn,
      url,
      bestKey: `asin:${asinId}`,
      strength: variantIn ? 'variant' : 'product',
      urlOnly: false,
      note: variantIn ? 'ASIN + variant.' : 'ASIN as product identity; parent ASIN not provided.',
    };
  }

  if (listingIn) {
    return {
      sourceItemId: explicit,
      listingId: listingIn,
      productId: productIn,
      variantId: variantIn,
      url,
      bestKey: `listing:${listingIn}`,
      strength: 'listing',
      urlOnly: false,
      note: 'Explicit listing id without marketplace parse.',
    };
  }

  if (productIn) {
    return {
      sourceItemId: explicit,
      listingId: null,
      productId: productIn,
      variantId: variantIn,
      url,
      bestKey: `product:${productIn}`,
      strength: 'product',
      urlOnly: false,
      note: 'Explicit product id only.',
    };
  }

  if (fp) {
    return {
      sourceItemId: explicit,
      listingId: null,
      productId: fp,
      variantId: variantIn,
      url,
      bestKey: `fp:${fp}`,
      strength: 'fingerprint',
      urlOnly: false,
      note: 'Fingerprint fallback — weaker than marketplace ids.',
    };
  }

  if (pid && (!url || pid.toLowerCase() !== url)) {
    return {
      sourceItemId: explicit ?? pid,
      listingId: null,
      productId: pid,
      variantId: variantIn,
      url,
      bestKey: `pid:${pid}`,
      strength: 'product',
      urlOnly: false,
      note: 'productIdentifier used as product id.',
    };
  }

  if (url) {
    return {
      sourceItemId: explicit,
      listingId: null,
      productId: null,
      variantId: null,
      url,
      bestKey: `url:${url}`,
      strength: 'url',
      urlOnly: true,
      note: 'URL-only identity — unique_url may equal unique_identity (expected when no marketplace id).',
    };
  }

  return {
    sourceItemId: explicit,
    listingId: null,
    productId: null,
    variantId: null,
    url: null,
    bestKey: null,
    strength: 'unknown',
    urlOnly: false,
    note: 'No identity evidence.',
  };
}

/** Novelty keys at each hierarchy level (null when layer absent — never coerce). */
export function hierarchyNoveltyKeys(h: IdentityHierarchy): {
  url: string | null;
  listing: string | null;
  product: string | null;
  variant: string | null;
} {
  return {
    url: h.url ? `url:${h.url}` : null,
    listing: h.listingId ? `listing:${h.listingId}` : null,
    product: h.productId ? `product:${h.productId}` : null,
    variant: h.variantId ? `variant:${h.variantId}` : null,
  };
}
