/**
 * FASE 8 — dry-run live Walmart (espera challenge/DEGRADED, sin evade).
 */
import { walmartSource } from '../lib/hunter/dayToDay/adapters';
import { loadBotIngestConfig } from '../lib/bots/ingest/config';

async function main() {
  process.env.DAY_TO_DAY_PILOT = '1';
  process.env.DAY_TO_DAY_WALMART_DISCOVERY = '1';
  delete process.env.DAY_TO_DAY_FIXTURES;

  const cfg = loadBotIngestConfig();
  const t0 = Date.now();
  const result = await walmartSource.collect({ config: cfg, rotationWave: 0 });
  console.log(
    JSON.stringify(
      {
        id: 'walmart_mx',
        ok: result.ok,
        errorCode: result.errorCode ?? null,
        errorMessageSafe: result.errorMessageSafe ?? null,
        candidates: result.candidates.length,
        latencyMs: Date.now() - t0,
        persisted: false,
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
