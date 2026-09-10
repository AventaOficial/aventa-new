import type { HunterCollectContext, HunterCollectResult, HunterSource } from '../types';
import { ingestItemToCandidate } from '../normalize';
import {
  extractMercadoLibreItemId,
  isMercadoLibreHost,
  resolveMercadoLibreItem,
} from '@/lib/offers/resolveMercadoLibreItem';

function isMercadoLibreProductUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (!isMercadoLibreHost(url.hostname)) return false;
    return extractMercadoLibreItemId(url.href) != null;
  } catch {
    return false;
  }
}

function normalizeMercadoLibreProductUrl(rawUrl: string): string {
  const resolved = resolveMercadoLibreItem(rawUrl);
  if (resolved?.canonicalUrl) return resolved.canonicalUrl;
  return rawUrl;
}

export const envUrlsSource: HunterSource = {
  id: 'env_urls',
  ingestSourceId: 'env_urls',
  displayName: 'URLs manuales',
  priority: 40,
  expectedIntervalMs: 15 * 60 * 1000,
  isEnabled: (ctx) => ctx.config.urlsFromEnv.length > 0,
  isAvailable: (ctx) => ctx.config.urlsFromEnv.length > 0,
  async collect(ctx: HunterCollectContext): Promise<HunterCollectResult> {
    const detectedAt = (ctx.now ?? new Date()).toISOString();
    const candidates = [];
    for (const url of ctx.config.urlsFromEnv) {
      if (!isMercadoLibreProductUrl(url) && /mercadolibre\./i.test(url)) continue;
      const normalizedUrl = isMercadoLibreProductUrl(url)
        ? normalizeMercadoLibreProductUrl(url)
        : url;
      candidates.push(
        ingestItemToCandidate(
          { url: normalizedUrl, source: 'env_urls', sourceDetail: 'manual:url' },
          'env_urls',
          detectedAt
        )
      );
    }
    return {
      ok: true,
      candidates,
      itemsFound: candidates.length,
      collectedCount: candidates.length,
    };
  },
};
