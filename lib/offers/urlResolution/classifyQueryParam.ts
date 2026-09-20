import type { QueryParamClass } from './types';

/** Identity / navigation params that must survive canonicalize. */
const IDENTITY = new Set([
  'wid',
  'item_id',
  'itemid',
  'pdp_filters',
  'asin',
  'variation',
  'th',
  'psc',
]);

/** Variant selectors (color/size) — preserve. */
const VARIANT = new Set([
  'attributes',
  'attribute',
  'variation_id',
  'variations',
  'color_id',
  'size',
]);

/** Tracking / affiliate / analytics — drop from canonical. */
const TRACKING = new Set([
  'tag',
  'ref',
  'ref_',
  'ascsubtag',
  'linkcode',
  'camp',
  'creative',
  'creativeasin',
  'adid',
  'gclid',
  'fbclid',
  'mc_cid',
  'mc_eid',
  'ua',
]);

/** Share UI noise — drop. */
const SHARE = new Set(['origin', 'sid', 'action', 'share', 'shared']);

/**
 * Classify a query parameter for canonicalize.
 * Unknown → keep (fail-closed: do not invent drops).
 */
export function classifyOfferUrlQueryParam(key: string): QueryParamClass {
  const k = key.trim().toLowerCase();
  if (!k) return 'unknown';
  if (IDENTITY.has(k)) return 'identity-bearing';
  if (VARIANT.has(k)) return 'variant-bearing';
  if (k.startsWith('utm_') || k.startsWith('matt_') || TRACKING.has(k)) return 'tracking-only';
  if (SHARE.has(k)) return 'share-only';
  return 'unknown';
}

/**
 * ML `/social/…` share pages encode the listing in `ref` (and often need `matt_*`).
 * Dropping them collapses the page to `/lists` with no og:title/og:image — paste parse fails.
 */
function isMercadoLibreSocialPath(pathname: string | undefined): boolean {
  return typeof pathname === 'string' && /\/social\//i.test(pathname);
}

function isSocialShareIdentityParam(key: string): boolean {
  const k = key.trim().toLowerCase();
  return k === 'ref' || k.startsWith('matt_');
}

export function shouldDropQueryParam(
  key: string,
  opts?: { pathname?: string },
): boolean {
  const c = classifyOfferUrlQueryParam(key);
  if (c === 'share-only') return true;
  if (c !== 'tracking-only') return false;
  if (isMercadoLibreSocialPath(opts?.pathname) && isSocialShareIdentityParam(key)) {
    return false;
  }
  return true;
}
