/**
 * SMOKE READ-ONLY discovery (sin POST a Aventa).
 * Corre dentro de workers/mercadolibre-worker.
 *
 *   npm install
 *   npx playwright install chromium
 *   node scripts/smoke-gate-v2-discovery.mjs
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { discoverMercadoLibreCandidates } from '../src/ml.mjs';
import { resolveSeeds } from '../src/seeds.mjs';

const SMOKE = {
  maxItems: 8,
  perSeedMax: 4,
  shortlistMax: 12,
  pdpMax: 6,
  minDiscountPercent: 18,
  seedIds: ['ofertas_hub', 'lightning'],
  timeoutMs: 45000,
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outPath = path.join(root, '../../scripts/_smoke-gate-v2-discovery.json');

async function main() {
  const started = Date.now();
  console.error('[smoke-discovery] READ-ONLY: scrape only, NO POST, NO DB writes');
  console.error(`[smoke-discovery] ${JSON.stringify(SMOKE)}`);

  const allSeeds = resolveSeeds({ cycleIndex: 0 });
  const seeds = allSeeds.filter((s) => SMOKE.seedIds.includes(s.id)).slice(0, 2);
  if (seeds.length === 0) throw new Error('sin seeds');

  const browser = await chromium.launch({ headless: true });
  let candidates = [];
  let discovery = {};
  try {
    const page = await browser.newPage({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
      viewport: { width: 1440, height: 1400 },
    });
    page.setDefaultTimeout(SMOKE.timeoutMs);
    const result = await discoverMercadoLibreCandidates(page, {
      seeds,
      maxItems: SMOKE.maxItems,
      minDiscountPercent: SMOKE.minDiscountPercent,
      perSeedMax: SMOKE.perSeedMax,
      pdpMax: SMOKE.pdpMax,
      shortlistMax: SMOKE.shortlistMax,
    });
    candidates = result.candidates;
    discovery = result.discovery;
  } finally {
    await browser.close();
  }

  const payload = {
    meta: {
      mode: 'LOCAL_DISCOVERY_READ_ONLY',
      noPost: true,
      noDbWrites: true,
      elapsedMs: Date.now() - started,
      seeds: seeds.map((s) => s.id),
      smoke: SMOKE,
    },
    discovery,
    candidates,
  };
  writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  console.error(`[smoke-discovery] wrote ${outPath}`);
  console.error(`[smoke-discovery] funnel=${JSON.stringify(discovery.qualityGate || {})}`);
  console.error(`[smoke-discovery] accepted=${candidates.length} elapsedMs=${payload.meta.elapsedMs}`);
  console.log(JSON.stringify({ ok: true, outPath, qualityGate: discovery.qualityGate, accepted: candidates.length }, null, 2));
}

main().catch((e) => {
  console.error('[smoke-discovery:error]', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
