import { HUNTER_SOURCES } from '@/lib/hunter/sources';
import type { HunterSource, HunterSourceId } from '@/lib/hunter/types';
import { communitySupplySource } from './community';
import { fromHunterCandidate } from './candidate';
import type {
  SupplyCapabilities,
  SupplyCollectContext,
  SupplyCollectResult,
  SupplyFamily,
  SupplySource,
  SupplySourceId,
  SupplySourceType,
} from './types';

const DEFAULT_LIMITS = {
  maxCandidates: 8,
  maxRequests: 8,
  maxRuntimeMs: 20_000,
  maxConcurrency: 1 as const,
};

function familyForHunter(source: HunterSource): SupplyFamily {
  if (source.family === 'day_to_day') return 'retailer_public';
  if (source.id === 'ml_worker') return 'external_worker';
  if (source.id === 'ml_api_legacy' || source.id === 'amazon_paapi') return 'official_api';
  if (source.id === 'amazon_asin') return 'official_api';
  return 'core';
}

function typeForHunter(source: HunterSource): SupplySourceType {
  if (source.family === 'day_to_day') return 'retailer_public';
  if (source.discoveryMethod === 'official_api' || source.id === 'ml_api_legacy' || source.id === 'amazon_paapi') {
    return 'official_api';
  }
  if (source.id === 'ml_worker' || source.external) return 'external_worker';
  if (source.id === 'env_urls') return 'user_submission';
  if (source.id === 'amazon_asin') return 'official_api';
  return 'future';
}

function capabilitiesForHunter(source: HunterSource): SupplyCapabilities {
  const caps = source.capabilities;
  const dtd = source.family === 'day_to_day';
  return {
    discovery: caps?.discovery ?? true,
    productResolution: caps?.productLookup ?? true,
    price: caps?.price ?? true,
    originalPrice: dtd ? false : Boolean(caps?.price),
    promotion: dtd ? false : false,
    image: caps?.images ?? true,
    affiliate: source.affiliateStatus === 'available',
    availability: Boolean(caps?.productLookup),
  };
}

function wrapHunterSource(source: HunterSource): SupplySource {
  const family = familyForHunter(source);
  const type = typeForHunter(source);
  return {
    id: source.id,
    displayName: source.displayName,
    family,
    type,
    hunterSourceId: source.id,
    ingestSourceId: source.ingestSourceId,
    capabilities: capabilitiesForHunter(source),
    limits: {
      ...DEFAULT_LIMITS,
      maxCandidates: source.ratePolicy?.maxItems ?? DEFAULT_LIMITS.maxCandidates,
      maxRequests: source.ratePolicy?.requestsPerCycle ?? DEFAULT_LIMITS.maxRequests,
    },
    canBypassVerifier: false,
    canPublish: false,
    canModifyRewards: false,
    isEnabled: (ctx) => source.isEnabled(ctx.hunterCtx),
    isConfigured: (ctx) =>
      source.isConfigured ? source.isConfigured(ctx.hunterCtx) : source.isAvailable(ctx.hunterCtx),
    async collect(ctx: SupplyCollectContext): Promise<SupplyCollectResult> {
      const out = await source.collect(ctx.hunterCtx);
      const candidates = (out.candidates ?? []).map((c) =>
        fromHunterCandidate(c, { sourceId: source.id, sourceFamily: family, sourceType: type }),
      );
      return {
        ok: out.ok,
        candidates,
        errorCode: out.errorCode ?? null,
        errorMessageSafe: out.errorMessageSafe ?? null,
      };
    },
  };
}

function placeholder(opts: {
  id: Extract<SupplySourceId, 'affiliate_feed' | 'partner'>;
  displayName: string;
  family: SupplyFamily;
  type: SupplySourceType;
}): SupplySource {
  return {
    id: opts.id,
    displayName: opts.displayName,
    family: opts.family,
    type: opts.type,
    hunterSourceId: null,
    ingestSourceId: null,
    capabilities: {
      discovery: false,
      productResolution: false,
      price: false,
      originalPrice: false,
      promotion: false,
      image: false,
      affiliate: opts.id === 'affiliate_feed',
      availability: false,
    },
    limits: DEFAULT_LIMITS,
    canBypassVerifier: false,
    canPublish: false,
    canModifyRewards: false,
    isEnabled: () => false,
    isConfigured: () => false,
    async collect(): Promise<SupplyCollectResult> {
      return { ok: true, candidates: [], errorCode: 'not_configured' };
    },
  };
}

export const SUPPLY_SOURCES: SupplySource[] = [
  ...HUNTER_SOURCES.map(wrapHunterSource),
  communitySupplySource,
  placeholder({
    id: 'affiliate_feed',
    displayName: 'Affiliate Feed',
    family: 'affiliate_feed',
    type: 'affiliate_feed',
  }),
  placeholder({
    id: 'partner',
    displayName: 'Partner',
    family: 'partner',
    type: 'partner',
  }),
];

export function supplySourceById(id: SupplySourceId): SupplySource | undefined {
  return SUPPLY_SOURCES.find((s) => s.id === id);
}

export function hunterBackedSupplySources(): SupplySource[] {
  return SUPPLY_SOURCES.filter((s) => s.hunterSourceId != null);
}

export function isCommunitySourceId(id: string): id is 'community' {
  return id === 'community';
}

export function isMachineSourceId(id: SupplySourceId): boolean {
  return id !== 'community';
}

export function assertSupplyInvariants(source: SupplySource) {
  if (source.canBypassVerifier !== false) throw new Error('source cannot bypass verifier');
  if (source.canPublish !== false) throw new Error('source cannot publish');
  if (source.canModifyRewards !== false) throw new Error('source cannot modify rewards');
}

export function hunterIdForSupply(id: SupplySourceId): HunterSourceId | null {
  const src = supplySourceById(id);
  return src?.hunterSourceId ?? null;
}
