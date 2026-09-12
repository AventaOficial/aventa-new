import type { IngestItem, IngestSourceId } from '@/lib/bots/ingest/types';
import type { OfferMonetizationStatus } from '@/lib/hunter/dayToDay/monetization';
import type { DealQualification, DealQualificationReasonCode, PriceProvenance } from '@/lib/hunter/dealQualification/types';
import type { HunterCandidate, HunterHealthStatus, HunterSource, HunterSourceId } from '@/lib/hunter/types';
import type { AutonomousDecision } from '@/lib/autonomous/types';
import type { DealVerifierDecision } from '@/lib/verifier/types';

/**
 * IDs de orquestación. Superconjunto de HunterSourceId.
 * community / placeholders NO escriben hunter_source_health.
 */
export type SupplySourceId =
  | HunterSourceId
  | 'community'
  | 'affiliate_feed'
  | 'partner';

export type SupplyFamily =
  | 'community'
  | 'retailer_public'
  | 'official_api'
  | 'affiliate_feed'
  | 'external_worker'
  | 'partner'
  | 'core';

export type SupplySourceType =
  | 'retailer_public'
  | 'official_api'
  | 'affiliate_feed'
  | 'external_worker'
  | 'community'
  | 'user_submission'
  | 'partner'
  | 'future';

export type SupplyRuntimeStatus =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'DOWN'
  | 'NOT_CONFIGURED'
  | 'BLOCKED'
  | 'DISABLED';

export type GlobalSupplyStatus = 'HEALTHY' | 'DEGRADED' | 'AT_RISK' | 'DOWN';

export type SupplyCapabilities = {
  discovery: boolean;
  productResolution: boolean;
  price: boolean;
  originalPrice: boolean;
  promotion: boolean;
  image: boolean;
  affiliate: boolean;
  availability: boolean;
};

export type SupplyLimits = {
  maxCandidates: number;
  maxRequests: number;
  maxRuntimeMs: number;
  maxConcurrency: 1;
};

export type CandidateTrustContext = {
  sourceType: SupplySourceType;
  creatorId?: string | null;
  creatorReputation?: number | null;
  historicalApprovalRate?: number | null;
  spamRate?: number | null;
};

export type SupplyPriorityPolicy = {
  typeOrder: SupplySourceType[];
  communityReservedSlots: number;
  maxPerSource: number;
  maxTotal: number;
  maxConcurrency: 1;
};

/**
 * Vista de orquestación. El contrato canónico sigue siendo IngestItem.
 * No es un segundo modelo de oferta.
 */
export type SupplyCandidate = {
  ingestItem: IngestItem;
  hunterCandidate: HunterCandidate;
  sourceId: SupplySourceId;
  sourceFamily: SupplyFamily;
  sourceType: SupplySourceType;
  discoveredAt: string;
  sourceUrl: string;
  canonicalUrl: string;
  title: string | null;
  price: number | null;
  originalPrice: number | null;
  currency: string | null;
  discountPercent: number | null;
  promotionType: string | null;
  images: string[];
  availability: string | null;
  seller: string | null;
  brand: string | null;
  sku: string | null;
  productId: string | null;
  qualification: DealQualification | null;
  qualificationReasons: Array<DealQualificationReasonCode | string>;
  currentPriceProvenance: PriceProvenance;
  originalPriceProvenance: PriceProvenance;
  monetizationStatus: OfferMonetizationStatus;
  trust: CandidateTrustContext;
  duplicateOf: string | null;
  duplicateReason: string | null;
  duplicateSource: SupplySourceId | null;
  verifierDecision: DealVerifierDecision | null;
  autonomousDecision: AutonomousDecision | null;
};

export type SupplyCollectResult = {
  ok: boolean;
  candidates: SupplyCandidate[];
  errorCode?: string | null;
  errorMessageSafe?: string | null;
};

export type SupplyCollectContext = {
  hunterSource: HunterSource | null;
  hunterCtx: Parameters<HunterSource['collect']>[0];
  communityUrls: string[];
  now: Date;
};

export type SupplySource = {
  id: SupplySourceId;
  displayName: string;
  family: SupplyFamily;
  type: SupplySourceType;
  hunterSourceId: HunterSourceId | null;
  ingestSourceId: IngestSourceId | null;
  capabilities: SupplyCapabilities;
  limits: SupplyLimits;
  canBypassVerifier: false;
  canPublish: false;
  canModifyRewards: false;
  isEnabled: (ctx: SupplyCollectContext) => boolean;
  isConfigured: (ctx: SupplyCollectContext) => boolean;
  collect: (ctx: SupplyCollectContext) => Promise<SupplyCollectResult>;
};

export type SupplySourceRun = {
  sourceId: SupplySourceId;
  family: SupplyFamily;
  type: SupplySourceType;
  attempted: boolean;
  skippedReason: string | null;
  ok: boolean;
  candidates: number;
  unique: number;
  verifiedDeals: number;
  promotions: number;
  catalogOnly: number;
  duplicates: number;
  errors: number;
  fallbackFrom: SupplySourceId | null;
  isolatedFailure: boolean;
};

export type SupplyRouterReport = {
  persisted: false;
  published: false;
  inserted: false;
  rewardsTouched: false;
  verifierBypassed: false;
  startedAt: string;
  finishedAt: string;
  globalStatus: GlobalSupplyStatus;
  recommendedAction: string;
  candidatesDiscovered: number;
  candidatesQualified: number;
  verifiedDeals: number;
  promotions: number;
  catalogOnly: number;
  duplicates: number;
  rejected: number;
  pending: number;
  sourceFailures: number;
  communityShare: number;
  machineShare: number;
  verifiedDealRate: number;
  duplicateRate: number;
  communityVerified: number;
  machineVerified: number;
  runs: SupplySourceRun[];
  uniqueCandidates: SupplyCandidate[];
  duplicateCandidates: SupplyCandidate[];
};

export type SupplyContributionRow = {
  sourceId: SupplySourceId;
  family: SupplyFamily;
  candidates: number;
  unique: number;
  verified: number;
  duplicates: number;
  errors: number;
  contributionPct: number;
};

export type SupplyBoardSnapshot = {
  globalStatus: GlobalSupplyStatus;
  recommendedAction: string;
  candidates: number;
  verifiedDeals: number;
  promotions: number;
  pending: number;
  communityCandidates: number;
  machineCandidates: number;
  communityVerified: number;
  machineVerified: number;
  contribution: SupplyContributionRow[];
  sourceHealth: Array<{
    sourceId: SupplySourceId;
    displayName: string;
    family: SupplyFamily;
    status: SupplyRuntimeStatus;
    hunterStatus: HunterHealthStatus | null;
  }>;
  lastRun: SupplyRouterReport | null;
};
