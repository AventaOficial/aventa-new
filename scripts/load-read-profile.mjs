/**
 * Lecturas reproducibles contra un entorno aislado.
 * Uso: BASE_URL=https://<preview> LOAD_PROFILE=base node scripts/load-read-profile.mjs
 */
const PRODUCTION_HOSTS = new Set(['aventaofertas.com', 'www.aventaofertas.com']);
const PRODUCTION_SUPABASE_REF = 'mkgsrpsuvedwwlzmzmzh';
const MAX_CONCURRENCY = 12;
const MAX_DURATION_MS = 20_000;

export const LOAD_PROFILES = {
  base: { concurrency: 2, durationMs: 8_000 },
  growth: { concurrency: 4, durationMs: 10_000 },
  elevated: { concurrency: 8, durationMs: 12_000 },
  stress: { concurrency: 12, durationMs: 15_000 },
};

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

export function assertIsolatedDeployment(health) {
  const ref = health?.health?.resolved_supabase_ref ?? health?.resolved_supabase_ref ?? null;
  if (ref === PRODUCTION_SUPABASE_REF) {
    throw new Error('load profile refused: production supabase');
  }
  if (ref !== 'oojshofrpbfwsiypcecr') {
    throw new Error('load profile refused: target is not the isolated staging project');
  }
  return ref;
}

export function resolveLoadProfile(name) {
  const key = String(name ?? 'base').trim().toLowerCase();
  const profile = LOAD_PROFILES[key];
  if (!profile) throw new Error('load profile refused: unknown profile');
  if (profile.concurrency > MAX_CONCURRENCY || profile.durationMs > MAX_DURATION_MS) {
    throw new Error('load profile refused: limits exceeded');
  }
  return { name: key, ...profile };
}

export function classifySample(status) {
  if (status >= 200 && status < 300) return 'success';
  if (status === 429) return 'rate_limited';
  if (status >= 400 && status < 500) return 'client_error';
  if (status >= 500) return 'server_error';
  return 'network_error';
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

export async function runReadProfile(origin, pathname, profile) {
  const target = new URL(pathname, origin).toString();
  const samples = [];
  const started = Date.now();

  async function worker() {
    while (Date.now() - started < profile.durationMs) {
      const t0 = Date.now();
      try {
        const res = await fetch(target, { redirect: 'manual' });
        samples.push({
          status: res.status,
          ms: Date.now() - t0,
          cache: res.headers.get('x-feed-cache'),
          class: classifySample(res.status),
        });
        await res.arrayBuffer();
      } catch {
        samples.push({ status: 0, ms: Date.now() - t0, cache: null, class: 'network_error' });
      }
    }
  }

  await Promise.all(Array.from({ length: profile.concurrency }, () => worker()));
  const elapsed = Date.now() - started;
  const successes = samples.filter((row) => row.class === 'success');
  const latencies = successes.map((row) => row.ms).sort((a, b) => a - b);
  const codes = {};
  const cache = {};
  const classes = {};
  for (const row of samples) {
    codes[row.status] = (codes[row.status] ?? 0) + 1;
    classes[row.class] = (classes[row.class] ?? 0) + 1;
    const key = row.cache ?? 'none';
    cache[key] = (cache[key] ?? 0) + 1;
  }
  return {
    path: pathname,
    requests: samples.length,
    success: successes.length,
    errors: samples.length - successes.length,
    elapsedMs: elapsed,
    concurrency: profile.concurrency,
    rps: Number((successes.length / (elapsed / 1000)).toFixed(2)),
    p50Ms: percentile(latencies, 50),
    p95Ms: percentile(latencies, 95),
    p99Ms: percentile(latencies, 99),
    codes,
    classes,
    cache,
  };
}

async function main() {
  const origin = assertIsolatedLoadTarget(process.env.BASE_URL);
  const profile = resolveLoadProfile(process.env.LOAD_PROFILE);
  const probe = await fetch(new URL('/api/health/distribution-env', origin), { redirect: 'manual' });
  if (probe.status !== 200) throw new Error('load profile refused: distribution env unavailable');
  const body = await probe.json();
  const ref = assertIsolatedDeployment(body);
  const feed = await runReadProfile(origin, '/api/feed/home?limit=5&view=top&period=month', profile);
  const health = await runReadProfile(origin, '/api/health', profile);
  console.log(JSON.stringify({
    host: origin.host,
    supabaseRef: ref,
    profile: profile.name,
    writes: 0,
    feed,
    health,
  }));
}

const isDirect = process.argv[1] && process.argv[1].endsWith('load-read-profile.mjs');
if (isDirect) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'load profile failed');
    process.exit(1);
  });
}
