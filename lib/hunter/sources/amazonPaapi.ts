import { discoverAmazonPaapiIngestItems } from '@/lib/bots/ingest/amazonPaapi';
import type { HunterCollectContext, HunterCollectResult, HunterSource } from '../types';
import { ingestItemToCandidate } from '../normalize';

function hasPaapiCredentials(ctx: HunterCollectContext): boolean {
  const c = ctx.config;
  return Boolean(
    c.amazonPaapiEnabled &&
      c.amazonSource === 'paapi' &&
      c.amazonPaapiAccessKey &&
      c.amazonPaapiSecretKey &&
      c.amazonPaapiPartnerTag &&
      c.amazonAsins.length > 0
  );
}

export const amazonPaapiSource: HunterSource = {
  id: 'amazon_paapi',
  ingestSourceId: 'amazon_asin',
  displayName: 'Amazon PA-API',
  priority: 20,
  expectedIntervalMs: 15 * 60 * 1000,
  isEnabled: (ctx) => ctx.config.amazonPaapiEnabled && ctx.config.amazonSource === 'paapi',
  isAvailable: (ctx) => hasPaapiCredentials(ctx),
  async collect(ctx: HunterCollectContext): Promise<HunterCollectResult> {
    if (!hasPaapiCredentials(ctx)) {
      return { ok: true, candidates: [], itemsFound: 0 };
    }
    const items = await discoverAmazonPaapiIngestItems(ctx.config);
    const detectedAt = (ctx.now ?? new Date()).toISOString();
    const candidates = items.map((item) =>
      ingestItemToCandidate(item, 'amazon_paapi', detectedAt)
    );
    return {
      ok: true,
      candidates,
      itemsFound: candidates.length,
      collectedCount: candidates.length,
    };
  },
};
