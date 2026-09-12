import { bodegaSource } from '../lib/hunter/dayToDay/adapters';
import { loadBotIngestConfig } from '../lib/bots/ingest/config';

async function main() {
  process.env.DAY_TO_DAY_PILOT = '1';
  process.env.DAY_TO_DAY_BODEGA_DISCOVERY = '1';
  delete process.env.DAY_TO_DAY_FIXTURES;
  const t0 = Date.now();
  const r = await bodegaSource.collect({ config: loadBotIngestConfig(), rotationWave: 0 });
  console.log(
    JSON.stringify(
      {
        id: 'bodega_aurrera_mx',
        ok: r.ok,
        errorCode: r.errorCode ?? null,
        errorMessageSafe: r.errorMessageSafe ?? null,
        candidates: r.candidates.length,
        latencyMs: Date.now() - t0,
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
