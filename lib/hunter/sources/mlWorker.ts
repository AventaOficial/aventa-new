import type { HunterCollectResult, HunterSource } from '../types';

/**
 * Fuente externa (Playwright / GitHub Actions).
 * No scrapea aquí: el health se actualiza al recibir POST bot-ingest-candidates.
 */
export const mlWorkerSource: HunterSource = {
  id: 'ml_worker',
  ingestSourceId: 'ml_worker',
  displayName: 'Mercado Libre Worker',
  priority: 15,
  expectedIntervalMs: 30 * 60 * 1000,
  external: true,
  isEnabled: () =>
    process.env.BOT_INGEST_EXTERNAL_WORKER === '1' ||
    process.env.BOT_INGEST_EXTERNAL_WORKER === 'true',
  isAvailable: () =>
    process.env.BOT_INGEST_EXTERNAL_WORKER === '1' ||
    process.env.BOT_INGEST_EXTERNAL_WORKER === 'true',
  async collect(): Promise<HunterCollectResult> {
    return {
      ok: true,
      candidates: [],
      itemsFound: 0,
      errorMessageSafe: 'external_source_no_inline_collect',
    };
  },
};
