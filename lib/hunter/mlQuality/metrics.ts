/**
 * Métricas de calidad Mercado Libre (universo separado de shadow/autonomous).
 * Persistencia: memoria del proceso (mismo patrón que enrichment).
 */

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
  apiHealth: 'healthy' | 'degraded' | 'down';
  imageQualityPct: number;
  averageValidImages: number;
  affiliateReadinessPct: number;
  urlResolutionPct: number;
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
  return {
    ...totals,
    apiHealth: classifyApiHealth(),
    imageQualityPct: pct(totals.imagesApi, totals.imagesApi + totals.imagesFallback + totals.imagesRejected),
    averageValidImages: avgImages,
    affiliateReadinessPct: pct(totals.affiliateReady, affiliateTotal),
    urlResolutionPct: pct(totals.urlsResolved, totals.urlsReceived),
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
}
