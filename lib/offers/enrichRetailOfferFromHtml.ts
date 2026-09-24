/**
 * Autofill enrichment for MX retail PDPs (Liverpool, Coppel, Home Depot, …).
 * Prefers Product JSON-LD (shared with Hunter Day-to-Day); falls back to og/twitter + heuristics.
 */
import { parseJsonLdProducts } from '@/lib/hunter/dayToDay/parsePublicProductHtml';
import { canonicalAvailability, type CanonicalAvailability } from '@/lib/offers/ingestion/pdpFacts';
import { inferStoreFromHostname } from '@/lib/inferStoreFromHostname';
import {
  absoluteUrl,
  extractSuggestedPrices,
  getMetaContent,
} from '@/lib/offers/parseOfferPageHtml';

export type RetailOfferEnrichment = {
  title: string | null;
  image: string | null;
  store: string | null;
  suggestedDiscount: number | null;
  suggestedOriginal: number | null;
  usedJsonLd: boolean;
  seller: string | null;
  brand: string | null;
  availability: CanonicalAvailability | null;
  rating: number | null;
  reviewCount: number | null;
};

/** Hechos verificados del JSON-LD ya parseado. Sin dato → null. */
export function pdpVerifiedFacts(html: string, pageUrl: string) {
  const primary = parseJsonLdProducts(html, pageUrl)[0] ?? null;
  if (!primary) {
    return {
      seller: null,
      brand: null,
      availability: null,
      rating: null,
      reviewCount: null,
      category: null,
    };
  }
  return {
    seller: primary.seller?.trim() || null,
    brand: primary.brand?.trim() || null,
    availability: canonicalAvailability(primary.availability),
    rating: primary.rating,
    reviewCount: primary.reviewCount,
    category: primary.category?.trim() || null,
  };
}

function normalizePair(
  discount: number | null,
  original: number | null,
): { discount: number | null; original: number | null } {
  let d = discount;
  let o = original;
  if (o != null && d != null && o < d) {
    const tmp = o;
    o = d;
    d = tmp;
  }
  if (o != null && d != null && o === d) o = null;
  return { discount: d, original: o };
}

export function enrichRetailOfferFromHtml(html: string, pageUrl: string): RetailOfferEnrichment {
  const products = parseJsonLdProducts(html, pageUrl);
  const primary = products[0] ?? null;

  const ogTitle = getMetaContent(html, 'og:title') || getMetaContent(html, 'twitter:title');
  const ogImage = getMetaContent(html, 'og:image') || getMetaContent(html, 'twitter:image');
  const ogStore =
    getMetaContent(html, 'og:site_name') || getMetaContent(html, 'application-name');

  let host: string | null = null;
  try {
    host = new URL(pageUrl).hostname;
  } catch {
    /* ignore */
  }
  const storeFromHost = host ? inferStoreFromHostname(host) : null;

  const heuristic = extractSuggestedPrices(html);
  const pair = normalizePair(
    primary?.price ?? heuristic.discount,
    primary?.originalPrice ?? heuristic.original,
  );

  const titleRaw = (primary?.title || ogTitle || '').trim();
  const imageRaw = primary?.image || ogImage || null;

  return {
    title: titleRaw.length > 0 ? titleRaw : null,
    image: absoluteUrl(pageUrl, imageRaw),
    store: storeFromHost || (ogStore && ogStore.trim().length > 0 ? ogStore.trim() : null),
    suggestedDiscount: pair.discount,
    suggestedOriginal: pair.original,
    usedJsonLd: Boolean(primary),
    seller: primary?.seller?.trim() || null,
    brand: primary?.brand?.trim() || null,
    availability: canonicalAvailability(primary?.availability),
    rating: primary?.rating ?? null,
    reviewCount: primary?.reviewCount ?? null,
  };
}
