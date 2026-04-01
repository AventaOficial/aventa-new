import { chromium } from 'playwright';
import { discoverMercadoLibreCandidates } from './ml.mjs';

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
  const dryRun = process.argv.includes('--dry-run');
  const seeds = parseSeeds(getEnv('WORKER_ML_SEEDS'));

  if (!endpoint) throw new Error('Falta AVENTA_INGEST_ENDPOINT');
  if (!secret) throw new Error('Falta AVENTA_CRON_SECRET');
  if (seeds.length === 0) throw new Error('Falta WORKER_ML_SEEDS');

  const browser = await chromium.launch({ headless });
  try {
    const page = await browser.newPage({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
      viewport: { width: 1440, height: 1400 },
    });
    page.setDefaultTimeout(timeoutMs);

    const candidates = await discoverMercadoLibreCandidates(page, {
      seeds,
      maxItems,
      minDiscountPercent,
    });

    if (candidates.length === 0) {
      console.log('[worker] sin candidatos utilizables');
      return;
    }

    const payload = {
      profile,
      dryRun,
      candidates,
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
