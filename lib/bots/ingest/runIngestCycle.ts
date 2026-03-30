import { loadBotIngestConfig } from './config';
import { collectIngestItems } from './collectIngestItems';
import { fetchParsedOfferMetadata } from './fetchParsedOfferMetadata';
import { insertIngestedOffer } from './insertIngestedOffer';
import type { IngestCycleReport, IngestSingleResult } from './types';

function emptySummary() {
  return { inserted: 0, duplicate: 0, skipped: 0, errors: 0 };
}

export async function runIngestCycle(): Promise<IngestCycleReport> {
  const startedAt = new Date().toISOString();
  const config = loadBotIngestConfig();
  const results: IngestSingleResult[] = [];

  if (!config.enabled) {
    return {
      ok: true,
      enabled: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      maxPerRun: config.maxPerRun,
      results,
      summary: emptySummary(),
    };
  }

  if (!config.botUserId) {
    return {
      ok: false,
      enabled: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      maxPerRun: config.maxPerRun,
      results: [
        {
          url: '',
          status: 'error',
          message: 'BOT_INGEST_USER_ID es obligatorio cuando BOT_INGEST_ENABLED=true',
        },
      ],
      summary: { ...emptySummary(), errors: 1 },
    };
  }

  const allItems = collectIngestItems(config);
  const slice = allItems.slice(0, config.maxPerRun);

  for (const item of slice) {
    try {
      const meta = await fetchParsedOfferMetadata(item.url);
      if (!meta) {
        results.push({ url: item.url, status: 'skipped', reason: 'no se pudo obtener metadatos o precio' });
        continue;
      }

      if (config.minDiscountPercent > 0) {
        if (meta.discountPercent < config.minDiscountPercent) {
          results.push({
            url: item.url,
            status: 'skipped',
            reason: `descuento ${meta.discountPercent}% < mínimo ${config.minDiscountPercent}%`,
          });
          continue;
        }
      }

      const ins = await insertIngestedOffer(meta, config);
      if (ins.ok) {
        results.push({ url: item.url, status: 'inserted', offerId: ins.offerId });
      } else if ('duplicate' in ins && ins.duplicate) {
        results.push({ url: item.url, status: 'duplicate' });
      } else if ('error' in ins) {
        results.push({ url: item.url, status: 'error', message: ins.error });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      results.push({ url: item.url, status: 'error', message });
    }
  }

  const summary = {
    inserted: results.filter((r) => r.status === 'inserted').length,
    duplicate: results.filter((r) => r.status === 'duplicate').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    errors: results.filter((r) => r.status === 'error').length,
  };

  return {
    ok: summary.errors === 0,
    enabled: true,
    startedAt,
    finishedAt: new Date().toISOString(),
    maxPerRun: config.maxPerRun,
    results,
    summary,
  };
}
