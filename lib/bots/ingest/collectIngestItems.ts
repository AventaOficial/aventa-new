import type { IngestItem } from './types';
import type { BotIngestConfig } from './config';
import { discoverMercadoLibreIngestItems, type MercadoLibreDiscoveryResult } from './discoverMercadoLibre';
import { expandAmazonAsinUrls } from './expandAmazonAsinUrls';
import { discoverAmazonPaapiIngestItems } from './amazonPaapi';

export type IngestCollectionResult = {
  items: IngestItem[];
  discoveryDiagnostics: Partial<
    Record<
      IngestItem['source'],
      {
        collectedCount?: number;
        skipReasonCounts?: Record<string, number>;
      }
    >
  >;
};

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

function canonicalKey(url: string): string {
  try {
    const u = new URL(url);
    if (isMercadoLibreHost(u.hostname)) {
      const itemId = extractMercadoLibreItemId(u.href);
      if (itemId) return `${u.hostname.replace(/^www\./, '').toLowerCase()}/item/${itemId}`;
    }
    return `${u.hostname.replace(/^www\./, '')}${u.pathname}`.toLowerCase();
  } catch {
    return url.split('?')[0].toLowerCase();
  }
}

/**
 * Orden rotativo por `rotationWave`: alterna prioridad ML / Amazon / URLs env.
 * RSS reservado para expansión.
 */
export async function collectIngestItems(
  config: BotIngestConfig,
  rotationWave: number
): Promise<IngestCollectionResult> {
  const seen = new Set<string>();
  const mlDiscovery: MercadoLibreDiscoveryResult = await discoverMercadoLibreIngestItems(config, seen, rotationWave);
  const mlItems = mlDiscovery.items;

  const amazonItems: IngestItem[] = [];
  const amazonPaapiItems = await discoverAmazonPaapiIngestItems(config);
  for (const item of amazonPaapiItems) {
    const k = canonicalKey(item.url);
    if (seen.has(k)) continue;
    seen.add(k);
    amazonItems.push(item);
  }
  if (config.amazonSource !== 'paapi' || amazonItems.length === 0) {
    for (const url of expandAmazonAsinUrls(config)) {
      const k = canonicalKey(url);
      if (seen.has(k)) continue;
      seen.add(k);
      amazonItems.push({ url, source: 'amazon_asin', sourceDetail: 'amazon:scrape' });
    }
  }

  const envItems: IngestItem[] = [];
  for (const url of config.urlsFromEnv) {
    if (!isMercadoLibreProductUrl(url) && /mercadolibre\./i.test(url)) continue;
    const normalizedUrl = isMercadoLibreProductUrl(url)
      ? normalizeMercadoLibreProductUrl(url)
      : url;
    const k = canonicalKey(normalizedUrl);
    if (seen.has(k)) continue;
    seen.add(k);
    envItems.push({ url: normalizedUrl, source: 'env_urls', sourceDetail: 'manual:url' });
  }

  const w = ((rotationWave % 3) + 3) % 3;
  const segments: IngestItem[][] =
    config.amazonSource === 'scrape'
      ? [mlItems, envItems, amazonItems]
      : w === 0
        ? [mlItems, amazonItems, envItems]
        : w === 1
          ? [amazonItems, mlItems, envItems]
          : [mlItems, envItems, amazonItems];

  const items: IngestItem[] = [];
  for (const seg of segments) {
    items.push(...seg);
  }

  const rssEnabled = process.env.BOT_INGEST_RSS_ENABLED === 'true';
  if (rssEnabled && process.env.BOT_INGEST_RSS_URLS?.trim()) {
    /* RSS: reservado — fetch + parse sin bloquear el cron */
  }

  return {
    items,
    discoveryDiagnostics: {
      ml_api: {
        collectedCount: mlDiscovery.collectedCount,
        skipReasonCounts: mlDiscovery.skipReasonCounts,
      },
    },
  };
}
