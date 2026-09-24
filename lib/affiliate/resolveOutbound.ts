import { applyPlatformAffiliateTags } from '@/lib/affiliate/applyPlatformAffiliateTags';
import { stripTrackingNoise } from '@/lib/affiliate/stripTrackingNoise';
import { normalizePastedOfferUrl } from '@/lib/offerUrl';

export type OutboundResolution = {
  sourceUrl: string;
  normalizedUrl: string;
  affiliateUrl: string;
  store: string | null;
  offerId: string | null;
  couponId: string | null;
  clickId: string | null;
  /** Retailer coupon deep links are not invented. */
  couponAppliedByRetailer: false;
  attributionPreserved: boolean;
  urlUncertain: boolean;
};

function storeFromHost(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('amazon.')) return 'amazon';
    if (host.includes('mercadolibre.') || host.includes('meli.la')) return 'mercado libre';
    if (host.includes('walmart.')) return 'walmart';
    if (host.includes('shein.')) return 'shein';
    if (host.includes('aliexpress.')) return 'aliexpress';
    if (host.includes('temu.')) return 'temu';
    return null;
  } catch {
    return null;
  }
}

function clickSurvived(source: string, affiliate: string, clickId: string | null): boolean {
  if (!clickId) return true;
  try {
    const before = new URL(source);
    const after = new URL(affiliate);
    const keys = ['click_id', 'clickid', 'subid', 'sub_id'];
    for (const key of keys) {
      if (before.searchParams.get(key) && before.searchParams.get(key) !== after.searchParams.get(key)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Canonical outbound. Affiliate tags go through the existing setter, which replaces
 * a param instead of appending a second copy. Coupon codes are not written into the URL.
 */
export function resolveOutbound(input: {
  sourceUrl: string;
  store?: string | null;
  offerId?: string | null;
  couponId?: string | null;
  clickId?: string | null;
}): OutboundResolution {
  const sourceUrl = input.sourceUrl.trim();
  const normalizedUrl = normalizePastedOfferUrl(sourceUrl) || sourceUrl;
  const stripped = stripTrackingNoise(normalizedUrl);
  const affiliateUrl = stripped.uncertain ? sourceUrl : applyPlatformAffiliateTags(stripped.url);
  return {
    sourceUrl,
    normalizedUrl,
    affiliateUrl,
    store: input.store?.trim().toLowerCase() || storeFromHost(normalizedUrl),
    offerId: input.offerId ?? null,
    couponId: input.couponId ?? null,
    clickId: input.clickId ?? null,
    couponAppliedByRetailer: false,
    attributionPreserved: clickSurvived(stripped.uncertain ? normalizedUrl : stripped.url, affiliateUrl, input.clickId ?? null),
    urlUncertain: stripped.uncertain,
  };
}
