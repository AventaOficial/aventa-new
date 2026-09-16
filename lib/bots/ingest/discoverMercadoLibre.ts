import { DEFAULT_ML_DISCOVERY_QUERIES } from './config';
import type { BotIngestConfig } from './config';
import type { IngestItem } from './types';
import type { ParsedOfferMetadata } from './fetchParsedOfferMetadata';
import { sanitizeOfferTitle } from '@/lib/sanitizeOfferTitle';
import { fetchMercadoLibreItemsMulti, mlItemBodyToSignals, type MlItemApiBody } from './mlItemDetails';
import { attachMlRatingsToMap, type MlRatingSummary } from './mlReviews';
import { sleep } from './ingestHttp';
import { isLowQualityTitle } from './isLowQualityTitle';
import type { OfferQualitySignals } from './offerQualitySignals';
import { firstValidOfferImage } from '@/lib/hunter/enrichment/isValidOfferImage';
import { fetchMlApi } from '@/lib/integrations/mercadolibre/apiClient';

const ML_SITE = 'MLM';
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

type SearchCall = { kind: 'q' | 'cat' | 'hl'; value: string; sort: string };

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

type HighlightsContent = { id?: string; type?: string };
type ProductItemsResponse = {
  results?: Array<{
    item_id?: string;
    price?: number;
    original_price?: number | null;
    category_id?: string;
    condition?: string;
    listing_type_id?: string;
  }>;
};
type DomainDiscoveryHit = { category_id?: string; category_name?: string };
type HighlightListing = {
  itemId: string;
  productId: string;
  title: string;
  price: number;
  originalPrice: number | null;
  categoryId: string | null;
  condition: string | null;
  listingTypeId: string | null;
  imageUrl: string;
  permalink: string;
  attribution: string;
};

function permalinkFromMlItemId(itemId: string): string {
  const m = /^(MLM)(\d+)$/i.exec(itemId.trim());
  if (m) return `https://articulo.mercadolibre.com.mx/${m[1]!.toUpperCase()}-${m[2]}`;
  return `https://www.mercadolibre.com.mx/item/${encodeURIComponent(itemId)}`;
}

async function resolveCategoryFromQuery(query: string): Promise<string | null> {
  const path = `/sites/${ML_SITE}/domain_discovery/search?q=${encodeURIComponent(query)}&limit=1`;
  const api = await fetchMlApi(path);
  if (!api.ok || !Array.isArray(api.data) || api.data.length === 0) return null;
  const hit = api.data[0] as DomainDiscoveryHit;
  const cat = typeof hit.category_id === 'string' ? hit.category_id.trim() : '';
  return cat || null;
}

/**
 * Fallback cuando /sites/.../search y /items están forbidden (403).
 * highlights(category) → products/{id} + products/{id}/items (precio/original disponibles).
 */
async function collectListingsFromHighlights(opts: {
  categoryId: string;
  attribution: string;
  budget: number;
  seenId: Set<string>;
  productsCap?: number;
  itemsPerProduct?: number;
}): Promise<HighlightListing[]> {
  const productsCap = opts.productsCap ?? 8;
  const itemsPerProduct = opts.itemsPerProduct ?? 2;
  const hl = await fetchMlApi(
    `/highlights/${ML_SITE}/category/${encodeURIComponent(opts.categoryId)}`,
  );
  if (!hl.ok || !hl.data || typeof hl.data !== 'object') return [];
  const content =
    (hl.data as { content?: HighlightsContent[] }).content?.map((c) => c.id?.trim()).filter(Boolean) ??
    [];
  const productIds = content.slice(0, productsCap) as string[];
  const out: HighlightListing[] = [];

  for (const productId of productIds) {
    if (out.length >= opts.budget) break;
    await sleep(ML_FETCH_DELAY_MS);
    const product = await fetchMlApi(`/products/${encodeURIComponent(productId)}`);
    if (!product.ok || !product.data || typeof product.data !== 'object') continue;
    const pdata = product.data as {
      name?: string;
      pictures?: Array<{ url?: string; secure_url?: string }>;
    };
    const title = sanitizeOfferTitle(pdata.name) ?? pdata.name?.trim() ?? '';
    if (!title) continue;
    const pics = (pdata.pictures ?? [])
      .map((p) => (p.secure_url || p.url || '').replace(/^http:\/\//i, 'https://').trim())
      .filter(Boolean);
    const imageUrl = firstValidOfferImage(pics) ?? pics[0] ?? '';

    await sleep(ML_FETCH_DELAY_MS);
    const items = await fetchMlApi(`/products/${encodeURIComponent(productId)}/items`);
    if (!items.ok || !items.data || typeof items.data !== 'object') continue;
    const results = (items.data as ProductItemsResponse).results ?? [];
    for (const row of results.slice(0, itemsPerProduct)) {
      const itemId = row.item_id?.trim();
      if (!itemId || opts.seenId.has(itemId)) continue;
      const price = typeof row.price === 'number' ? row.price : null;
      if (price == null || !Number.isFinite(price) || price <= 0) continue;
      const original =
        typeof row.original_price === 'number' && row.original_price > price
          ? row.original_price
          : null;
      opts.seenId.add(itemId);
      out.push({
        itemId,
        productId,
        title,
        price,
        originalPrice: original,
        categoryId: typeof row.category_id === 'string' ? row.category_id : null,
        condition: typeof row.condition === 'string' ? row.condition : null,
        listingTypeId: typeof row.listing_type_id === 'string' ? row.listing_type_id : null,
        imageUrl,
        permalink: permalinkFromMlItemId(itemId),
        attribution: opts.attribution,
      });
      if (out.length >= opts.budget) break;
    }
  }
  return out;
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

  const pics = (body.pictures ?? [])
    .map((p) => (p.secure_url || p.url || '').replace(/^http:\/\//i, 'https://').trim())
    .filter(Boolean);
  const imageUrl = firstValidOfferImage(pics) ?? '';

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
  const sold = signals.soldQuantity ?? 0;
  if (meta.discountPercent < config.minDiscountPercent) return false;
  if (meta.originalPrice == null || meta.originalPrice <= meta.discountPrice) return false;

  if (cond && cond !== 'new') return false;

  // soldQuantity ausente ≠ rechazo (p.ej. highlights path). Solo filtrar cuando hay dato.
  if (signals.soldQuantity != null && sold < config.minSoldQuantityMl) return false;

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
  const idOrder: string[] = [];
  const seenId = new Set<string>();
  /** Primera query/cat/hl que descubrió el item (atribución de telemetría). */
  const idToSearch = new Map<string, SearchCall>();
  const highlightRows: Array<{ id: string; meta: ParsedOfferMetadata; signals: OfferQualitySignals; src: SearchCall }> =
    [];
  const limit = config.mlSearchLimitPerRequest;
  const maxIds = Math.min(config.mlMaxCollect * 3, 240);
  const skipReasonCounts: Record<string, number> = {};
  let searchForbidden = 0;

  for (const src of plan) {
    if (idOrder.length >= maxIds) break;
    const path =
      src.kind === 'q'
        ? `/sites/${ML_SITE}/search?q=${encodeURIComponent(src.value)}&limit=${limit}&sort=${encodeURIComponent(src.sort)}`
        : `/sites/${ML_SITE}/search?category=${encodeURIComponent(src.value)}&limit=${limit}&sort=${encodeURIComponent(src.sort)}`;

    await sleep(ML_FETCH_DELAY_MS);
    const api = await fetchMlApi(path);
    if (!api.ok) {
      bumpReason(skipReasonCounts, `ml discovery: search HTTP ${api.status}`);
      if (api.status === 403) searchForbidden += 1;
      continue;
    }

    const json = api.data as MlSearchResponse;
    for (const hit of json.results ?? []) {
      if (!hit?.id || seenId.has(hit.id)) continue;
      seenId.add(hit.id);
      idOrder.push(hit.id);
      idToSearch.set(hit.id, src);
      if (idOrder.length >= maxIds) break;
    }
  }

  // Fallback: search/items ML forbidden (403). Highlights + product items traen precio/original.
  if (idOrder.length === 0 || searchForbidden >= Math.max(1, Math.floor(plan.length * 0.5))) {
    bumpReason(skipReasonCounts, 'ml discovery: highlights_fallback');
    const categoryBudget = new Map<string, string>();
    for (const c of config.mlCategoryIds.slice(0, 6)) categoryBudget.set(c, `cat:${c}`);
    for (const c of config.techCategoryIds.slice(0, 4)) {
      if (!categoryBudget.has(c)) categoryBudget.set(c, `tech:${c}`);
    }
    for (const q of config.mlQueries.slice(0, 6)) {
      if (categoryBudget.size >= 10) break;
      await sleep(ML_FETCH_DELAY_MS);
      const cat = await resolveCategoryFromQuery(q);
      if (!cat) {
        bumpReason(skipReasonCounts, 'ml discovery: domain_discovery sin categoría');
        continue;
      }
      if (!categoryBudget.has(cat)) categoryBudget.set(cat, `q:${q}`);
    }

    for (const [categoryId, label] of categoryBudget) {
      if (highlightRows.length >= maxIds) break;
      const remaining = maxIds - highlightRows.length;
      const listings = await collectListingsFromHighlights({
        categoryId,
        attribution: label,
        budget: Math.min(remaining, Math.max(6, Math.floor(config.mlMaxCollect / 2))),
        seenId,
      });
      const src: SearchCall = { kind: 'hl', value: `${categoryId}|${label}`, sort: 'highlights' };
      for (const listing of listings) {
        if (listing.originalPrice == null) {
          bumpReason(skipReasonCounts, 'ml discovery: highlights sin precio original');
          continue;
        }
        const discountPercent = Math.round((1 - listing.price / listing.originalPrice) * 100);
        highlightRows.push({
          id: listing.itemId,
          src,
          meta: {
            canonicalUrl: listing.permalink,
            title: listing.title,
            store: 'Mercado Libre',
            imageUrl: listing.imageUrl,
            discountPrice: listing.price,
            originalPrice: listing.originalPrice,
            discountPercent,
          },
          signals: {
            condition: listing.condition,
            categoryId: listing.categoryId,
            listingTypeId: listing.listingTypeId,
            soldQuantity: null,
            currentPriceProvenance: 'source_explicit',
            originalPriceProvenance: 'source_explicit',
            discountPercentProvenance: 'derived',
          },
        });
        idToSearch.set(listing.itemId, src);
      }
      if (listings.length === 0) {
        bumpReason(skipReasonCounts, `ml discovery: highlights vacíos ${categoryId}`);
      }
    }
  }

  if (idOrder.length === 0 && highlightRows.length === 0) {
    bumpReason(skipReasonCounts, 'ml discovery: sin resultados de búsqueda');
    return { items: [], collectedCount: 0, skipReasonCounts };
  }

  const details =
    idOrder.length > 0 ? await fetchMercadoLibreItemsMulti(idOrder) : new Map<string, MlItemApiBody>();

  const priceObservations = [
    ...idOrder.flatMap((id) => {
      const body = details.get(id);
      const price = typeof body?.price === 'number' ? body.price : null;
      if (price == null || !Number.isFinite(price) || price <= 0) return [];
      const orig = body?.original_price;
      const listPrice = typeof orig === 'number' && orig > 0 ? orig : null;
      return [
        {
          productId: id,
          current: price,
          listPrice,
          regularPrice: null as number | null,
          nicheId: config.supplyNicheId ?? null,
        },
      ];
    }),
    ...highlightRows.map((row) => ({
      productId: row.id,
      current: row.meta.discountPrice,
      listPrice: row.meta.originalPrice,
      regularPrice: null as number | null,
      nicheId: config.supplyNicheId ?? null,
    })),
  ];
  if (priceObservations.length > 0) {
    const { recordMlDailySnapshots } = await import('./mlPriceEngine');
    await recordMlDailySnapshots(priceObservations);
  }
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

  for (const row of highlightRows) {
    if (isLowQualityTitle(row.meta.title, config)) {
      bumpReason(skipReasonCounts, 'ml discovery: título de baja calidad');
      continue;
    }
    candidates.push({ id: row.id, meta: row.meta, signals: row.signals });
  }

  // Price Memory → signals (historyReady). Snapshots ya persistidos arriba.
  // preserveLabelDiscount: no sustituir evidencia de etiqueta por intel derivada.
  {
    const { enrichWithPriceIntel } = await import('./priceIntel');
    for (let i = 0; i < candidates.length; i++) {
      const row = candidates[i]!;
      const enrichedMeta = await enrichWithPriceIntel(
        { ...row.meta, signals: { ...row.signals, ...(row.meta.signals ?? {}) } },
        config,
        { preserveLabelDiscount: true, nicheId: config.supplyNicheId ?? null },
      );
      candidates[i] = {
        id: row.id,
        meta: enrichedMeta,
        signals: { ...row.signals, ...(enrichedMeta.signals ?? {}) },
      };
    }
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
    if (typeof signals.soldQuantity === 'number' && signals.soldQuantity < config.minSoldQuantityMl) {
      bumpReason(
        skipReasonCounts,
        `ml discovery: vendidos ${signals.soldQuantity} < mínimo ${config.minSoldQuantityMl}`,
      );
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

    const search = idToSearch.get(row.id);
    const sourceDetail = search
      ? `ml:${search.kind}:${search.value}|sort:${search.sort}`
      : 'ml:unknown';

    out.push({
      url: row.meta.canonicalUrl,
      source: 'ml_api',
      sourceDetail,
      precomputedMeta: {
        ...row.meta,
        signals,
      },
    });
  }

  return { items: out, collectedCount: idOrder.length + highlightRows.length, skipReasonCounts };
}
