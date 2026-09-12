export { classifyOfferMonetization } from './monetization';
export type { OfferMonetizationStatus } from './monetization';
export {
  DAY_TO_DAY_ENV,
  DAY_TO_DAY_RATE_POLICY,
  DAY_TO_DAY_PILOT_RATE_POLICY,
  isDayToDayFlagOn,
  isDayToDayPilotMode,
  isDayToDayFixturesMode,
  dayToDayRatePolicyForRun,
} from './config';
export {
  DAY_TO_DAY_SOURCES,
  DAY_TO_DAY_SOURCE_IDS,
  configurationStateFor,
  getDayToDaySource,
  isDayToDaySourceId,
} from './registry';
export { summarizeDayToDaySupply } from './metrics';
export type { DayToDaySupplySnapshot } from './metrics';
export { createUnconfiguredRetailerSource } from './unconfiguredRetailer';
export { createRetailerSource } from './createRetailerSource';
export { DAY_TO_DAY_CAPABILITY_MATRIX, capabilityFor } from './capabilityMatrix';
export type { DayToDayCapabilityRow, DayToDayComplianceStatus } from './capabilityMatrix';
export { parseJsonLdProducts, detectBotChallenge } from './parsePublicProductHtml';
export { parseRobotsTxt, isPathAllowedByRobots, isUrlAllowedByRobots } from './robots';
export {
  CHEDRAUI_DISCOVERY_SURFACES,
  CHEDRAUI_OBSERVED_SURFACES,
  listingPageUrl,
  locMatchesPromoSlug,
  PROMO_SLUG_PATTERN,
  surfacesForSource,
  surfaceIdFromSourceDetail,
} from './surfaces';
export type { DiscoverySurface, SurfaceComplianceStatus, SurfaceKind } from './surfaces';
export {
  getSurfaceDiscoveryMetrics,
  resetSurfaceDiscoveryMetrics,
} from './surfaceMetrics';
export type { SurfaceDiscoveryRow } from './surfaceMetrics';
export { fetchPublicText, extractSitemapLocs, looksLikeProductUrl } from './fetchPublic';
