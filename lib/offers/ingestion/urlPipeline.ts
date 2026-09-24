import { stripTrackingNoise } from '@/lib/affiliate/stripTrackingNoise';
import { resolveOutbound } from '@/lib/affiliate/resolveOutbound';
import { normalizePastedOfferUrl } from '@/lib/offerUrl';
import { resolveIngestionIdentity } from '@/lib/offers/ingestion/identity';
import type { UrlPipelineResult } from '@/lib/offers/ingestion/types';

/**
 * Single URL path for lot / discovery paste.
 * Reuses resolveOutbound (normalize → strip tracking → affiliate tags).
 * Does not invent deep links. Does not destroy click_id.
 * Optional clickId is applied with set() (never duplicated).
 */
export function processOfferUrl(
  rawUrl: string,
  store?: string | null,
  options?: { clickId?: string | null },
): UrlPipelineResult {
  const trimmed = rawUrl.trim();
  const clickId = options?.clickId?.trim() || null;
  const outbound = resolveOutbound({
    sourceUrl: trimmed,
    store: store ?? null,
    clickId,
  });
  let affiliateUrl = outbound.affiliateUrl;
  if (clickId && !outbound.urlUncertain) {
    try {
      const u = new URL(affiliateUrl);
      u.searchParams.set('click_id', clickId);
      affiliateUrl = u.toString();
    } catch {
      /* keep affiliateUrl */
    }
  }
  const clean = outbound.urlUncertain
    ? outbound.normalizedUrl
    : stripTrackingNoise(outbound.normalizedUrl).url;
  return {
    rawUrl: trimmed,
    normalizedUrl: clean,
    canonicalUrl: clean,
    affiliateUrl,
    store: outbound.store,
    urlUncertain: outbound.urlUncertain,
    attributionPreserved: outbound.attributionPreserved,
  };
}

/** Stable identity key aligned with server-side resolveIngestionIdentity. */
export function offerIngestionIdentityKey(rawUrl: string): string {
  const identity = resolveIngestionIdentity(rawUrl);
  if (identity.key) return identity.key;
  const processed = processOfferUrl(rawUrl);
  try {
    const u = new URL(processed.canonicalUrl || normalizePastedOfferUrl(rawUrl) || rawUrl);
    u.hash = '';
    const keep = new Set(['asin', 'dp', 'sku', 'wid', 'item_id', 'product_id']);
    for (const key of [...u.searchParams.keys()]) {
      if (!keep.has(key.toLowerCase())) u.searchParams.delete(key);
    }
    return `${u.hostname.toLowerCase()}|${u.pathname.toLowerCase()}|${u.searchParams.toString()}`;
  } catch {
    return processed.canonicalUrl || rawUrl;
  }
}
