/**
 * Perfil de lectura reproducible. Rechaza producción.
 * Uso: BASE_URL=https://<preview> node scripts/load-read-profile.mjs
 */
const PRODUCTION_HOSTS = new Set(['aventaofertas.com', 'www.aventaofertas.com']);
const PRODUCTION_SUPABASE_REF = 'mkgsrpsuvedwwlzmzmzh';

export function assertIsolatedLoadTarget(raw) {
  let url;
  try {
    url = new URL(String(raw ?? '').trim());
  } catch {
    throw new Error('load profile refused: invalid url');
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:') throw new Error('load profile refused: https required');
  if (PRODUCTION_HOSTS.has(host) || host.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error('load profile refused: production host');
  }
  return url;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

async function runProfile(origin, pathname) {
  const concurrency = Math.min(12, Math.max(1, Number(process.env.LOAD_CONCURRENCY ?? 8)));
  const durationMs = Math.min(20_000, Math.max(5_000, Number(process.env.LOAD_DURATION_MS ?? 12_000)));
  const target = new URL(pathname, origin).toString();
  const samples = [];
  let errors = 0;
  const started = Date.now();

  async function worker() {
    while (Date.now() - started < durationMs) {
      const t0 = Date.now();
      try {
        const res = await fetch(target, { redirect: 'manual' });
        const ms = Date.now() - t0;
        if (res.status >= 500 || res.status === 429) errors += 1;
        samples.push({ status: res.status, ms, cache: res.headers.get('x-feed-cache') });
        await res.arrayBuffer();
      } catch {
        errors += 1;
        samples.push({ status: 0, ms: Date.now() - t0, cache: null });
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const elapsed = Date.now() - started;
  const latencies = samples.map((row) => row.ms).sort((a, b) => a - b);
  const cache = {};
  for (const row of samples) {
    const key = row.cache ?? 'none';
    cache[key] = (cache[key] ?? 0) + 1;
  }
  return {
    path: pathname,
    requests: samples.length,
    errors,
    elapsedMs: elapsed,
    concurrency,
    rps: Number((samples.length / (elapsed / 1000)).toFixed(2)),
    p50Ms: percentile(latencies, 50),
    p95Ms: percentile(latencies, 95),
    maxMs: latencies.at(-1) ?? null,
    cache,
  };
}

async function main() {
  const origin = assertIsolatedLoadTarget(process.env.BASE_URL);
  const feed = await runProfile(origin, '/api/feed/home?limit=5&view=latest&period=month');
  const health = await runProfile(origin, '/api/health');
  console.log(JSON.stringify({ host: origin.host, feed, health }));
}

const isDirect = process.argv[1] && process.argv[1].endsWith('load-read-profile.mjs');
if (isDirect) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'load profile failed');
    process.exit(1);
  });
}
