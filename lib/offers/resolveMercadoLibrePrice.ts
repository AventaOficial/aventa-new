/**
 * Resolución oficial de precio Mercado Libre.
 * Una sola fuente de verdad — no scrapear HTML como primario.
 */
import { fetchMlApi, type FetchMlApiResult } from '@/lib/integrations/mercadolibre/apiClient';
import { recordMlPriceQuality } from '@/lib/hunter/mlQuality/metrics';

export type MercadoLibrePriceSource =
  | 'items_prices'
  | 'items_sale_price'
  | 'products_items'
  | 'none';

export type MercadoLibrePriceStatus =
  | 'resolved'
  | 'unavailable'
  | 'unauthorized'
  | 'not_found'
  | 'error';

export type MercadoLibrePriceResolution = {
  status: MercadoLibrePriceStatus;
  price: number | null;
  originalPrice: number | null;
  regularPrice: number | null;
  promotionPrice: number | null;
  currency: string | null;
  source: MercadoLibrePriceSource;
  confidence: 'high' | 'medium' | 'low';
  resolvedBy: MercadoLibrePriceSource | null;
  httpStatus: number | null;
};

export type ResolveMercadoLibrePriceInput = {
  itemId: string;
  siteId?: string | null;
  catalogProductId?: string | null;
  /** Skip in-memory cache (tests). */
  bypassCache?: boolean;
};

type CacheEntry = {
  at: number;
  value: MercadoLibrePriceResolution;
};

const CACHE_TTL_MS = 60_000;
const priceCache = new Map<string, CacheEntry>();

function finitePositive(n: unknown): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

function normalizeId(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  return raw.replace(/-/g, '').toUpperCase();
}

function cacheKey(input: ResolveMercadoLibrePriceInput): string {
  return `${normalizeId(input.itemId)}:${normalizeId(input.catalogProductId) ?? ''}`;
}

function emptyResolution(
  status: MercadoLibrePriceStatus,
  extras?: Partial<MercadoLibrePriceResolution>,
): MercadoLibrePriceResolution {
  return {
    status,
    price: null,
    originalPrice: null,
    regularPrice: null,
    promotionPrice: null,
    currency: null,
    source: 'none',
    confidence: 'low',
    resolvedBy: null,
    httpStatus: null,
    ...extras,
  };
}

type PricesBody = {
  prices?: Array<{ type?: string; amount?: number; regular_amount?: number | null }>;
  currency_id?: string;
};

type SalePriceBody = {
  amount?: number;
  regular_amount?: number | null;
  currency_id?: string;
  price?: number;
};

type ProductItemsBody = {
  results?: Array<Record<string, unknown>>;
};

function parsePricesBody(data: PricesBody): Omit<MercadoLibrePriceResolution, 'status' | 'httpStatus'> | null {
  const rows = data.prices ?? [];
  const promo = rows.find((p) => (p.type ?? '').toLowerCase() === 'promotion');
  const standard = rows.find((p) => (p.type ?? '').toLowerCase() === 'standard');
  const promotionPrice = finitePositive(promo?.amount);
  const regularPrice = finitePositive(standard?.amount) ?? finitePositive(promo?.regular_amount);
  const price = promotionPrice ?? regularPrice;
  if (price == null) return null;
  const originalPrice =
    finitePositive(promo?.regular_amount) ??
    (regularPrice != null && regularPrice > price ? regularPrice : null);
  return {
    price,
    originalPrice,
    regularPrice,
    promotionPrice,
    currency: typeof data.currency_id === 'string' ? data.currency_id : null,
    source: 'items_prices',
    confidence: 'high',
    resolvedBy: 'items_prices',
  };
}

function parseSalePriceBody(
  data: SalePriceBody,
): Omit<MercadoLibrePriceResolution, 'status' | 'httpStatus'> | null {
  const price = finitePositive(data.amount) ?? finitePositive(data.price);
  if (price == null) return null;
  const regularPrice = finitePositive(data.regular_amount);
  const originalPrice = regularPrice != null && regularPrice > price ? regularPrice : null;
  return {
    price,
    originalPrice,
    regularPrice,
    promotionPrice: originalPrice != null ? price : null,
    currency: typeof data.currency_id === 'string' ? data.currency_id : null,
    source: 'items_sale_price',
    confidence: 'high',
    resolvedBy: 'items_sale_price',
  };
}

/** Exact match only — never first-of-list. */
export function pickExactCatalogItem(
  results: Array<Record<string, unknown>> | undefined,
  itemId: string,
): Record<string, unknown> | null {
  const wanted = normalizeId(itemId);
  if (!wanted || !results?.length) return null;
  for (const row of results) {
    const id = normalizeId(
      typeof row.id === 'string'
        ? row.id
        : typeof row.item_id === 'string'
          ? row.item_id
          : null,
    );
    if (id === wanted) return row;
  }
  return null;
}

function parseCatalogItemRow(
  row: Record<string, unknown>,
): Omit<MercadoLibrePriceResolution, 'status' | 'httpStatus'> | null {
  const price = finitePositive(row.price);
  if (price == null) return null;
  const originalPrice = finitePositive(row.original_price);
  const currency = typeof row.currency_id === 'string' ? row.currency_id : null;
  return {
    price,
    originalPrice: originalPrice != null && originalPrice > price ? originalPrice : null,
    regularPrice: originalPrice != null && originalPrice > price ? originalPrice : null,
    promotionPrice: originalPrice != null && originalPrice > price ? price : null,
    currency,
    source: 'products_items',
    confidence: 'high',
    resolvedBy: 'products_items',
  };
}

function recordHttpFailure(result: FetchMlApiResult, usedFallback: boolean) {
  if (result.ok) return;
  if (result.timedOut) {
    recordMlPriceQuality({ request: true, timeout: true, fallback: usedFallback });
    return;
  }
  if (result.status === 401) {
    recordMlPriceQuality({ request: true, status401: true, fallback: usedFallback });
    return;
  }
  if (result.status === 403) {
    recordMlPriceQuality({ request: true, status403: true, fallback: usedFallback });
    return;
  }
  if (result.status === 404) {
    recordMlPriceQuality({ request: true, status404: true, fallback: usedFallback });
    return;
  }
  if (result.status === 429) {
    recordMlPriceQuality({ request: true, status429: true, fallback: usedFallback });
    return;
  }
  recordMlPriceQuality({ request: true, fallback: usedFallback });
}

/**
 * Prioridad:
 * 1) /items/{id}/prices
 * 2) /items/{id}/sale_price
 * 3) /products/{catalog}/items → exact item_id match
 */
export async function resolveMercadoLibrePrice(
  input: ResolveMercadoLibrePriceInput,
): Promise<MercadoLibrePriceResolution> {
  const itemId = normalizeId(input.itemId);
  if (!itemId) {
    return emptyResolution('unavailable');
  }
  const catalogProductId = normalizeId(input.catalogProductId);

  const key = cacheKey({ itemId, catalogProductId });
  if (!input.bypassCache) {
    const hit = priceCache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      recordMlPriceQuality({ cacheHit: true });
      return hit.value;
    }
  }

  recordMlPriceQuality({ request: true });

  // 1) Official prices API
  const pricesRes = await fetchMlApi(`/items/${encodeURIComponent(itemId)}/prices`);
  if (pricesRes.ok) {
    const parsed = parsePricesBody(pricesRes.data as PricesBody);
    if (parsed) {
      const value: MercadoLibrePriceResolution = {
        status: 'resolved',
        httpStatus: pricesRes.status,
        ...parsed,
      };
      recordMlPriceQuality({ resolved: true, source: 'items_prices' });
      priceCache.set(key, { at: Date.now(), value });
      return value;
    }
  } else {
    recordHttpFailure(pricesRes, false);
  }

  // 2) sale_price
  const saleRes = await fetchMlApi(`/items/${encodeURIComponent(itemId)}/sale_price`);
  if (saleRes.ok) {
    const parsed = parseSalePriceBody(saleRes.data as SalePriceBody);
    if (parsed) {
      const value: MercadoLibrePriceResolution = {
        status: 'resolved',
        httpStatus: saleRes.status,
        ...parsed,
      };
      recordMlPriceQuality({ resolved: true, source: 'items_sale_price', fallback: true });
      priceCache.set(key, { at: Date.now(), value });
      return value;
    }
  } else {
    recordHttpFailure(saleRes, true);
  }

  // 3) Catalog product items — exact match only
  if (catalogProductId) {
    const catalogRes = await fetchMlApi(
      `/products/${encodeURIComponent(catalogProductId)}/items`,
    );
    if (catalogRes.ok) {
      const body = catalogRes.data as ProductItemsBody;
      const row = pickExactCatalogItem(body.results, itemId);
      if (!row) {
        const value = emptyResolution('unavailable', {
          httpStatus: catalogRes.status,
          source: 'products_items',
          resolvedBy: null,
        });
        recordMlPriceQuality({ unavailable: true, fallback: true, source: 'products_items' });
        priceCache.set(key, { at: Date.now(), value });
        return value;
      }
      const parsed = parseCatalogItemRow(row);
      if (parsed) {
        const value: MercadoLibrePriceResolution = {
          status: 'resolved',
          httpStatus: catalogRes.status,
          ...parsed,
        };
        recordMlPriceQuality({ resolved: true, source: 'products_items', fallback: true });
        priceCache.set(key, { at: Date.now(), value });
        return value;
      }
    } else {
      recordHttpFailure(catalogRes, true);
    }
  }

  const lastStatus =
    !pricesRes.ok && (pricesRes.status === 401 || pricesRes.status === 403)
      ? 'unauthorized'
      : 'unavailable';
  const value = emptyResolution(lastStatus, {
    httpStatus: !pricesRes.ok ? pricesRes.status : null,
  });
  recordMlPriceQuality({ unavailable: true });
  priceCache.set(key, { at: Date.now(), value });
  return value;
}

export function clearMercadoLibrePriceCache() {
  priceCache.clear();
}

export function getMercadoLibrePriceCacheSizeForTests() {
  return priceCache.size;
}
