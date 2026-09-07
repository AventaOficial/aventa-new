import { expandAmazonAsinUrls } from '@/lib/bots/ingest/expandAmazonAsinUrls';
import type { HunterCollectContext, HunterCollectResult, HunterSource } from '../types';
import { ingestItemToCandidate } from '../normalize';

function asinScrapeEnabled(ctx: HunterCollectContext): boolean {
  if (ctx.config.amazonAsins.length === 0) return false;
  if (ctx.config.amazonSource === 'paapi') {
    const hasCreds = Boolean(
      ctx.config.amazonPaapiEnabled &&
        ctx.config.amazonPaapiAccessKey &&
        ctx.config.amazonPaapiSecretKey &&
        ctx.config.amazonPaapiPartnerTag
    );
    return !hasCreds;
  }
  return true;
}

export const amazonAsinSource: HunterSource = {
  id: 'amazon_asin',
  ingestSourceId: 'amazon_asin',
  displayName: 'Amazon ASIN URLs',
  priority: 30,
  expectedIntervalMs: 15 * 60 * 1000,
  isEnabled: (ctx) => asinScrapeEnabled(ctx),
  isAvailable: (ctx) => asinScrapeEnabled(ctx),
  async collect(ctx: HunterCollectContext): Promise<HunterCollectResult> {
    const urls = expandAmazonAsinUrls(ctx.config);
    const detectedAt = (ctx.now ?? new Date()).toISOString();
    const candidates = urls.map((url) =>
      ingestItemToCandidate(
        { url, source: 'amazon_asin', sourceDetail: 'amazon:scrape' },
        'amazon_asin',
        detectedAt
      )
    );
    return {
      ok: true,
      candidates,
      itemsFound: candidates.length,
      collectedCount: candidates.length,
    };
  },
};
