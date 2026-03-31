import { DEFAULT_ML_DISCOVERY_QUERIES } from './config';
import type { BotIngestConfig } from './config';
import type { ParsedOfferMetadata } from './fetchParsedOfferMetadata';
import { sanitizeOfferTitle } from '@/lib/sanitizeOfferTitle';
import type { IngestItem } from './types';
import { fetchMercadoLibreItemsMulti, mlItemBodyToSignals, type MlItemApiBody } from './mlItemDetails';
import { attachMlRatingsToMap, type MlRatingSummary } from './mlReviews';
import { BOT_INGEST_USER_AGENT, sleep } from './ingestHttp';
import { isLowQualityTitle } from './isLowQualityTitle';
import type { OfferQualitySignals } from './offerQualitySignals';

const ML_SITE = 'MLM';
const SEARCH_BASE = `https://api.mercadolibre.com/sites/${ML_SITE}/search`;
const ML_FETCH_DELAY_MS = 300;

type MlSearchHit = {
  id: string;
};

type MlSearchResponse = {
  results?: MlSearchHit[];
};

function canonicalKey(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, '')}${u.pathname}`.toLowerCase();
  } catch {
    return url.split('?')[0].toLowerCase();
  }
}

type SearchCall = { kind: 'q' | 'cat'; value: string; sort: string };

function buildMlSearchPlan(config: BotIngestConfig, rotationWave: number): SearchCall[] {
  const profile = rotationWave % 3;
  const trendingSort = config.mlSortTrending || 'sold_quantity_desc';
  const relevanceSort = 'relevance';

  const queries =
    config.mlQueries.length > 0
      ? config.mlQueries
      : config.mlCategoryIds.length > 0
        ? []
        : config.mlUseDefaultQueries
          ? [...DEFAULT_ML_DISCOVERY_QUERIES]
          : [];

  const calls: SearchCall[] = [];

  if (profile === 0) {
    for (const q of queries.slice(0, 8)) {
      calls.push({ kind: 'q', value: q, sort: trendingSort });
    }
    for (const c of config.techCategoryIds.slice(0, 4)) {
      calls.push({ kind: 'cat', value: c, sort: trendingSort });
    }
  } else if (profile === 1) {
    const cats =
      config.mlCategoryIds.length > 0 ? config.mlCategoryIds : config.techCategoryIds;
    for (const c of cats.slice(0, 10)) {
      calls.push({ kind: 'cat', value: c, sort: relevanceSort });
    }
    for (const q of queries.slice(0, 4)) {
      calls.push({ kind: 'q', value: q, sort: relevanceSort });
    }
  } else {
    for (const c of config.techCategoryIds.slice(0, 6)) {
      calls.push({ kind: 'cat', value: c, sort: relevanceSort });
    }
    for (const q of queries.slice(0, 6)) {
      calls.push({ kind: 'q', value: q, sort: trendingSort });
    }
  }

  return calls;
}

function itemToMeta(body: MlItemApiBody): ParsedOfferMetadata | null {
  const permalink = body.permalink?.trim();
  if (!permalink) return null;
  const titleRaw = sanitizeOfferTitle(body.title) ?? body.title?.trim();
  if (!titleRaw) return null;
  const price = typeof body.price === 'number' ? body.price : null;
  if (price == null || !Number.isFinite(price) || price <= 0) return null;

  let originalPrice: number | null = null;
  const orig = body.original_price;
  if (typeof orig === 'number' && orig > price) {
    originalPrice = orig;
  }

  if (originalPrice == null) return null;

  const pic = body.pictures?.[0];
  const thumb = pic?.secure_url || pic?.url || '';
  const imageUrl = thumb.replace(/^http:\/\//i, 'https://').trim() || '/placeholder.png';

  const discountPercent = Math.round((1 - price / originalPrice) * 100);

  return {
    canonicalUrl: permalink,
    title: titleRaw,
    store: 'Mercado Libre',
    imageUrl,
    discountPrice: price,
    originalPrice,
    discountPercent,
  };
}

function mergeSignals(
  base: OfferQualitySignals,
  rating: MlRatingSummary | undefined
): OfferQualitySignals {
  if (!rating) return base;
  return {
    ...base,
    ratingAverage: rating.average,
    ratingCount: rating.total,
  };
}

function passesMlHardFilters(
  meta: ParsedOfferMetadata,
  signals: OfferQualitySignals,
  rating: MlRatingSummary | undefined,
  config: BotIngestConfig
): boolean {
  if (meta.discountPercent < config.minDiscountPercent) return false;
  if (meta.originalPrice == null || meta.originalPrice <= meta.discountPrice) return false;

  const cond = (signals.condition ?? '').toLowerCase();
  if (cond && cond !== 'new') return false;

  const sold = signals.soldQuantity ?? 0;
  if (sold < config.minSoldQuantityMl) return false;

  if (rating && rating.total >= config.minRatingReviewsCount) {
    if (rating.average < config.minRatingAverage) return false;
  }

  return true;
}

/**
 * Descubre publicaciones vía API ML, enriquece con /items?ids= y valoraciones opcionales.
 * Rotación por `rotationWave` (trending / categorías / mixto).
 */
export async function discoverMercadoLibreIngestItems(
  config: BotIngestConfig,
  seenKeys: Set<string>,
  rotationWave: number
): Promise<IngestItem[]> {
  if (!config.discoverMlEnabled) return [];

  const plan = buildMlSearchPlan(config, rotationWave);
  if (plan.length === 0) return [];

  const idOrder: string[] = [];
  const seenId = new Set<string>();
  const limit = config.mlSearchLimitPerRequest;
  const maxIds = Math.min(config.mlMaxCollect * 3, 240);

  for (const src of plan) {
    if (idOrder.length >= maxIds) break;
    const url = new URL(SEARCH_BASE);
    if (src.kind === 'q') url.searchParams.set('q', src.value);
    else url.searchParams.set('category', src.value);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('sort', src.sort);

    await sleep(ML_FETCH_DELAY_MS);
    let res: Response;
    try {
      res = await fetch(url.href, {
        headers: { Accept: 'application/json', 'User-Agent': BOT_INGEST_USER_AGENT },
        cache: 'no-store',
      });
    } catch {
      continue;
    }
    if (!res.ok) continue;

    let json: MlSearchResponse;
    try {
      json = (await res.json()) as MlSearchResponse;
    } catch {
      continue;
    }

    for (const hit of json.results ?? []) {
      if (!hit?.id || seenId.has(hit.id)) continue;
      seenId.add(hit.id);
      idOrder.push(hit.id);
      if (idOrder.length >= maxIds) break;
    }
  }

  if (idOrder.length === 0) return [];

  const details = await fetchMercadoLibreItemsMulti(idOrder);
  type Row = { id: string; meta: ParsedOfferMetadata; signals: OfferQualitySignals };
  const candidates: Row[] = [];

  for (const id of idOrder) {
    const body = details.get(id);
    if (!body) continue;
    const meta = itemToMeta(body);
    if (!meta) continue;
    if (isLowQualityTitle(meta.title, config)) continue;

    const signals = mlItemBodyToSignals(body);
    candidates.push({ id, meta, signals });
  }

  let ratingMap = new Map<string, MlRatingSummary>();
  if (config.mlFetchReviews && config.mlReviewFetchMax > 0 && candidates.length > 0) {
    const sorted = [...candidates].sort(
      (a, b) => (b.signals.soldQuantity ?? 0) - (a.signals.soldQuantity ?? 0)
    );
    const topIds = sorted.slice(0, Math.min(36, candidates.length)).map((c) => c.id);
    ratingMap = await attachMlRatingsToMap(topIds, config.mlReviewFetchMax);
  }

  const out: IngestItem[] = [];

  for (const row of candidates) {
    if (out.length >= config.mlMaxCollect) break;
    const rating = ratingMap.get(row.id);
    const signals = mergeSignals(row.signals, rating);
    if (!passesMlHardFilters(row.meta, signals, rating, config)) continue;

    const key = canonicalKey(row.meta.canonicalUrl);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    out.push({
      url: row.meta.canonicalUrl,
      source: 'ml_api',
      precomputedMeta: {
        ...row.meta,
        signals,
      },
    });
  }

  return out;
}
