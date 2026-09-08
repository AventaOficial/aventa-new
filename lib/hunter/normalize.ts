import {
  extractAmazonAsin,
  extractMercadoLibreItemId,
  offerUrlFingerprint,
} from '@/lib/offers/offerUrlFingerprint';
import { isStrongProductFingerprint } from '@/lib/offers/findDuplicateOffer';
import type { IngestItem } from '@/lib/bots/ingest/types';
import { classifyOfferMonetization } from './dayToDay/monetization';
import type { HunterCandidate, HunterSourceId } from './types';

function canonicalUrlKey(url: string): string {
  try {
    const u = new URL(url);
    const mlId = extractMercadoLibreItemId(url);
    if (mlId) return `ml:${mlId}`;
    const asin = extractAmazonAsin(url);
    if (asin) return `amz:${asin}`;
    return `${u.hostname.replace(/^www\./, '')}${u.pathname}`.toLowerCase();
  } catch {
    return url.split('?')[0].toLowerCase();
  }
}

export function externalIdFromUrl(url: string): string | null {
  return extractMercadoLibreItemId(url) ?? extractAmazonAsin(url);
}

export function fingerprintForUrl(url: string): string | null {
  return offerUrlFingerprint(url);
}

export function ingestItemToCandidate(
  item: IngestItem,
  source: HunterSourceId,
  detectedAt = new Date().toISOString()
): HunterCandidate {
  const meta = item.precomputedMeta;
  const url = meta?.canonicalUrl?.trim() || item.url;
  const fp = fingerprintForUrl(url);
  return {
    source,
    externalId: externalIdFromUrl(url),
    url,
    title: meta?.title ?? null,
    price: meta?.discountPrice ?? null,
    originalPrice: meta?.originalPrice ?? null,
    discount: meta?.discountPercent ?? null,
    store: meta?.store ?? null,
    category: meta?.signals?.categoryId ?? null,
    image: meta?.imageUrl ?? null,
    coupon: null,
    shipping: null,
    detectedAt,
    rawMetadata: {
      sourceDetail: item.sourceDetail ?? null,
      ingestSource: item.source,
      hunterSource: source,
      monetizationStatus: classifyOfferMonetization(url),
    },
    fingerprint: fp,
    ingestItem: item,
  };
}

/**
 * Dedupe global del run:
 * 1) fingerprint fuerte (ml:/amz:)
 * 2) externalId
 * 3) canonical URL key
 * 4) fingerprint débil
 */
export function dedupeHunterCandidates(candidates: HunterCandidate[]): HunterCandidate[] {
  const seenStrong = new Set<string>();
  const seenExternal = new Set<string>();
  const seenCanonical = new Set<string>();
  const seenWeak = new Set<string>();
  const out: HunterCandidate[] = [];

  for (const c of candidates) {
    const strong =
      c.fingerprint && isStrongProductFingerprint(c.fingerprint) ? c.fingerprint : null;
    if (strong) {
      if (seenStrong.has(strong)) continue;
      seenStrong.add(strong);
      if (c.externalId) seenExternal.add(c.externalId);
      seenCanonical.add(canonicalUrlKey(c.url));
      out.push(c);
      continue;
    }

    if (c.externalId) {
      if (seenExternal.has(c.externalId)) continue;
      seenExternal.add(c.externalId);
      seenCanonical.add(canonicalUrlKey(c.url));
      if (c.fingerprint) seenWeak.add(c.fingerprint);
      out.push(c);
      continue;
    }

    const canon = canonicalUrlKey(c.url);
    if (seenCanonical.has(canon)) continue;

    if (c.fingerprint) {
      if (seenWeak.has(c.fingerprint)) continue;
      seenWeak.add(c.fingerprint);
    }

    seenCanonical.add(canon);
    out.push(c);
  }

  return out;
}
