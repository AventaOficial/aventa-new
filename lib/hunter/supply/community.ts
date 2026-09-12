import { toSupplyCandidate } from './candidate';
import { resolveCommunityUrl } from './resolve';
import type { SupplyCollectContext, SupplyCollectResult, SupplySource } from './types';

const COMMUNITY_LIMITS = {
  maxCandidates: 8,
  maxRequests: 0,
  maxRuntimeMs: 5_000,
  maxConcurrency: 1 as const,
};

/**
 * Community es source de primera clase.
 * No escribe DB. No publica. No salta verifier.
 * Product resolution = adapters existentes (ML / Amazon / URL genérica).
 */
export const communitySupplySource: SupplySource = {
  id: 'community',
  displayName: 'Community',
  family: 'community',
  type: 'community',
  hunterSourceId: null,
  ingestSourceId: null,
  capabilities: {
    discovery: true,
    productResolution: true,
    price: true,
    originalPrice: true,
    promotion: true,
    image: true,
    affiliate: false,
    availability: true,
  },
  limits: COMMUNITY_LIMITS,
  canBypassVerifier: false,
  canPublish: false,
  canModifyRewards: false,
  isEnabled: () => true,
  isConfigured: () => true,
  async collect(ctx: SupplyCollectContext): Promise<SupplyCollectResult> {
    const detectedAt = ctx.now.toISOString();
    const candidates = [];
    for (const raw of ctx.communityUrls) {
      const resolved = resolveCommunityUrl(raw);
      if (!resolved.ok) continue;
      candidates.push(
        toSupplyCandidate({
          item: {
            url: resolved.url,
            source: resolved.ingestSourceId,
            sourceDetail: 'community:paste',
          },
          hunterSourceId: resolved.hunterSourceId,
          sourceId: 'community',
          sourceFamily: 'community',
          sourceType: 'community',
          discoveredAt: detectedAt,
        }),
      );
    }
    return { ok: true, candidates };
  },
};
