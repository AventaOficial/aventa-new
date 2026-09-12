/**
 * FASE 8 pilot dry-run (fixtures, sin red, sin persistir).
 * DAY_TO_DAY_FIXTURES=1 DAY_TO_DAY_*_DISCOVERY=1
 */
import {
  DAY_TO_DAY_SOURCES,
  configurationStateFor,
  isDayToDayFixturesMode,
} from '../lib/hunter/dayToDay';
import { loadBotIngestConfig } from '../lib/bots/ingest/config';

async function main() {
  process.env.DAY_TO_DAY_FIXTURES = '1';
  process.env.DAY_TO_DAY_PILOT = '1';
  process.env.DAY_TO_DAY_CHEDRAUI_DISCOVERY = '1';
  process.env.DAY_TO_DAY_BODEGA_DISCOVERY = '1';
  process.env.DAY_TO_DAY_WALMART_DISCOVERY = '1';

  const cfg = loadBotIngestConfig();
  const rows = [];
  for (const src of DAY_TO_DAY_SOURCES) {
    const result = await src.collect({ config: cfg, rotationWave: 0 });
    rows.push({
      id: src.id,
      configuration: configurationStateFor(src),
      ok: result.ok,
      candidates: result.candidates.length,
      errorCode: result.errorCode ?? null,
      sampleTitle: result.candidates[0]?.title ?? null,
      samplePrice: result.candidates[0]?.price ?? null,
      monetization: result.candidates[0]?.rawMetadata?.monetizationStatus ?? null,
    });
  }

  console.log(
    JSON.stringify(
      {
        fixturesMode: isDayToDayFixturesMode(),
        legacyAutoApproveWriteEnabled: cfg.legacyAutoApproveWriteEnabled,
        persisted: false,
        sources: rows,
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
