import { DEFAULT_ML_DISCOVERY_QUERIES } from './config';
import type { BotIngestConfig } from './config';
import type { ParsedOfferMetadata } from './fetchParsedOfferMetadata';
import { sanitizeOfferTitle } from '@/lib/sanitizeOfferTitle';
import { fetchMercadoLibreItemsMulti, mlItemBodyToSignals, type MlItemApiBody } from './mlItemDetails';
import { attachMlRatingsToMap, type MlRatingSummary } from './mlReviews';
import { BOT_INGEST_USER_AGENT, sleep } from './ingestHttp';
import { isLowQualityTitle } from './isLowQualityTitle';
import type { OfferQualitySignals } from './offerQualitySignals';
import type { IngestItem } from './types';

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

function itemToMetaDetailed(body: MlItemApiBody): { meta: ParsedOfferMetadata | null; reason?: string } {
  const permalink = body.permalink?.trim();
  if (!permalink) return { meta: null, reason: 'ml discovery: sin permalink' };
  const titleRaw = sanitizeOfferTitle(body.title) ?? body.title?.trim();
  if (!titleRaw) return { meta: null, reason: 'ml discovery: sin título parseable' };
  const price = typeof body.price === 'number' ? body.price : null;
  if (price == null || !Number.isFinite(price) || price <= 0) {
    return { meta: null, reason: 'ml discovery: sin precio actual parseable' };
  }

  let originalPrice: number | null = null;
  const orig = body.original_price;
  if (typeof orig === 'number' && orig > price) {
    originalPrice = orig;
  }

  if (originalPrice == null) return { meta: null, reason: 'ml discovery: sin precio original verificable' };

  const pic = body.pictures?.[0];
  const thumb = pic?.secure_url || pic?.url || '';
  const imageUrl = thumb.replace(/^http:\/\//i, 'https://').trim() || '/placeholder.png';

  const discountPercent = Math.round((1 - price / originalPrice) * 100);

  return {
    meta: {
      canonicalUrl: permalink,
      title: titleRaw,
      store: 'Mercado Libre',
      imageUrl,
      discountPrice: price,
      originalPrice,
      discountPercent,
    },
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
export type MercadoLibreDiscoveryResult = {
  items: IngestItem[];
  collectedCount: number;
  skipReasonCounts: Record<string, number>;
};

function bumpReason(map: Record<string, number>, reason: string) {
  map[reason] = (map[reason] ?? 0) + 1;
}

export async function discoverMercadoLibreIngestItems(
  config: BotIngestConfig,
  seenKeys: Set<string>,
  rotationWave: number
): Promise<MercadoLibreDiscoveryResult> {
  if (!config.discoverMlEnabled) return { items: [], collectedCount: 0, skipReasonCounts: {} };

  const plan = buildMlSearchPlan(config, rotationWave);
  if (plan.length === 0) return { items: [], collectedCount: 0, skipReasonCounts: {} };

  const idOrder: string[] = [];
  const seenId = new Set<string>();
  const limit = config.mlSearchLimitPerRequest;
  const maxIds = Math.min(config.mlMaxCollect * 3, 240);
  const skipReasonCounts: Record<string, number> = {};

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

  if (idOrder.length === 0) {
    bumpReason(skipReasonCounts, 'ml discovery: sin resultados de búsqueda');
    return { items: [], collectedCount: 0, skipReasonCounts };
  }

  const details = await fetchMercadoLibreItemsMulti(idOrder);
  type Row = { id: string; meta: ParsedOfferMetadata; signals: OfferQualitySignals };
  const candidates: Row[] = [];

  for (const id of idOrder) {
    const body = details.get(id);
    if (!body) {
      bumpReason(skipReasonCounts, 'ml discovery: detalle de item no disponible');
      continue;
    }
    const parse = itemToMetaDetailed(body);
    const meta = parse.meta;
    if (!meta) {
      bumpReason(skipReasonCounts, parse.reason ?? 'ml discovery: sin metadatos');
      continue;
    }
    if (isLowQualityTitle(meta.title, config)) {
      bumpReason(skipReasonCounts, 'ml discovery: título de baja calidad');
      continue;
    }

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
    const cond = (signals.condition ?? '').toLowerCase();
    const sold = signals.soldQuantity ?? 0;
    if (row.meta.discountPercent < config.minDiscountPercent) {
      bumpReason(skipReasonCounts, `ml discovery: descuento ${row.meta.discountPercent}% < mínimo ${config.minDiscountPercent}%`);
      continue;
    }
    if (row.meta.originalPrice == null || row.meta.originalPrice <= row.meta.discountPrice) {
      bumpReason(skipReasonCounts, 'ml discovery: sin precio original verificable');
      continue;
    }
    if (cond && cond !== 'new') {
      bumpReason(skipReasonCounts, 'ml discovery: condición no es nueva');
      continue;
    }
    if (sold < config.minSoldQuantityMl) {
      bumpReason(skipReasonCounts, `ml discovery: vendidos ${sold} < mínimo ${config.minSoldQuantityMl}`);
      continue;
    }
    if (rating && rating.total >= config.minRatingReviewsCount && rating.average < config.minRatingAverage) {
      bumpReason(skipReasonCounts, `ml discovery: rating ${rating.average} < mínimo ${config.minRatingAverage}`);
      continue;
    }
    if (!passesMlHardFilters(row.meta, signals, rating, config)) {
      bumpReason(skipReasonCounts, 'ml discovery: descartado por filtros duros');
      continue;
    }

    const key = canonicalKey(row.meta.canonicalUrl);
    if (seenKeys.has(key)) {
      bumpReason(skipReasonCounts, 'ml discovery: duplicado por URL canónica');
      continue;
    }
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

  return { items: out, collectedCount: idOrder.length, skipReasonCounts };
}
