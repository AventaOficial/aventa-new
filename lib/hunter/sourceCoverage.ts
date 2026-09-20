/**
 * Retailer / source coverage map for Hunter — documentation as code.
 * ACTIVE | DEGRADED | DISABLED | NOT_IMPLEMENTED
 */

export type HunterSourceCoverageStatus =
  | 'ACTIVE'
  | 'DEGRADED'
  | 'DISABLED'
  | 'NOT_IMPLEMENTED';

export type HunterSourceCoverageRow = {
  retailer: string;
  ingestSourceId: string | null;
  status: HunterSourceCoverageStatus;
  discoveryMethod: string;
  affiliateSupport: 'yes' | 'partial' | 'no' | 'unknown';
  couponSupport: 'yes' | 'partial' | 'no' | 'unknown';
  priceHistorySupport: 'yes' | 'partial' | 'no' | 'unknown';
  pathToEnable: string;
  knownLimitations: string;
};

export const HUNTER_SOURCE_COVERAGE: HunterSourceCoverageRow[] = [
  {
    retailer: 'Mercado Libre México',
    ingestSourceId: 'ml_worker',
    status: 'ACTIVE',
    discoveryMethod: 'Playwright GHA → externalWorker',
    affiliateSupport: 'yes',
    couponSupport: 'partial',
    priceHistorySupport: 'partial',
    pathToEnable: 'BOT_INGEST_EXTERNAL_WORKER + GHA workflow',
    knownLimitations: 'HTML antibot; shortlinks meli.la; catalog image fail-closed',
  },
  {
    retailer: 'Mercado Libre API legacy',
    ingestSourceId: 'ml_api',
    status: 'DEGRADED',
    discoveryMethod: 'Official search/highlights API',
    affiliateSupport: 'yes',
    couponSupport: 'no',
    priceHistorySupport: 'partial',
    pathToEnable: 'BOT_INGEST_DISCOVER_ML',
    knownLimitations: 'Rate limits; OAuth optional',
  },
  {
    retailer: 'Amazon México',
    ingestSourceId: 'amazon_asin',
    status: 'DEGRADED',
    discoveryMethod: 'ASIN list + HTML/PA-API',
    affiliateSupport: 'yes',
    couponSupport: 'partial',
    priceHistorySupport: 'yes',
    pathToEnable: 'BOT_INGEST amazon ASINs / PA-API keys',
    knownLimitations: 'HTML captcha; PA-API credentials required for reliable meta',
  },
  {
    retailer: 'Walmart México',
    ingestSourceId: 'walmart_mx',
    status: 'DISABLED',
    discoveryMethod: 'Day-to-Day sitemap/promo adapters',
    affiliateSupport: 'unknown',
    couponSupport: 'unknown',
    priceHistorySupport: 'no',
    pathToEnable: 'DAY_TO_DAY_WALMART_ENABLED + DISCOVERY',
    knownLimitations: 'Marked DEGRADED in day-to-day; legal/ToS review before scrape scale',
  },
  {
    retailer: 'Bodega Aurrera',
    ingestSourceId: 'bodega_aurrera_mx',
    status: 'DISABLED',
    discoveryMethod: 'Day-to-Day adapters',
    affiliateSupport: 'unknown',
    couponSupport: 'unknown',
    priceHistorySupport: 'no',
    pathToEnable: 'DAY_TO_DAY_BODEGA_ENABLED',
    knownLimitations: 'DEGRADED surface',
  },
  {
    retailer: 'Chedraui',
    ingestSourceId: 'chedraui_mx',
    status: 'DISABLED',
    discoveryMethod: 'Day-to-Day adapters (READY surface)',
    affiliateSupport: 'unknown',
    couponSupport: 'unknown',
    priceHistorySupport: 'no',
    pathToEnable: 'DAY_TO_DAY_CHEDRAUI_ENABLED',
    knownLimitations: 'Flag default OFF',
  },
  {
    retailer: 'Liverpool',
    ingestSourceId: null,
    status: 'NOT_IMPLEMENTED',
    discoveryMethod: '—',
    affiliateSupport: 'unknown',
    couponSupport: 'unknown',
    priceHistorySupport: 'no',
    pathToEnable: 'Prefer affiliate feed/API before scraping',
    knownLimitations: 'No adapter',
  },
  {
    retailer: 'Coppel',
    ingestSourceId: null,
    status: 'NOT_IMPLEMENTED',
    discoveryMethod: '—',
    affiliateSupport: 'unknown',
    couponSupport: 'unknown',
    priceHistorySupport: 'no',
    pathToEnable: 'Affiliate/feed first',
    knownLimitations: 'No adapter',
  },
  {
    retailer: 'Costco / Sam\'s / Office Depot / etc.',
    ingestSourceId: null,
    status: 'NOT_IMPLEMENTED',
    discoveryMethod: '—',
    affiliateSupport: 'unknown',
    couponSupport: 'unknown',
    priceHistorySupport: 'no',
    pathToEnable: 'Feeds/affiliate networks; avoid reckless scrapers',
    knownLimitations: 'No adapter',
  },
];
