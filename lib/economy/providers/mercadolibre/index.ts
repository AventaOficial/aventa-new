/**
 * Mercado Libre Afiliados provider package.
 * Economic ingest: NOT_SUPPORTED_BY_OFFICIAL_API (fail-closed).
 */

export {
  MERCADOLIBRE_AFFILIATE_CAPABILITY_MATRIX,
  MERCADOLIBRE_ATTRIBUTION_WINDOW_HOURS,
  MERCADOLIBRE_AFFILIATE_ECONOMIC_INGEST_SUPPORTED,
  summarizeMercadoLibreAffiliateCapabilities,
  type CapabilitySupport,
  type MercadoLibreCapabilityRow,
} from './capabilityMatrix';
export {
  getMercadoLibreAffiliateConfig,
  type MercadoLibreAffiliateConfig,
  type MercadoLibreAffiliateMode,
} from './config';
export {
  createMercadoLibreAffiliateAdapter,
  MERCADOLIBRE_AFFILIATE_ADAPTER,
  getMercadoLibreAffiliateRuntimeNote,
  assertSellerOauthIsNotAffiliateAuthority,
} from './MercadoLibreAffiliateAdapter';
export { buildMercadoLibreAffiliateHealth, type MercadoLibreAffiliateHealth } from './health';
export {
  getMercadoLibreAffiliateMetrics,
  resetMercadoLibreAffiliateMetricsForTests,
  recordMercadoLibreAffiliateFailure,
  type MercadoLibreAffiliateMetrics,
} from './metrics';
export { MercadoLibreAffiliateError, ML_AFFILIATE_ERROR_CODES } from './errors';
