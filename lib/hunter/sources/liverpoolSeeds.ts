/**
 * Day 6 — Liverpool seed-PDP discovery (safe, no brittle search scrape).
 *
 * Uses existing PDP identity (`liv:SKU`) + extract path. Enabled only when
 * BOT_INGEST_LIVERPOOL_URLS has product URLs, or fixtures mode for tests.
 *
 * Does NOT mint. Does NOT bypass DQE/S6.1. Collect only yields URL candidates.
 */

import type { HunterCollectContext, HunterCollectResult, HunterSource } from '../types';
import { ingestItemToCandidate } from '../normalize';
import { extractLiverpoolProductId } from '@/lib/offers/urlResolution/liverpoolResolver';
import { isOfferLiverpoolHost } from '@/lib/offers/commerceHostAllowlist';

function liverpoolUrlsEnabled(ctx: HunterCollectContext): boolean {
  return (ctx.config.liverpoolUrls?.length ?? 0) > 0;
}

function isLikelyLiverpoolPdp(url: string): boolean {
  try {
    const u = new URL(url);
    if (!isOfferLiverpoolHost(u.hostname)) return false;
    if (extractLiverpoolProductId(url)) return true;
    return /\/tienda\/pdp\//i.test(u.pathname);
  } catch {
    return false;
  }
}

export const liverpoolSeedsSource: HunterSource = {
  id: 'liverpool_mx',
  ingestSourceId: 'liverpool_mx',
  displayName: 'Liverpool seed PDPs',
  family: 'day_to_day',
  priority: 45,
  expectedIntervalMs: 30 * 60 * 1000,
  capabilities: {
    discovery: true,
    productLookup: true,
    images: true,
    price: true,
  },
  discoveryMethod: 'public_page',
  affiliateStatus: 'unknown',
  isEnabled: (ctx) => liverpoolUrlsEnabled(ctx),
  isAvailable: (ctx) => liverpoolUrlsEnabled(ctx),
  isConfigured: (ctx) => liverpoolUrlsEnabled(ctx),
  async collect(ctx: HunterCollectContext): Promise<HunterCollectResult> {
    const urls = ctx.config.liverpoolUrls ?? [];
    const detectedAt = (ctx.now ?? new Date()).toISOString();
    const skippedCandidates: NonNullable<HunterCollectResult['skippedCandidates']> = [];
    const candidates = [];

    for (const url of urls) {
      const trimmed = url.trim();
      if (!trimmed) continue;
      if (!isLikelyLiverpoolPdp(trimmed)) {
        skippedCandidates.push({
          url: trimmed,
          reason: 'not_liverpool_pdp',
        });
        continue;
      }
      const sku = extractLiverpoolProductId(trimmed);
      candidates.push(
        ingestItemToCandidate(
          {
            url: trimmed,
            source: 'liverpool_mx',
            sourceDetail: sku ? `liverpool:sku:${sku}` : 'liverpool:seed_pdp',
          },
          'liverpool_mx',
          detectedAt,
        ),
      );
    }

    return {
      ok: true,
      candidates,
      itemsFound: candidates.length,
      collectedCount: candidates.length,
      skipReasonCounts:
        skippedCandidates.length > 0
          ? { not_liverpool_pdp: skippedCandidates.length }
          : undefined,
      skippedCandidates: skippedCandidates.length > 0 ? skippedCandidates : undefined,
    };
  },
};
