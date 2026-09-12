import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import { extractMercadoLibreItemId } from '@/lib/offers/offerUrlFingerprint';
import {
  fetchMercadoLibrePublicOffer,
  type MercadoLibrePublicOffer,
} from '@/lib/offers/mlPublicOffer';
import { mergeMercadoLibreImageCandidates } from '@/lib/offers/mergeMercadoLibreImageCandidates';
import { extractOfferMetaImages, getById } from '@/lib/offers/parseOfferPageHtml';
import { selectOfferImages } from '@/lib/offers/selectOfferImages';
import { isBlockedOfferParseUrl } from '@/lib/server/fetchUrlSafety';
import { fetchWithTimeout, HUNTER_HTTP_TIMEOUT_MS } from '@/lib/server/fetchWithTimeout';
import { BOT_INGEST_USER_AGENT } from '@/lib/bots/ingest/ingestHttp';
import { isValidOfferImage, firstValidOfferImage } from './isValidOfferImage';
import { enrichmentSourceLabel, recordHunterEnrichment } from './metrics';

export type EnrichmentDeps = {
  fetchMlOffer?: (url: string) => Promise<MercadoLibrePublicOffer | null>;
  fetchHtml?: (url: string) => Promise<string | null>;
};

export type EnrichParsedOfferOptions = {
  source: string;
  sourceDetail?: string | null;
  /**
   * true = el caller ya scrapeó HTML (o la imagen ya es confiable).
   * No implica “nunca HTML”: si hay `opts.html` se puede usar sin red.
   */
  skipHtml?: boolean;
  html?: string | null;
  cache?: Map<string, ParsedOfferMetadata>;
  deps?: EnrichmentDeps;
};

export type EnrichParsedOfferResult = {
  meta: ParsedOfferMetadata;
  changed: boolean;
  skippedNetwork: boolean;
  imageStatus: 'valid' | 'missing';
};

function hasTitle(meta: ParsedOfferMetadata): boolean {
  return Boolean(meta.title?.trim());
}

function hasPrice(meta: ParsedOfferMetadata): boolean {
  return Number.isFinite(meta.discountPrice) && meta.discountPrice > 0;
}

function hasOriginal(meta: ParsedOfferMetadata): boolean {
  return meta.originalPrice != null && Number.isFinite(meta.originalPrice) && meta.originalPrice > meta.discountPrice;
}

function isComplete(meta: ParsedOfferMetadata): boolean {
  return (
    isValidOfferImage(meta.imageUrl) &&
    hasTitle(meta) &&
    hasPrice(meta) &&
    hasOriginal(meta) &&
    Number.isFinite(meta.discountPercent) &&
    meta.discountPercent > 0 &&
    Boolean(meta.store?.trim()) &&
    /^https?:\/\//i.test(meta.canonicalUrl ?? '')
  );
}

function recomputeDiscount(price: number, original: number | null): number {
  if (original == null || !Number.isFinite(original) || original <= price) return 0;
  return Math.round((1 - price / original) * 100);
}

function pickImage(current: string, incoming: Array<string | null | undefined>): string {
  if (isValidOfferImage(current)) return current.trim();
  return firstValidOfferImage(incoming) ?? '';
}

function mergeTrusted(
  current: ParsedOfferMetadata,
  patch: Partial<ParsedOfferMetadata> & { extraImages?: string[] }
): ParsedOfferMetadata {
  const price = hasPrice(current) ? current.discountPrice : (patch.discountPrice ?? current.discountPrice);
  const original = hasOriginal(current)
    ? current.originalPrice
    : patch.originalPrice !== undefined
      ? patch.originalPrice
      : current.originalPrice;
  const discount =
    hasOriginal(current) && hasPrice(current)
      ? current.discountPercent
      : recomputeDiscount(price, original ?? null) || current.discountPercent;

  const filledOriginal = !hasOriginal(current) && original != null && original > price;
  const filledDiscount =
    !(hasOriginal(current) && hasPrice(current)) &&
    original != null &&
    original > price &&
    recomputeDiscount(price, original) > 0;

  return {
    ...current,
    title: hasTitle(current) ? current.title : (patch.title?.trim() || current.title),
    store: current.store?.trim() ? current.store : (patch.store?.trim() || current.store),
    canonicalUrl: current.canonicalUrl?.trim() || patch.canonicalUrl || current.canonicalUrl,
    imageUrl: pickImage(current.imageUrl, [patch.imageUrl, ...(patch.extraImages ?? [])]),
    discountPrice: price,
    originalPrice: original ?? null,
    discountPercent: discount,
    signals: {
      ...(patch.signals ?? {}),
      ...(current.signals ?? {}),
      ...(filledOriginal
        ? { originalPriceProvenance: 'trusted_enrichment' as const }
        : {}),
      ...(filledDiscount && current.signals?.discountPercentProvenance !== 'source_explicit'
        ? { discountPercentProvenance: 'derived' as const }
        : {}),
    },
  };
}

function mlHost(url: string): boolean {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    return h.includes('mercadolibre');
  } catch {
    return false;
  }
}

function amazonHost(url: string): boolean {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    return h.includes('amazon.');
  } catch {
    return false;
  }
}

function pageBase(pageUrl: string): string {
  try {
    const u = new URL(pageUrl);
    return u.origin + u.pathname;
  } catch {
    return pageUrl;
  }
}

/**
 * Solo fuentes atribuibles al producto (og / twitter / JSON-LD Product / landingImage).
 * No scrape de galería CDN / similares.
 */
function trustedImagesFromHtml(html: string, pageUrl: string, mode: 'ml' | 'amazon' | 'generic'): string[] {
  const base = pageBase(pageUrl);
  const trusted = extractOfferMetaImages(html, base);
  if (mode === 'ml') {
    return mergeMercadoLibreImageCandidates({
      apiPictures: [],
      htmlImages: [],
      trustedHtmlImages: trusted,
    });
  }
  const landing = mode === 'amazon' ? getById(html, 'landingImage', 'src') : null;
  return selectOfferImages([...trusted, landing].filter((u): u is string => Boolean(u)));
}

async function defaultFetchHtml(url: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (isBlockedOfferParseUrl(parsed).blocked) return null;
  const res = await fetchWithTimeout(parsed.href, {
    timeoutMs: HUNTER_HTTP_TIMEOUT_MS,
    headers: {
      'User-Agent': BOT_INGEST_USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    redirect: 'follow',
  });
  if (!res.ok) return null;
  return res.text();
}

/**
 * Completa un candidato ya parseado. No inventa imágenes.
 * No pisa campos válidos con datos de menor confianza.
 */
export async function enrichParsedOfferMetadata(
  meta: ParsedOfferMetadata,
  opts: EnrichParsedOfferOptions
): Promise<EnrichParsedOfferResult> {
  const source = enrichmentSourceLabel(opts.source, opts.sourceDetail);
  const cacheKey = `${source}:${meta.canonicalUrl}`;
  const cached = opts.cache?.get(cacheKey);
  if (cached) {
    const imageOk = isValidOfferImage(cached.imageUrl);
    recordHunterEnrichment({
      source,
      changed: false,
      skippedNetwork: true,
      imageFound: imageOk,
      titleFound: hasTitle(cached),
      priceFound: hasPrice(cached),
      failed: false,
      fullyComplete: isComplete(cached),
    });
    return {
      meta: cached,
      changed: false,
      skippedNetwork: true,
      imageStatus: imageOk ? 'valid' : 'missing',
    };
  }

  if (isComplete(meta)) {
    const cleaned = isValidOfferImage(meta.imageUrl) ? meta : { ...meta, imageUrl: '' };
    opts.cache?.set(cacheKey, cleaned);
    recordHunterEnrichment({
      source,
      changed: false,
      skippedNetwork: true,
      imageFound: isValidOfferImage(cleaned.imageUrl),
      titleFound: hasTitle(cleaned),
      priceFound: hasPrice(cleaned),
      failed: false,
      fullyComplete: isComplete(cleaned),
    });
    return {
      meta: cleaned,
      changed: false,
      skippedNetwork: true,
      imageStatus: isValidOfferImage(cleaned.imageUrl) ? 'valid' : 'missing',
    };
  }

  let next = { ...meta };
  if (!isValidOfferImage(next.imageUrl)) next.imageUrl = '';
  let usedNetwork = false;
  let failed = false;
  const url = next.canonicalUrl;
  const fetchMl = opts.deps?.fetchMlOffer ?? ((u: string) => fetchMercadoLibrePublicOffer(u));
  const fetchHtml = opts.deps?.fetchHtml ?? defaultFetchHtml;

  try {
    const mlId = extractMercadoLibreItemId(url);
    if (mlId || mlHost(url)) {
      usedNetwork = true;
      const ml = await fetchMl(url);
      if (ml) {
        const mergedPics = mergeMercadoLibreImageCandidates({
          apiPictures: ml.pictures ?? [],
          htmlImages: [],
          trustedHtmlImages: [],
          mlSource: ml.source,
          sourceItemId: ml.itemId ?? extractMercadoLibreItemId(url),
        });
        const cover = firstValidOfferImage(mergedPics);
        next = mergeTrusted(next, {
          title: ml.title ?? undefined,
          store: 'Mercado Libre',
          discountPrice: ml.price ?? next.discountPrice,
          originalPrice: ml.originalPrice,
          imageUrl: cover ?? '',
          extraImages: mergedPics,
        });
      }
    }
  } catch {
    failed = true;
  }

  const stillNeedsImage = !isValidOfferImage(next.imageUrl);
  const allowHtmlFetch =
    stillNeedsImage && !opts.skipHtml && (amazonHost(url) || mlHost(url));

  try {
    const html =
      opts.html ??
      (allowHtmlFetch
        ? await (async () => {
            usedNetwork = true;
            return fetchHtml(url);
          })()
        : null);

    if (stillNeedsImage && html) {
      const mode = mlHost(url) ? 'ml' : amazonHost(url) ? 'amazon' : 'generic';
      if (mode === 'ml') {
        const trusted = trustedImagesFromHtml(html, url, 'ml');
        const merged = mergeMercadoLibreImageCandidates({
          apiPictures: isValidOfferImage(next.imageUrl) ? [next.imageUrl] : [],
          htmlImages: [],
          trustedHtmlImages: trusted,
          sourceItemId: extractMercadoLibreItemId(url),
        });
        next = mergeTrusted(next, { imageUrl: firstValidOfferImage(merged) ?? '' });
      } else {
        const picked = trustedImagesFromHtml(html, url, mode);
        next = mergeTrusted(next, { imageUrl: firstValidOfferImage(picked) ?? '' });
      }
    }
  } catch {
    failed = true;
  }

  if (!isValidOfferImage(next.imageUrl)) next.imageUrl = '';

  const changed =
    next.imageUrl !== (isValidOfferImage(meta.imageUrl) ? meta.imageUrl : '') ||
    next.title !== meta.title ||
    next.discountPrice !== meta.discountPrice ||
    next.originalPrice !== meta.originalPrice;

  opts.cache?.set(cacheKey, next);
  recordHunterEnrichment({
    source,
    changed,
    skippedNetwork: !usedNetwork,
    imageFound: isValidOfferImage(next.imageUrl),
    titleFound: hasTitle(next),
    priceFound: hasPrice(next),
    failed,
    fullyComplete: isComplete(next),
  });

  return {
    meta: next,
    changed,
    skippedNetwork: !usedNetwork,
    imageStatus: isValidOfferImage(next.imageUrl) ? 'valid' : 'missing',
  };
}
