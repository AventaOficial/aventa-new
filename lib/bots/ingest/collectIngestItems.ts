import type { IngestItem } from './types';
import type { BotIngestConfig } from './config';
import { discoverMercadoLibreIngestItems } from './discoverMercadoLibre';
import { expandAmazonAsinUrls } from './expandAmazonAsinUrls';

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
): Promise<IngestItem[]> {
  const seen = new Set<string>();
  const mlItems = await discoverMercadoLibreIngestItems(config, seen, rotationWave);

  const amazonItems: IngestItem[] = [];
  for (const url of expandAmazonAsinUrls(config)) {
    const k = canonicalKey(url);
    if (seen.has(k)) continue;
    seen.add(k);
    amazonItems.push({ url, source: 'amazon_asin' });
  }

  const envItems: IngestItem[] = [];
  for (const url of config.urlsFromEnv) {
    const k = canonicalKey(url);
    if (seen.has(k)) continue;
    seen.add(k);
    envItems.push({ url, source: 'env_urls' });
  }

  const w = ((rotationWave % 3) + 3) % 3;
  const segments: IngestItem[][] =
    w === 0 ? [mlItems, amazonItems, envItems] : w === 1 ? [amazonItems, mlItems, envItems] : [mlItems, envItems, amazonItems];

  const items: IngestItem[] = [];
  for (const seg of segments) {
    items.push(...seg);
  }

  const rssEnabled = process.env.BOT_INGEST_RSS_ENABLED === 'true';
  if (rssEnabled && process.env.BOT_INGEST_RSS_URLS?.trim()) {
    /* RSS: reservado — fetch + parse sin bloquear el cron */
  }

  return items;
}
