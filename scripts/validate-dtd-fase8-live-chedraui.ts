/**
 * FASE 8 — validación live limitada Chedraui (≤8 candidatos, sin persistir).
 * No activa flags de producción; solo discovery en proceso.
 */
import { chedrauiSource } from '../lib/hunter/dayToDay/adapters';
import { loadBotIngestConfig } from '../lib/bots/ingest/config';

async function main() {
  process.env.DAY_TO_DAY_PILOT = '1';
  process.env.DAY_TO_DAY_CHEDRAUI_DISCOVERY = '1';
  delete process.env.DAY_TO_DAY_FIXTURES;

  const cfg = loadBotIngestConfig();
  const t0 = Date.now();
  const result = await chedrauiSource.collect({ config: cfg, rotationWave: 0 });
  const latencyMs = Date.now() - t0;

  console.log(
    JSON.stringify(
      {
        id: 'chedraui_mx',
        ok: result.ok,
        errorCode: result.errorCode ?? null,
        errorMessageSafe: result.errorMessageSafe ?? null,
        candidates: result.candidates.length,
        latencyMs,
        persisted: false,
        samples: result.candidates.slice(0, 8).map((c) => ({
          title: c.title,
          price: c.price,
          originalPrice: c.originalPrice,
          url: c.url,
          hasImage: Boolean(c.image),
          productId: c.externalId ?? c.ingestItem?.precomputedMeta?.signals?.sku ?? null,
          source: c.source,
          monetization: c.rawMetadata?.monetizationStatus ?? null,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(String(e));
  process.exit(2);
});
