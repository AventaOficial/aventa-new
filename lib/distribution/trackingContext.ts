import type { DistributionTrackingContext, DistributionProvider } from './types';

/**
 * Future hop metadata only — does NOT call recordAttributedClick.
 * Does NOT create a second attribution path.
 */
export function buildDistributionTrackingContext(input: {
  publicationId: string;
  offerId: string;
  destinationId: string;
  provider: DistributionProvider;
  campaignKey: string | null;
}): DistributionTrackingContext {
  return {
    publicationId: input.publicationId,
    offerId: input.offerId,
    destinationId: input.destinationId,
    provider: input.provider,
    campaignKey: input.campaignKey,
    source: 'distribution',
  };
}
