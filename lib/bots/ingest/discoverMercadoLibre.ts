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
import { applyCanonicalDiscountToMetaFields } from './canonicalDiscount';
import {
  buildAdaptiveDiscoveryPlan,
  formatMlSourceDetail,
  nextSchedulerState,
  type AdaptiveSearchCall,
} from '@/lib/hunter/candidateIntelligence/discoveryScheduler';
import {
  loadSchedulerState,
  saveSchedulerState,
} from '@/lib/hunter/candidateIntelligence/schedulerStateStore';

const ML_SITE = 'MLM';
const ML_FETCH_DELAY_MS = 300;

function canonicalKey(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, '')}${u.pathname}`.toLowerCase();
  } catch {
    return url.split('?')[0].toLowerCase();
  }
}

type SearchCall = { kind: 'q' | 'cat' | 'hl'; value: string; sort: string; page?: number; axis?: string };

/**
 * Adaptive discovery ON by default (evidence: fixed BOT_INGEST_ML_QUERIES = sticky pot).
 * Opt out: HUNTER_ADAPTIVE_DISCOVERY=0
 */
export function isAdaptiveDiscoveryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.HUNTER_ADAPTIVE_DISCOVERY ?? '1').trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'off' || raw === 'no') return false;
  return true;
}

function buildMlSearchPlan(
  config: BotIngestConfig,
  rotationWave: number,
  priorState?: Parameters<typeof buildAdaptiveDiscoveryPlan>[0]['priorState'],
): SearchCall[] {
  if (isAdaptiveDiscoveryEnabled()) {
    const plan = buildAdaptiveDiscoveryPlan({
      runSlot: rotationWave,
      priorState: priorState ?? null,
      exploitQueries: config.mlQueries.length > 0 ? config.mlQueries : undefined,
      exploitCategories:
        config.mlCategoryIds.length > 0
          ? config.mlCategoryIds
          : config.techCategoryIds.length > 0
            ? config.techCategoryIds
            : undefined,
      trendingSort: config.mlSortTrending || 'sold_quantity_desc',
      maxCalls: 14,
      pageStrategy: 'page_1_only',
      // 35% explore when exploit list is the sticky ≤12 pot
      explorationShare: config.mlQueries.length > 0 && config.mlQueries.length <= 12 ? 0.4 : 0.3,
    });
    return plan.calls.map((c: AdaptiveSearchCall) => ({
      kind: c.kind,
      value: c.value,
      sort: c.sort,
      page: c.page,
      axis: c.axis,
    }));
  }

  // Legacy opt-out path — still rotates page-1 only (no page≥2).
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
      calls.push({ kind: 'q', value: q, sort: trendingSort, page: 1, axis: 'exploit' });
    }
    for (const c of config.techCategoryIds.slice(0, 4)) {
      calls.push({ kind: 'cat', value: c, sort: trendingSort, page: 1, axis: 'exploit' });
    }
  } else if (profile === 1) {
    const cats =
      config.mlCategoryIds.length > 0 ? config.mlCategoryIds : config.techCategoryIds;
    for (const c of cats.slice(0, 10)) {
      calls.push({ kind: 'cat', value: c, sort: relevanceSort, page: 1, axis: 'exploit' });
    }
    for (const q of queries.slice(0, 4)) {
      calls.push({ kind: 'q', value: q, sort: relevanceSort, page: 1, axis: 'exploit' });
    }
  } else {
    for (const c of config.techCategoryIds.slice(0, 6)) {
      calls.push({ kind: 'cat', value: c, sort: relevanceSort, page: 1, axis: 'exploit' });
    }
    for (const q of queries.slice(0, 6)) {
      calls.push({ kind: 'q', value: q, sort: trendingSort, page: 1, axis: 'exploit' });
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
 * Resuelve catalog product IDs → listings con precio vía /products/{id}/items.
 * (GET /items/{id} y /sites/.../search genérico están forbidden en ML desde 2025.)
 * URL-bearing drops se reportan vía onSkip (zero silent drops).
 */
async function collectListingsFromProductIds(opts: {
  productIds: string[];
  attribution: string;
  budget: number;
  seenId: Set<string>;
  itemsPerProduct?: number;
  onSkip?: (entry: MercadoLibreDiscoverySkip) => void;
}): Promise<HighlightListing[]> {
  const itemsPerProduct = opts.itemsPerProduct ?? 2;
  const out: HighlightListing[] = [];
  const skip = opts.onSkip;

  for (const productIdRaw of opts.productIds) {
    if (out.length >= opts.budget) break;
    const productId = productIdRaw?.trim();
    if (!productId) continue;
    const productUrl = `https://www.mercadolibre.com.mx/p/${productId}`;
    await sleep(ML_FETCH_DELAY_MS);
    const product = await fetchMlApi(`/products/${encodeURIComponent(productId)}`);
    if (!product.ok || !product.data || typeof product.data !== 'object') {
      skip?.({
        url: productUrl,
        title: null,
        itemId: productId,
        reason: 'ml discovery: product lookup failed',
      });
      continue;
    }
    const pdata = product.data as {
      name?: string;
      parent_id?: string | null;
      pictures?: Array<{ url?: string; secure_url?: string }>;
    };
    const title = sanitizeOfferTitle(pdata.name) ?? pdata.name?.trim() ?? '';
    if (!title) {
      skip?.({
        url: productUrl,
        title: null,
        itemId: productId,
        reason: 'ml discovery: product sin título',
      });
      continue;
    }
    const pics = (pdata.pictures ?? [])
      .map((p) => (p.secure_url || p.url || '').replace(/^http:\/\//i, 'https://').trim())
      .filter(Boolean);
    const imageUrl = firstValidOfferImage(pics) ?? pics[0] ?? '';

    const candidateIds = [productId];
    const parentId = typeof pdata.parent_id === 'string' ? pdata.parent_id.trim() : '';
    if (parentId && parentId !== productId) candidateIds.push(parentId);

    let results: NonNullable<ProductItemsResponse['results']> = [];
    let resolvedProductId = productId;
    for (const tryId of candidateIds) {
      await sleep(ML_FETCH_DELAY_MS);
      const items = await fetchMlApi(`/products/${encodeURIComponent(tryId)}/items`);
      if (!items.ok || !items.data || typeof items.data !== 'object') continue;
      const rows = (items.data as ProductItemsResponse).results ?? [];
      if (rows.length === 0) continue;
      results = rows;
      resolvedProductId = tryId;
      break;
    }
    if (results.length === 0) {
      skip?.({
        url: productUrl,
        title,
        itemId: productId,
        reason: 'ml discovery: product sin listings',
      });
      continue;
    }

    const capped = results.slice(0, itemsPerProduct);
    for (let i = itemsPerProduct; i < results.length; i++) {
      const itemId = results[i]?.item_id?.trim();
      if (!itemId || opts.seenId.has(itemId)) continue;
      skip?.({
        url: permalinkFromMlItemId(itemId),
        title,
        itemId,
        reason: 'ml discovery: items_per_product truncated',
      });
    }

    for (const row of capped) {
      const itemId = row.item_id?.trim();
      if (!itemId) continue;
      if (opts.seenId.has(itemId)) {
        skip?.({
          url: permalinkFromMlItemId(itemId),
          title,
          itemId,
          reason: 'ml discovery: item duplicado en lote',
        });
        continue;
      }
      const price = typeof row.price === 'number' ? row.price : null;
      if (price == null || !Number.isFinite(price) || price <= 0) {
        skip?.({
          url: permalinkFromMlItemId(itemId),
          title,
          itemId,
          reason: 'ml discovery: listing sin precio',
        });
        continue;
      }
      const original =
        typeof row.original_price === 'number' && row.original_price > price
          ? row.original_price
          : null;
      opts.seenId.add(itemId);
      out.push({
        itemId,
        productId: resolvedProductId,
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

/**
 * Fallback / path categórico: highlights(category) → products/{id}/items.
 */
async function collectListingsFromHighlights(opts: {
  categoryId: string;
  attribution: string;
  budget: number;
  seenId: Set<string>;
  productsCap?: number;
  itemsPerProduct?: number;
  onSkip?: (entry: MercadoLibreDiscoverySkip) => void;
}): Promise<HighlightListing[]> {
  const productsCap = opts.productsCap ?? 8;
  const hl = await fetchMlApi(
    `/highlights/${ML_SITE}/category/${encodeURIComponent(opts.categoryId)}`,
  );
  if (!hl.ok || !hl.data || typeof hl.data !== 'object') return [];
  const content =
    (hl.data as { content?: HighlightsContent[] }).content?.map((c) => c.id?.trim()).filter(Boolean) ??
    [];
  const productIds = content.slice(0, productsCap) as string[];
  for (let i = productsCap; i < content.length; i++) {
    const pid = content[i];
    if (!pid) continue;
    opts.onSkip?.({
      url: `https://www.mercadolibre.com.mx/p/${pid}`,
      title: null,
      itemId: pid,
      reason: 'ml discovery: products_cap truncated',
    });
  }
  return collectListingsFromProductIds({
    productIds,
    attribution: opts.attribution,
    budget: opts.budget,
    seenId: opts.seenId,
    itemsPerProduct: opts.itemsPerProduct,
    onSkip: opts.onSkip,
  });
}

type ProductsSearchHit = { id?: string; catalog_product_id?: string };
type ProductsSearchResponse = {
  results?: ProductsSearchHit[];
  paging?: { total?: number; offset?: number; limit?: number };
};

function pushHighlightRows(
  highlightRows: Array<{ id: string; meta: ParsedOfferMetadata; signals: OfferQualitySignals; src: SearchCall }>,
  idToSearch: Map<string, SearchCall>,
  listings: HighlightListing[],
  src: SearchCall,
  skipReasonCounts: Record<string, number>,
  skippedCandidates: MercadoLibreDiscoverySkip[],
) {
  for (const listing of listings) {
    if (listing.originalPrice == null) {
      pushSkip(skippedCandidates, skipReasonCounts, {
        url: listing.permalink || mlItemUrl(listing.itemId),
        title: listing.title,
        itemId: listing.itemId,
        reason: 'ml discovery: highlights sin precio original',
      });
      continue;
    }
    const applied = applyCanonicalDiscountToMetaFields({
      salePrice: listing.price,
      originalPrice: listing.originalPrice,
      existingDiscountPercent: null,
      originalPriceProvenance: 'source_explicit',
    });
    const discountPercent = applied.discountPercent;
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
        discountCalculationStatus: applied.canonical.calculationStatus,
        discountTruthSource: applied.canonical.source,
        discountTruthConfidence: applied.canonical.confidence,
      },
    });
    idToSearch.set(listing.itemId, src);
  }
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

  const applied = applyCanonicalDiscountToMetaFields({
    salePrice: price,
    originalPrice,
    existingDiscountPercent: null,
    originalPriceProvenance: 'source_explicit',
  });
  const discountPercent = applied.discountPercent;

  return {
    meta: {
      canonicalUrl: permalink,
      title: titleRaw,
      store: 'Mercado Libre',
      imageUrl,
      discountPrice: price,
      originalPrice,
      discountPercent,
      signals: {
        discountCalculationStatus: applied.canonical.calculationStatus,
        discountTruthSource: applied.canonical.source,
        discountTruthConfidence: applied.canonical.confidence,
        discountPercentProvenance: 'derived',
        currentPriceProvenance: 'source_explicit',
        originalPriceProvenance: 'source_explicit',
      },
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
  // null = UNKNOWN — reject (same outcome as below-threshold under existing policy).
  if (
    meta.discountPercent == null ||
    meta.discountPercent < config.minDiscountPercent
  ) {
    return false;
  }
  if (meta.originalPrice == null || meta.originalPrice <= meta.discountPrice) return false;

  const cond = (signals.condition ?? '').toLowerCase();
  const sold = signals.soldQuantity ?? 0;
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
export type MercadoLibreDiscoverySkip = {
  url: string;
  title?: string | null;
  reason: string;
  itemId?: string | null;
};

export type MercadoLibreDiscoveryResult = {
  items: IngestItem[];
  collectedCount: number;
  skipReasonCounts: Record<string, number>;
  /** Per-candidate discovery drops with URLs when known (zero silent drops). */
  skippedCandidates: MercadoLibreDiscoverySkip[];
};

function bumpReason(map: Record<string, number>, reason: string) {
  map[reason] = (map[reason] ?? 0) + 1;
}

function pushSkip(
  skips: MercadoLibreDiscoverySkip[],
  skipReasonCounts: Record<string, number>,
  entry: MercadoLibreDiscoverySkip,
) {
  bumpReason(skipReasonCounts, entry.reason);
  skips.push(entry);
}

function mlItemUrl(id: string, permalink?: string | null): string {
  const p = typeof permalink === 'string' ? permalink.trim() : '';
  if (p.startsWith('http')) return p;
  return `https://www.mercadolibre.com.mx/p/${id}`;
}

export async function discoverMercadoLibreIngestItems(
  config: BotIngestConfig,
  seenKeys: Set<string>,
  rotationWave: number
): Promise<MercadoLibreDiscoveryResult> {
  if (!config.discoverMlEnabled) {
    return { items: [], collectedCount: 0, skipReasonCounts: {}, skippedCandidates: [] };
  }

  let supabase: import('@supabase/supabase-js').SupabaseClient | null = null;
  if (isAdaptiveDiscoveryEnabled()) {
    try {
      const { createServerClient } = await import('@/lib/supabase/server');
      supabase = createServerClient();
    } catch {
      supabase = null;
    }
  }
  const priorState = isAdaptiveDiscoveryEnabled()
    ? await loadSchedulerState({ supabase })
    : null;

  const plan = buildMlSearchPlan(config, rotationWave, priorState);

  // Advance cursors so the next process does not re-hit the same explore window.
  if (isAdaptiveDiscoveryEnabled()) {
    const adaptivePlan = buildAdaptiveDiscoveryPlan({
      runSlot: rotationWave,
      priorState,
      exploitQueries: config.mlQueries.length > 0 ? config.mlQueries : undefined,
      exploitCategories:
        config.mlCategoryIds.length > 0
          ? config.mlCategoryIds
          : config.techCategoryIds.length > 0
            ? config.techCategoryIds
            : undefined,
      trendingSort: config.mlSortTrending || 'sold_quantity_desc',
      maxCalls: 14,
      pageStrategy: 'page_1_only',
      explorationShare: config.mlQueries.length > 0 && config.mlQueries.length <= 12 ? 0.4 : 0.3,
    });
    const next = nextSchedulerState(adaptivePlan, priorState);
    await saveSchedulerState({ supabase, state: next });
  }

  const idOrder: string[] = [];
  const seenId = new Set<string>();
  /** Primera query/cat/hl que descubrió el item (atribución de telemetría). */
  const idToSearch = new Map<string, SearchCall>();
  const highlightRows: Array<{ id: string; meta: ParsedOfferMetadata; signals: OfferQualitySignals; src: SearchCall }> =
    [];
  const limit = config.mlSearchLimitPerRequest;
  const maxIds = Math.min(config.mlMaxCollect * 3, 240);
  const skipReasonCounts: Record<string, number> = {};
  const skippedCandidates: MercadoLibreDiscoverySkip[] = [];
  let searchForbidden = 0;

  // Discovery Experiment: optional page/offset depth ONLY when page axis explicitly enabled.
  // FACT: page>=2 produced 0 new products — default is single page (offset=0).
  const experimentOn = ['1', 'true', 'on', 'yes'].includes(
    (process.env.HUNTER_DISCOVERY_EXPERIMENT ?? '0').trim().toLowerCase(),
  );
  const experimentVariant = (process.env.HUNTER_DISCOVERY_EXPERIMENT_VARIANT ?? 'baseline_sticky')
    .trim()
    .toLowerCase();
  const enablePageAxis = ['1', 'true', 'on', 'yes'].includes(
    (process.env.HUNTER_DISCOVERY_ENABLE_PAGE_AXIS ?? '0').trim().toLowerCase(),
  );
  const useExperimentDepth =
    experimentOn &&
    enablePageAxis &&
    experimentVariant !== 'baseline_sticky' &&
    experimentVariant !== '';
  const experimentOffsets: number[] = (() => {
    if (!useExperimentDepth) return [0];
    const maxPages = Math.min(
      5,
      Math.max(1, Number.parseInt(process.env.HUNTER_DISCOVERY_EXPERIMENT_MAX_PAGES ?? '2', 10) || 2),
    );
    const pages: number[] = [];
    for (let p = 0; p < maxPages; p += 1) pages.push(p * limit);
    return pages;
  })();
  let experiment403 = 0;
  let experimentCalls = 0;

  // Primary discovery (post-2025):
  // - kind=q  → official /products/search (sites/.../search genérico → 403 forever)
  // - kind=cat → highlights(category) (mismo canal sellable que el fallback histórico)
  // Listings se resuelven con /products/{id}/items — /items?ids= también 403.
  for (const src of plan) {
    if (idOrder.length + highlightRows.length >= maxIds) break;

    if (src.kind === 'cat') {
      await sleep(ML_FETCH_DELAY_MS);
      const remaining = maxIds - (idOrder.length + highlightRows.length);
      const listings = await collectListingsFromHighlights({
        categoryId: src.value,
        attribution: `cat:${src.value}`,
        budget: Math.min(remaining, Math.max(6, Math.floor(config.mlMaxCollect / 2))),
        seenId,
        onSkip: (entry) => pushSkip(skippedCandidates, skipReasonCounts, entry),
      });
      const hlSrc: SearchCall = {
        kind: 'hl',
        value: `${src.value}|cat:${src.value}`,
        sort: 'highlights',
        page: src.page ?? 1,
        axis: src.axis ?? 'exploit',
      };
      pushHighlightRows(highlightRows, idToSearch, listings, hlSrc, skipReasonCounts, skippedCandidates);
      if (listings.length === 0) {
        bumpReason(skipReasonCounts, `ml discovery: highlights vacíos ${src.value}`);
      }
      continue;
    }

    const offsets = useExperimentDepth ? experimentOffsets : [0];
    for (const offset of offsets) {
      if (idOrder.length + highlightRows.length >= maxIds) break;
      const pageNum = useExperimentDepth ? Math.floor(offset / Math.max(limit, 1)) + 1 : (src.page ?? 1);
      const pageSrc: SearchCall = {
        ...src,
        page: pageNum,
        axis: src.axis ?? 'exploit',
      };
      const offsetQs = useExperimentDepth ? `&offset=${offset}` : '';
      // Official catalog search — replaces deprecated /sites/{SITE}/search?q=
      const path = `/products/search?status=active&site_id=${ML_SITE}&q=${encodeURIComponent(src.value)}&limit=${limit}${offsetQs}`;

      await sleep(ML_FETCH_DELAY_MS);
      if (useExperimentDepth) experimentCalls += 1;
      const api = await fetchMlApi(path);
      if (!api.ok) {
        bumpReason(skipReasonCounts, `ml discovery: search HTTP ${api.status}`);
        if (api.status === 403) {
          searchForbidden += 1;
          if (useExperimentDepth) experiment403 += 1;
        }
        continue;
      }

      const json = api.data as ProductsSearchResponse;
      const productIds = (json.results ?? [])
        .map((hit) => (hit.id || hit.catalog_product_id || '').trim())
        .filter(Boolean);
      if (productIds.length === 0) {
        bumpReason(skipReasonCounts, 'ml discovery: products_search vacío');
        if (!useExperimentDepth) break;
        continue;
      }

      const remaining = maxIds - (idOrder.length + highlightRows.length);
      let listings = await collectListingsFromProductIds({
        productIds,
        attribution: `q:${src.value}`,
        budget: Math.min(remaining, Math.max(6, Math.floor(config.mlMaxCollect / 2))),
        seenId,
        onSkip: (entry) => pushSkip(skippedCandidates, skipReasonCounts, entry),
      });

      // Catalog search often returns products without /items. Secondary: map query →
      // category highlights (official) so q-seeds still yield sellable listings.
      const withOriginal = listings.filter((l) => l.originalPrice != null).length;
      if (withOriginal === 0) {
        bumpReason(skipReasonCounts, `ml discovery: products_search sin listings ${src.value}`);
        await sleep(ML_FETCH_DELAY_MS);
        const cat = await resolveCategoryFromQuery(src.value);
        if (cat) {
          listings = await collectListingsFromHighlights({
            categoryId: cat,
            attribution: `q:${src.value}`,
            budget: Math.min(
              maxIds - (idOrder.length + highlightRows.length),
              Math.max(6, Math.floor(config.mlMaxCollect / 2)),
            ),
            seenId,
            onSkip: (entry) => pushSkip(skippedCandidates, skipReasonCounts, entry),
          });
          if (listings.length === 0) {
            bumpReason(skipReasonCounts, `ml discovery: highlights vacíos ${cat}`);
          }
        } else {
          bumpReason(skipReasonCounts, 'ml discovery: domain_discovery sin categoría');
        }
      }

      // Keep kind=q so telemetry reflects query search (not global highlights_fallback).
      pushHighlightRows(highlightRows, idToSearch, listings, pageSrc, skipReasonCounts, skippedCandidates);
      // Baseline: only one page per search source.
      if (!useExperimentDepth) break;
    }
  }

  if (useExperimentDepth && experimentCalls > 0) {
    const abort403Rate = Math.min(
      1,
      Math.max(
        0.1,
        Number.parseFloat(process.env.HUNTER_DISCOVERY_EXPERIMENT_ABORT_403_RATE ?? '0.5') || 0.5,
      ),
    );
    if (experiment403 / experimentCalls >= abort403Rate) {
      bumpReason(skipReasonCounts, 'ml discovery: experiment_403_abort');
    }
  }

  // Fallback only if primary yielded nothing (should be rare with products/search + highlights cats).
  if (idOrder.length === 0 && highlightRows.length === 0) {
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
        onSkip: (entry) => pushSkip(skippedCandidates, skipReasonCounts, entry),
      });
      const src: SearchCall = { kind: 'hl', value: `${categoryId}|${label}`, sort: 'highlights' };
      pushHighlightRows(highlightRows, idToSearch, listings, src, skipReasonCounts, skippedCandidates);
      if (listings.length === 0) {
        bumpReason(skipReasonCounts, `ml discovery: highlights vacíos ${categoryId}`);
      }
    }
  }

  // Silence unused when searchForbidden never increments under healthy products/search.
  if (searchForbidden > 0) {
    bumpReason(skipReasonCounts, `ml discovery: products_search_forbidden_count ${searchForbidden}`);
  }

  if (idOrder.length === 0 && highlightRows.length === 0) {
    bumpReason(skipReasonCounts, 'ml discovery: sin resultados de búsqueda');
    return { items: [], collectedCount: 0, skipReasonCounts, skippedCandidates };
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
      pushSkip(skippedCandidates, skipReasonCounts, {
        url: mlItemUrl(id),
        itemId: id,
        reason: 'ml discovery: detalle de item no disponible',
      });
      continue;
    }
    const parse = itemToMetaDetailed(body);
    const meta = parse.meta;
    if (!meta) {
      pushSkip(skippedCandidates, skipReasonCounts, {
        url: mlItemUrl(id, typeof body.permalink === 'string' ? body.permalink : null),
        title: typeof body.title === 'string' ? body.title : null,
        itemId: id,
        reason: parse.reason ?? 'ml discovery: sin metadatos',
      });
      continue;
    }
    if (isLowQualityTitle(meta.title, config)) {
      pushSkip(skippedCandidates, skipReasonCounts, {
        url: meta.canonicalUrl || mlItemUrl(id),
        title: meta.title,
        itemId: id,
        reason: 'ml discovery: título de baja calidad',
      });
      continue;
    }

    const signals = mlItemBodyToSignals(body);
    candidates.push({ id, meta, signals });
  }

  for (const row of highlightRows) {
    if (isLowQualityTitle(row.meta.title, config)) {
      pushSkip(skippedCandidates, skipReasonCounts, {
        url: row.meta.canonicalUrl || mlItemUrl(row.id),
        title: row.meta.title,
        itemId: row.id,
        reason: 'ml discovery: título de baja calidad',
      });
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
    if (out.length >= config.mlMaxCollect) {
      pushSkip(skippedCandidates, skipReasonCounts, {
        url: row.meta.canonicalUrl || mlItemUrl(row.id),
        title: row.meta.title,
        itemId: row.id,
        reason: 'ml discovery: candidate_pool_truncated',
      });
      continue;
    }
    const rating = ratingMap.get(row.id);
    const signals = mergeSignals(row.signals, rating);
    const cond = (signals.condition ?? '').toLowerCase();
    if (
      row.meta.discountPercent == null ||
      row.meta.discountPercent < config.minDiscountPercent
    ) {
      pushSkip(skippedCandidates, skipReasonCounts, {
        url: row.meta.canonicalUrl || mlItemUrl(row.id),
        title: row.meta.title,
        itemId: row.id,
        reason:
          row.meta.discountPercent == null
            ? 'ml discovery: descuento desconocido (sin evidencia calculable)'
            : `ml discovery: descuento ${row.meta.discountPercent}% < mínimo ${config.minDiscountPercent}%`,
      });
      continue;
    }
    if (row.meta.originalPrice == null || row.meta.originalPrice <= row.meta.discountPrice) {
      pushSkip(skippedCandidates, skipReasonCounts, {
        url: row.meta.canonicalUrl || mlItemUrl(row.id),
        title: row.meta.title,
        itemId: row.id,
        reason: 'ml discovery: sin precio original verificable',
      });
      continue;
    }
    if (cond && cond !== 'new') {
      pushSkip(skippedCandidates, skipReasonCounts, {
        url: row.meta.canonicalUrl || mlItemUrl(row.id),
        title: row.meta.title,
        itemId: row.id,
        reason: 'ml discovery: condición no es nueva',
      });
      continue;
    }
    if (typeof signals.soldQuantity === 'number' && signals.soldQuantity < config.minSoldQuantityMl) {
      pushSkip(skippedCandidates, skipReasonCounts, {
        url: row.meta.canonicalUrl || mlItemUrl(row.id),
        title: row.meta.title,
        itemId: row.id,
        reason: `ml discovery: vendidos ${signals.soldQuantity} < mínimo ${config.minSoldQuantityMl}`,
      });
      continue;
    }
    if (rating && rating.total >= config.minRatingReviewsCount && rating.average < config.minRatingAverage) {
      pushSkip(skippedCandidates, skipReasonCounts, {
        url: row.meta.canonicalUrl || mlItemUrl(row.id),
        title: row.meta.title,
        itemId: row.id,
        reason: `ml discovery: rating ${rating.average} < mínimo ${config.minRatingAverage}`,
      });
      continue;
    }
    if (!passesMlHardFilters(row.meta, signals, rating, config)) {
      pushSkip(skippedCandidates, skipReasonCounts, {
        url: row.meta.canonicalUrl || mlItemUrl(row.id),
        title: row.meta.title,
        itemId: row.id,
        reason: 'ml discovery: descartado por filtros duros',
      });
      continue;
    }

    const key = canonicalKey(row.meta.canonicalUrl);
    if (seenKeys.has(key)) {
      pushSkip(skippedCandidates, skipReasonCounts, {
        url: row.meta.canonicalUrl || mlItemUrl(row.id),
        title: row.meta.title,
        itemId: row.id,
        reason: 'ml discovery: duplicado por URL canónica',
      });
      continue;
    }
    seenKeys.add(key);

    const search = idToSearch.get(row.id);
    const page = search?.page ?? 1;
    const axis = search?.axis ?? 'exploit';
    const sourceDetail = search
      ? formatMlSourceDetail({
          kind: search.kind,
          value: search.value,
          sort: search.sort,
          page,
          axis,
        })
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

  return {
    items: out,
    collectedCount: idOrder.length + highlightRows.length,
    skipReasonCounts,
    skippedCandidates,
  };
}
