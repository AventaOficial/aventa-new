export type {
  AntiBotRisk,
  DiscoveryBudget,
  DiscoveryMethodKind,
  ExpectedYield,
  RetailerDiscoveryId,
  RetailerDiscoveryMatrixRow,
  RetailerDiscoveryProfile,
  RetailerDiscoveryRun,
  RetailerDiscoveryStatus,
  RetailerSurfaceSpec,
  SurfaceCandidateSample,
  SurfaceDiscoveryResult,
  SitemapChannelReport,
  DiscoveryChannelVerdict,
} from './types';
export { RETAILER_DISCOVERY_BUDGET, mergeDiscoveryBudget, crawlWaitMs } from './budgets';
export { evidenceYield, isOfferEvidence, suggestSurfaceStatus, classifyDiscoveryChannel } from './classify';
export {
  RETAILER_DISCOVERY_PROFILES,
  profileFor,
  profilesForInvestigation,
} from './profiles';
export { discoverRetailer, discoverRetailerSurface, loadRobotsForProfile } from './discoverSurface';
export type { DiscoverFetchFn, DiscoverSession, DiscoverSurfaceOptions } from './discoverSurface';
export { discoverSitemapChannel } from './discoverSitemapChannel';
export {
  classifySitemapUrl,
  selectChildSitemaps,
  selectProductUrls,
  sitemapFetchBudget,
  isSitemapIndexXml,
  isStrictPromoProductUrl,
} from './sitemapSelect';
export {
  recordRetailerSurfaceDiscovery,
  resetRetailerDiscoveryMetrics,
  summarizeRetailerDiscoveryMatrix,
} from './metrics';
export { rankRetailerRuns } from './rank';
