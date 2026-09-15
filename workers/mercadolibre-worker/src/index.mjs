import { chromium } from 'playwright';
import { discoverMercadoLibreCandidates } from './ml.mjs';
import { cycleIndexFor, resolveSeeds, SEED_ROTATION_INTERVAL_MS } from './seeds.mjs';

function getEnv(name, fallback = '') {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function parseSeeds(raw) {
  return raw
    .split(/[\n,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

async function postCandidates(endpoint, secret, payload) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`Aventa respondió ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function main() {
  const endpoint = getEnv('AVENTA_INGEST_ENDPOINT');
  const secret = getEnv('AVENTA_CRON_SECRET');
  const profile = getEnv('WORKER_PROFILE', 'standard') === 'mega' ? 'mega' : 'standard';
  const headless = getEnv('WORKER_HEADLESS', '1') !== '0';
    const maxItems = Number.parseInt(getEnv('WORKER_MAX_ITEMS', '12'), 10) || 12;
  const minDiscountPercent = Number.parseInt(getEnv('WORKER_MIN_DISCOUNT_PERCENT', '15'), 10) || 15;
  const timeoutMs = Number.parseInt(getEnv('WORKER_TIMEOUT_MS', '45000'), 10) || 45000;
  const dryRun =
    process.argv.includes('--dry-run') ||
    getEnv('WORKER_DISCOVERY_ONLY', '0') === '1' ||
    getEnv('WORKER_DISCOVERY_ONLY', '').toLowerCase() === 'true';
  const perSeedMax = Number.parseInt(getEnv('WORKER_MAX_PER_SEED', ''), 10) || null;
  const pdpMax = Number.parseInt(getEnv('WORKER_PDP_MAX', ''), 10) || null;
  const shortlistMax = Number.parseInt(getEnv('WORKER_SHORTLIST_MAX', ''), 10) || null;
  const rotationIntervalMs =
    Number.parseInt(getEnv('WORKER_ROTATION_INTERVAL_MS', ''), 10) || SEED_ROTATION_INTERVAL_MS;
  // El orden depende del reloj, no de un contador guardado: dos runners del mismo
  // ciclo eligen las mismas seeds sin compartir estado.
  const cycleIndex = cycleIndexFor(Date.now(), rotationIntervalMs);
  let seeds = resolveSeeds({ override: parseSeeds(getEnv('WORKER_ML_SEEDS')), cycleIndex });

  // Sticky seeds from Aventa Price Memory (optional, discovery-only).
  const stickyEndpoint = getEnv('AVENTA_STICKY_SEEDS_ENDPOINT');
  if (stickyEndpoint && secret) {
    try {
      const stickyRes = await fetch(stickyEndpoint, {
        headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' },
      });
      if (stickyRes.ok) {
        const stickyJson = await stickyRes.json();
        const stickySeeds = Array.isArray(stickyJson?.seeds) ? stickyJson.seeds : [];
        const mapped = stickySeeds
          .filter((s) => s && typeof s.url === 'string')
          .map((s) => ({
            id: String(s.id || `sticky_${s.productId || 'x'}`),
            url: String(s.url),
            group: 'sticky',
            category: null,
            enabled: true,
          }));
        if (mapped.length > 0) {
          // Sticky PDPs first, then fresh surfaces — budget shared via maxItems.
          seeds = [...mapped, ...seeds];
          console.log(`[worker] sticky_seeds=${mapped.length}`);
        }
      }
    } catch (e) {
      console.warn('[worker] sticky seeds fetch failed', e instanceof Error ? e.message : e);
    }
  }

  if (!endpoint) throw new Error('Falta AVENTA_INGEST_ENDPOINT');
  if (!secret) throw new Error('Falta AVENTA_CRON_SECRET');
  if (seeds.length === 0) throw new Error('El registro de seeds quedó vacío');

  console.log(
    `[worker] boot profile=${profile} headless=${headless ? '1' : '0'} maxItems=${maxItems} minDiscount=${minDiscountPercent} pdpMax=${pdpMax ?? 'auto'} shortlistMax=${shortlistMax ?? 'auto'} seeds=${seeds.length} cycleIndex=${cycleIndex} discoveryOnly=${dryRun ? '1' : '0'}`
  );
  console.log(`[worker] seed_order=${seeds.map((s) => s.id).join(',')}`);

  const browser = await chromium.launch({ headless });
  try {
    const page = await browser.newPage({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
      viewport: { width: 1440, height: 1400 },
    });
    page.setDefaultTimeout(timeoutMs);

    const { candidates, discovery } = await discoverMercadoLibreCandidates(page, {
      seeds,
      maxItems,
      minDiscountPercent,
      perSeedMax,
      pdpMax,
      shortlistMax,
    });

    console.log(`[worker] discovered_candidates=${candidates.length}`);

    if (candidates.length === 0) {
      console.log('[worker] sin candidatos utilizables');
      return;
    }

    const payload = {
      profile,
      dryRun,
      candidates,
      discovery: { ...discovery, cycleIndex },
    };
    const response = await postCandidates(endpoint, secret, payload);
    console.log('[worker] candidatos enviados:', candidates.length);
    console.log(JSON.stringify(response, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('[worker:error]', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
