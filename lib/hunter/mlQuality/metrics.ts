/**
 * Métricas de calidad Mercado Libre (universo separado de shadow/autonomous).
 * Persistencia: memoria del proceso (mismo patrón que enrichment).
 */

export type MlPriceSourceKey = 'items_prices' | 'items_sale_price' | 'products_items';

export type MlQualityMetricsSnapshot = {
  urlsReceived: number;
  urlsResolved: number;
  apiSuccess: number;
  api401: number;
  api403: number;
  apiTimeout: number;
  htmlFallback: number;
  imagesApi: number;
  imagesFallback: number;
  imagesRejected: number;
  imageCountSum: number;
  imageCountSamples: number;
  affiliateReady: number;
  affiliateMissing: number;
  mlPriceRequests: number;
  mlPriceResolved: number;
  mlPriceUnavailable: number;
  mlPrice401: number;
  mlPrice403: number;
  mlPrice404: number;
  mlPrice429: number;
  mlPriceTimeout: number;
  mlPriceFallback: number;
  mlPriceCacheHits: number;
  mlPriceSourceBreakdown: Record<MlPriceSourceKey, number>;
  apiHealth: 'healthy' | 'degraded' | 'down';
  imageQualityPct: number;
  averageValidImages: number;
  affiliateReadinessPct: number;
  urlResolutionPct: number;
  priceResolutionPct: number;
  persistence: 'process_memory';
};

const totals = {
  urlsReceived: 0,
  urlsResolved: 0,
  apiSuccess: 0,
  api401: 0,
  api403: 0,
  apiTimeout: 0,
  htmlFallback: 0,
  imagesApi: 0,
  imagesFallback: 0,
  imagesRejected: 0,
  imageCountSum: 0,
  imageCountSamples: 0,
  affiliateReady: 0,
  affiliateMissing: 0,
  mlPriceRequests: 0,
  mlPriceResolved: 0,
  mlPriceUnavailable: 0,
  mlPrice401: 0,
  mlPrice403: 0,
  mlPrice404: 0,
  mlPrice429: 0,
  mlPriceTimeout: 0,
  mlPriceFallback: 0,
  mlPriceCacheHits: 0,
  mlPriceSourceBreakdown: {
    items_prices: 0,
    items_sale_price: 0,
    products_items: 0,
  } as Record<MlPriceSourceKey, number>,
};

export type RecordMlQualityEvent = {
  urlReceived?: boolean;
  resolved?: boolean;
  apiStatus?: 'success' | '401' | '403' | 'timeout' | 'other';
  usedHtmlFallback?: boolean;
  imagesFromApi?: number;
  imagesFromFallback?: number;
  imagesRejected?: number;
  affiliateReady?: boolean;
};

export type RecordMlPriceQualityEvent = {
  request?: boolean;
  resolved?: boolean;
  unavailable?: boolean;
  status401?: boolean;
  status403?: boolean;
  status404?: boolean;
  status429?: boolean;
  timeout?: boolean;
  fallback?: boolean;
  cacheHit?: boolean;
  source?: MlPriceSourceKey;
};

export function recordMlQuality(event: RecordMlQualityEvent) {
  if (event.urlReceived) totals.urlsReceived += 1;
  if (event.resolved) totals.urlsResolved += 1;
  if (event.apiStatus === 'success') totals.apiSuccess += 1;
  if (event.apiStatus === '401') totals.api401 += 1;
  if (event.apiStatus === '403') totals.api403 += 1;
  if (event.apiStatus === 'timeout') totals.apiTimeout += 1;
  if (event.usedHtmlFallback) totals.htmlFallback += 1;
  if (event.imagesFromApi != null) totals.imagesApi += event.imagesFromApi;
  if (event.imagesFromFallback != null) totals.imagesFallback += event.imagesFromFallback;
  if (event.imagesRejected != null) totals.imagesRejected += event.imagesRejected;
  if (event.imagesFromApi != null || event.imagesFromFallback != null) {
    const count = (event.imagesFromApi ?? 0) + (event.imagesFromFallback ?? 0);
    totals.imageCountSum += count;
    totals.imageCountSamples += 1;
  }
  if (event.affiliateReady === true) totals.affiliateReady += 1;
  if (event.affiliateReady === false) totals.affiliateMissing += 1;
}

export function recordMlPriceQuality(event: RecordMlPriceQualityEvent) {
  if (event.request) totals.mlPriceRequests += 1;
  if (event.resolved) totals.mlPriceResolved += 1;
  if (event.unavailable) totals.mlPriceUnavailable += 1;
  if (event.status401) totals.mlPrice401 += 1;
  if (event.status403) totals.mlPrice403 += 1;
  if (event.status404) totals.mlPrice404 += 1;
  if (event.status429) totals.mlPrice429 += 1;
  if (event.timeout) totals.mlPriceTimeout += 1;
  if (event.fallback) totals.mlPriceFallback += 1;
  if (event.cacheHit) totals.mlPriceCacheHits += 1;
  if (event.source) totals.mlPriceSourceBreakdown[event.source] += 1;
}

function pct(num: number, den: number): number {
  if (den <= 0) return 0;
  return Math.round((num / den) * 1000) / 10;
}

function classifyApiHealth(): MlQualityMetricsSnapshot['apiHealth'] {
  const failures = totals.api401 + totals.api403 + totals.apiTimeout;
  const attempts = totals.apiSuccess + failures;
  if (attempts === 0) return 'healthy';
  const failPct = failures / attempts;
  if (failPct >= 0.5) return 'down';
  if (failPct >= 0.15) return 'degraded';
  return 'healthy';
}

export function getMlQualityMetrics(): MlQualityMetricsSnapshot {
  const avgImages =
    totals.imageCountSamples > 0
      ? Math.round((totals.imageCountSum / totals.imageCountSamples) * 10) / 10
      : 0;
  const affiliateTotal = totals.affiliateReady + totals.affiliateMissing;
  const priceAttempts = totals.mlPriceResolved + totals.mlPriceUnavailable;
  return {
    ...totals,
    mlPriceSourceBreakdown: { ...totals.mlPriceSourceBreakdown },
    apiHealth: classifyApiHealth(),
    imageQualityPct: pct(totals.imagesApi, totals.imagesApi + totals.imagesFallback + totals.imagesRejected),
    averageValidImages: avgImages,
    affiliateReadinessPct: pct(totals.affiliateReady, affiliateTotal),
    urlResolutionPct: pct(totals.urlsResolved, totals.urlsReceived),
    priceResolutionPct: pct(totals.mlPriceResolved, priceAttempts),
    persistence: 'process_memory',
  };
}

export function resetMlQualityMetrics() {
  totals.urlsReceived = 0;
  totals.urlsResolved = 0;
  totals.apiSuccess = 0;
  totals.api401 = 0;
  totals.api403 = 0;
  totals.apiTimeout = 0;
  totals.htmlFallback = 0;
  totals.imagesApi = 0;
  totals.imagesFallback = 0;
  totals.imagesRejected = 0;
  totals.imageCountSum = 0;
  totals.imageCountSamples = 0;
  totals.affiliateReady = 0;
  totals.affiliateMissing = 0;
  totals.mlPriceRequests = 0;
  totals.mlPriceResolved = 0;
  totals.mlPriceUnavailable = 0;
  totals.mlPrice401 = 0;
  totals.mlPrice403 = 0;
  totals.mlPrice404 = 0;
  totals.mlPrice429 = 0;
  totals.mlPriceTimeout = 0;
  totals.mlPriceFallback = 0;
  totals.mlPriceCacheHits = 0;
  totals.mlPriceSourceBreakdown = {
    items_prices: 0,
    items_sale_price: 0,
    products_items: 0,
  };
}
