import type { IngestItem, IngestSourceId } from '@/lib/bots/ingest/types';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';

/** IDs del Hunter Engine (pueden mapear a IngestSourceId al publicar). */
export type HunterSourceId =
  | 'ml_api_legacy'
  | 'ml_worker'
  | 'amazon_paapi'
  | 'amazon_asin'
  | 'env_urls'
  | 'walmart_mx'
  | 'bodega_aurrera_mx'
  | 'chedraui_mx';

/** Familia de supply. No mezcla salud de fuente con métricas shadow. */
export type HunterSourceFamily = 'core' | 'day_to_day';

export type HunterSourceCapabilities = {
  discovery: boolean;
  productLookup: boolean;
  images: boolean;
  price: boolean;
};

export type HunterDiscoveryMethod =
  | 'official_api'
  | 'rss'
  | 'sitemap'
  | 'public_page'
  | 'external_worker'
  | 'not_available';

/** Monetización de la FUENTE, no de una oferta concreta. */
export type HunterAffiliateAvailability = 'available' | 'unavailable' | 'unknown';

export type HunterSourceConfigState = 'configured' | 'not_configured' | 'disabled';

export type HunterSourceRatePolicy = {
  maxPages: number;
  maxItems: number;
  timeoutMs: number;
  concurrency: number;
  requestsPerCycle: number;
};

export type HunterHealthStatus = 'healthy' | 'degraded' | 'down' | 'disabled';
export type HunterBreakerState = 'closed' | 'open' | 'half_open';

export type HunterCandidate = {
  source: HunterSourceId;
  externalId: string | null;
  url: string;
  title: string | null;
  price: number | null;
  originalPrice: number | null;
  discount: number | null;
  store: string | null;
  category: string | null;
  image: string | null;
  coupon: string | null;
  shipping: { free?: boolean; cost?: number } | null;
  detectedAt: string;
  rawMetadata: Record<string, unknown>;
  fingerprint: string | null;
  /** Item listo para el pipeline de ingest existente. */
  ingestItem: IngestItem;
};

export type HunterCollectResult = {
  ok: boolean;
  candidates: HunterCandidate[];
  itemsFound: number;
  /** HTTP u otro código seguro (p. ej. "403", "timeout"). */
  errorCode?: string | null;
  errorMessageSafe?: string | null;
  skipReasonCounts?: Record<string, number>;
  collectedCount?: number;
};

export type HunterSourceHealth = {
  sourceId: HunterSourceId;
  enabled: boolean;
  status: HunterHealthStatus;
  breakerState: HunterBreakerState;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  consecutiveFailures: number;
  itemsFound: number;
  itemsInserted: number;
  duplicates: number;
  skipped: number;
  errors: number;
  latencyMs: number | null;
  lastErrorCode: string | null;
  lastErrorMessageSafe: string | null;
  updatedAt: string;
  cooldownUntil: string | null;
  expectedIntervalMs: number;
};

export type HunterCollectContext = {
  config: BotIngestConfig;
  rotationWave: number;
  now?: Date;
};

export type HunterSource = {
  id: HunterSourceId;
  /** Mapeo al source del pipeline de ingest. */
  ingestSourceId: IngestSourceId;
  displayName: string;
  priority: number;
  expectedIntervalMs: number;
  isEnabled: (ctx: HunterCollectContext) => boolean;
  /** Si false, no se intenta collect (p. ej. sin credenciales). */
  isAvailable: (ctx: HunterCollectContext) => boolean;
  /**
   * ¿Hay un método de discovery usable? Distinto de enabled.
   * Default: isAvailable. Day-to-Day lo declara en falso hasta tener API/feed.
   */
  isConfigured?: (ctx: HunterCollectContext) => boolean;
  /** true = collect lo hace un proceso externo (Playwright). */
  external?: boolean;
  family?: HunterSourceFamily;
  country?: string;
  capabilities?: HunterSourceCapabilities;
  discoveryMethod?: HunterDiscoveryMethod;
  affiliateStatus?: HunterAffiliateAvailability;
  ratePolicy?: HunterSourceRatePolicy;
  collect: (ctx: HunterCollectContext) => Promise<HunterCollectResult>;
};

export type HunterRunMetrics = {
  sourceId: HunterSourceId;
  ok: boolean;
  skippedByBreaker: boolean;
  skippedDisabled: boolean;
  latencyMs: number;
  itemsFound: number;
  itemsInserted: number;
  duplicates: number;
  skipped: number;
  errors: number;
  errorCode?: string | null;
  errorMessageSafe?: string | null;
};

export type HunterEngineCollectResult = {
  items: IngestItem[];
  candidates: HunterCandidate[];
  discoveryDiagnostics: Partial<
    Record<
      IngestSourceId,
      {
        collectedCount?: number;
        skipReasonCounts?: Record<string, number>;
      }
    >
  >;
  sourceRuns: HunterRunMetrics[];
  healthSnapshot: HunterSourceHealth[];
};
