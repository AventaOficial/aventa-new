import type { HunterCollectContext, HunterCollectResult, HunterSource } from '../types';
import { ingestItemToCandidate } from '../normalize';

function extractMercadoLibreItemId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const directId =
      url.searchParams.get('wid') ||
      url.searchParams.get('item_id') ||
      url.searchParams.get('itemId');
    if (directId && /^ML[A-Z]{0,3}\d+$/i.test(directId.trim())) return directId.trim().toUpperCase();
    const pdpFilters = url.searchParams.get('pdp_filters');
    const fromFilters = pdpFilters?.match(/item_id:([A-Z]{2,6}\d+)/i)?.[1];
    if (fromFilters) return fromFilters.toUpperCase();
    const fromPath = url.pathname.match(/\/((?:ML|M[A-Z]{1,5})\d+)(?:[/?#-]|$)/i)?.[1];
    return fromPath ? fromPath.toUpperCase() : null;
  } catch {
    return null;
  }
}

function isMercadoLibreHost(hostname: string): boolean {
  const host = hostname.replace(/^www\./, '').toLowerCase();
  return host === 'mercadolibre.com' || host === 'mercadolibre.com.mx' || host.endsWith('.mercadolibre.com.mx');
}

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
  try {
    const url = new URL(rawUrl);
    if (!isMercadoLibreHost(url.hostname)) return url.href;
    const itemId = extractMercadoLibreItemId(url.href);
    if (!itemId) return url.href;
    const normalized = new URL(`${url.origin}${url.pathname}`);
    normalized.searchParams.set('wid', itemId);
    return normalized.toString();
  } catch {
    return rawUrl;
  }
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
