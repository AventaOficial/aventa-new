import type { SurfaceComplianceStatus, SurfaceKind } from '@/lib/hunter/dayToDay/surfaces';
import type { DealQualificationReasonCode } from '@/lib/hunter/dealQualification/types';

export type RetailerDiscoveryId =
  | 'chedraui_mx'
  | 'bodega_aurrera_mx'
  | 'walmart_mx'
  | 'home_depot_mx'
  | 'liverpool_mx'
  | 'soriana_mx';

export type RetailerDiscoveryStatus = SurfaceComplianceStatus;

export type DiscoveryMethodKind = 'item_list' | 'sitemap' | 'seed_pdp' | 'public_page';

export type AntiBotRisk = 'none' | 'low' | 'medium' | 'high';

export type ExpectedYield = 'none' | 'low' | 'medium' | 'unknown';

export type RetailerSurfaceSpec = {
  id: string;
  url: string;
  kind: SurfaceKind;
  status: RetailerDiscoveryStatus;
  notes: string;
  locPattern?: string;
  maxPages?: number;
};

export type RetailerDiscoveryProfile = {
  retailer: RetailerDiscoveryId;
  displayName: string;
  country: 'MX';
  origin: string;
  robotsUrl: string;
  publicSurfaces: RetailerSurfaceSpec[];
  robotsStatus: 'allow_limited' | 'allow_broad' | 'restrictive' | 'unknown';
  termsStatus: 'ok' | 'review' | 'blocked';
  discoveryMethods: DiscoveryMethodKind[];
  promotionSurfaces: string[];
  productSurfaces: string[];
  evidenceTypes: Array<'current_price' | 'original_price' | 'explicit_discount' | 'promotion' | 'none'>;
  antiBotRisk: AntiBotRisk;
  expectedYield: ExpectedYield;
  complianceStatus: RetailerDiscoveryStatus;
  implementationStatus: RetailerDiscoveryStatus;
  recommendation: string;
  complexity: 'low' | 'medium' | 'high';
  expectedSupplyFrequency: 'none' | 'low' | 'unknown';
};

export type SurfaceCandidateSample = {
  title: string | null;
  url: string;
  price: number | null;
  originalPrice: number | null;
  qualification: string;
  reasons: DealQualificationReasonCode[] | string[];
  imageOk: boolean;
  promotionType: string | null;
  discount: number | null;
  currentPriceProvenance: string | null;
  originalPriceProvenance: string | null;
  productId?: string | null;
  brand?: string | null;
  availability?: string | null;
  selectionReason?: 'promo_slug' | 'document_order' | null;
  requestedUrl?: string | null;
};

export type SurfaceDiscoveryResult = {
  retailer: RetailerDiscoveryId;
  surfaceId: string;
  url: string;
  robotsAllowed: boolean;
  httpStatus: number | null;
  timedOut: boolean;
  challenged: boolean;
  requests: number;
  errors: number;
  latencyMs: number;
  candidateCount: number;
  offerEvidenceCount: number;
  verifiedDeals: number;
  promotionCount: number;
  potentialCount: number;
  catalogOnlyCount: number;
  invalidEvidenceCount: number;
  evidenceYield: number;
  suggestedStatus: RetailerDiscoveryStatus;
  declaredStatus: RetailerDiscoveryStatus;
  persisted: false;
  errorCode: string | null;
  samples: SurfaceCandidateSample[];
};

export type RetailerDiscoveryRun = {
  retailer: RetailerDiscoveryId;
  robotsFetched: boolean;
  crawlDelaySeconds: number | null;
  requests: number;
  surfaces: SurfaceDiscoveryResult[];
  candidateCount: number;
  offerEvidenceCount: number;
  verifiedDeals: number;
  promotionCount: number;
  potentialCount: number;
  catalogOnlyCount: number;
  invalidEvidenceCount: number;
  evidenceYield: number;
  errors: number;
  latencyMs: number;
  antiBot: boolean;
  persisted: false;
};

export type RetailerDiscoveryMatrixRow = {
  retailer: RetailerDiscoveryId;
  displayName: string;
  status: RetailerDiscoveryStatus;
  implementationStatus: RetailerDiscoveryStatus;
  surfacesTested: number;
  candidates: number;
  evidenceYield: number;
  verifiedDeals: number;
  promotions: number;
  catalogOnly: number;
  potential: number;
  errors: number;
  antiBotRisk: AntiBotRisk;
  recommendation: string;
};

export type DiscoveryBudget = {
  maxRequests: number;
  maxPages: number;
  maxCandidates: number;
  maxConcurrency: 1;
  timeoutMs: number;
  crawlDelayMs: number;
  maxPilotCandidates: number;
  maxSitemaps: number;
};

export type DiscoveryChannelVerdict =
  | 'READY'
  | 'PROMISING'
  | 'DEGRADED'
  | 'CATALOG_ONLY'
  | 'NO_SUSTAINABLE_DISCOVERY_CHANNEL'
  | 'BLOCKED_PENDING_POLICY_REVIEW';

export type SitemapChannelReport = {
  retailer: RetailerDiscoveryId;
  robotsAllowed: boolean;
  crawlDelaySeconds: number | null;
  sitemapIndexUrl: string | null;
  sitemapsFound: string[];
  sitemapsInspected: string[];
  productLocsSeen: number;
  promoSlugHits: number;
  promoSlugSamples: string[];
  pdpInspected: number;
  requests: number;
  verifiedDeals: number;
  promotions: number;
  potentialDeals: number;
  catalogOnly: number;
  errors: number;
  evidenceYield: number;
  productBindingSuccess: number;
  latencyMs: number;
  discoveryMethod: 'sitemap_index_pdp' | 'none';
  verdict: DiscoveryChannelVerdict;
  persisted: false;
  samples: SurfaceCandidateSample[];
};
