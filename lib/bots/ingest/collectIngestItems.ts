import type { IngestItem } from './types';
import type { BotIngestConfig } from './config';

/**
 * Fuentes actuales: URLs en env. RSS reservado para una segunda automatización.
 */
export function collectIngestItems(config: BotIngestConfig): IngestItem[] {
  const items: IngestItem[] = [];
  for (const url of config.urlsFromEnv) {
    items.push({ url, source: 'env_urls' });
  }

  const rssEnabled = process.env.BOT_INGEST_RSS_ENABLED === 'true';
  if (rssEnabled && process.env.BOT_INGEST_RSS_URLS?.trim()) {
    /** Placeholder: aquí iría fetch + parse RSS/Atom sin bloquear el cron. */
  }

  return items;
}
