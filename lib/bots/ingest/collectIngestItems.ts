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

function canonicalKey(url: string): string {
  try {
    const u = new URL(url);
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
    const k = canonicalKey(url);
    if (seen.has(k)) continue;
    seen.add(k);
    envItems.push({ url, source: 'env_urls', sourceDetail: 'manual:url' });
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
