import type { IngestItem } from './types';
import type { BotIngestConfig } from './config';
import { runHunterCollect } from '@/lib/hunter/engine';

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

/**
 * Collect multifuente vía Hunter Engine.
 * Un fallo de una fuente (p. ej. ML 403) no aborta el resto.
 */
export async function collectIngestItems(
  config: BotIngestConfig,
  rotationWave: number
): Promise<IngestCollectionResult> {
  const result = await runHunterCollect({
    config,
    rotationWave,
    persistHealth: true,
  });

  const rssEnabled = process.env.BOT_INGEST_RSS_ENABLED === 'true';
  if (rssEnabled && process.env.BOT_INGEST_RSS_URLS?.trim()) {
    /* RSS: reservado — fetch + parse sin bloquear el cron */
  }

  return {
    items: result.items,
    discoveryDiagnostics: result.discoveryDiagnostics,
  };
}
