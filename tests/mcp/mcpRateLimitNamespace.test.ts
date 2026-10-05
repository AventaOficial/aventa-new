import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isKeyInEnvironment, scopedRedisKey } from '@/lib/server/redisEnvironment';

/** Un único Redis físico compartido por todos los entornos: registra cada key leída o escrita. */
const shared = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  touched: [] as string[],
  limiterOptions: [] as Array<Record<string, unknown>>,
  behavior: 'ok' as 'ok' | 'blocked' | 'throw',
}));

vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor(public opts: unknown) {}
    async get(key: string) {
      shared.touched.push(key);
      return shared.store.get(key) ?? null;
    }
    async set(key: string, value: unknown) {
      shared.touched.push(key);
      shared.store.set(key, value);
      return 'OK';
    }
    async incr(key: string) {
      shared.touched.push(key);
      const next = Number(shared.store.get(key) ?? 0) + 1;
      shared.store.set(key, next);
      return next;
    }
  },
}));

vi.mock('@upstash/ratelimit', () => {
  class Ratelimit {
    static slidingWindow = (limit: number, window: string) => ({ limit, window });
    private prefix: string;
    constructor(opts: Record<string, unknown>) {
      shared.limiterOptions.push(opts);
      this.prefix = typeof opts.prefix === 'string' ? opts.prefix : '@upstash/ratelimit';
    }
    async limit(identifier: string) {
      shared.touched.push(`${this.prefix}:${identifier}`);
      if (shared.behavior === 'throw') throw new Error('redis down');
      return { success: shared.behavior === 'ok' };
    }
  }
  return { Ratelimit };
});

const metrics = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock('@/lib/observability/launchMetrics', () => ({
  incrementLaunchMetric: (name: string) => metrics.calls.push(name),
}));

const prevEnv = { ...process.env };
const UNAVAILABLE = { success: false, status: 503, code: 'rate_limit_backend_unavailable' };
const MARKERS = { 'aventa:staging:environment': 'staging', 'aventa:production:environment': 'production' };

const RUNTIMES = {
  preview: { VERCEL_ENV: 'preview', AVENTA_REDIS_ENVIRONMENT: 'staging' },
  stagingProject: {
    VERCEL_ENV: 'production',
    AVENTA_DEPLOYMENT_SURFACE: 'staging',
    AVENTA_SUPABASE_TARGET: 'staging',
    AVENTA_REDIS_ENVIRONMENT: 'staging',
  },
  production: { VERCEL_ENV: 'production', AVENTA_SUPABASE_TARGET: 'production', AVENTA_REDIS_ENVIRONMENT: 'production' },
} as const;

function setEnv(over: Record<string, string | undefined>) {
  for (const k of ['VERCEL_ENV', 'AVENTA_DEPLOYMENT_SURFACE', 'AVENTA_SUPABASE_TARGET', 'AVENTA_REDIS_ENVIRONMENT']) {
    delete process.env[k];
  }
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

function seed(markers: Record<string, string>) {
  shared.store.clear();
  for (const [k, v] of Object.entries(markers)) shared.store.set(k, v);
}

async function load() {
  vi.resetModules();
  return import('@/lib/server/rateLimit');
}

async function loadFeedCache() {
  vi.resetModules();
  return import('@/lib/server/feedCache');
}

beforeEach(() => {
  shared.touched.length = 0;
  shared.limiterOptions.length = 0;
  shared.behavior = 'ok';
  metrics.calls.length = 0;
  seed(MARKERS);
  process.env.UPSTASH_REDIS_REST_URL = 'https://shared.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'token-token-token-token';
  process.env.FEED_CACHE_ENABLED = 'true';
  process.env.FEED_CACHE_TTL_SECONDS = '45';
});
afterEach(() => {
  process.env = { ...prevEnv };
});

describe('Redis compartido: cada entorno sólo toca su namespace', () => {
  it.each([
    ['preview', RUNTIMES.preview, 'staging'],
    ['proyecto staging', RUNTIMES.stagingProject, 'staging'],
    ['production', RUNTIMES.production, 'production'],
  ] as const)('%s: rate limit MCP y no MCP sólo bajo aventa:%s:*', async (_label, runtime, envName) => {
    setEnv(runtime);
    const other = envName === 'staging' ? 'production' : 'staging';
    const { enforceRateLimitCustom } = await load();
    expect(await enforceRateLimitCustom('mcp:c1', 'mcp')).toEqual({ success: true });
    expect(await enforceRateLimitCustom('feed:1.2.3.4', 'feed')).toEqual({ success: true });
    expect(shared.limiterOptions.map((o) => o.prefix)).toEqual([`aventa:${envName}:ratelimit`, `aventa:${envName}:ratelimit`]);
    expect(shared.touched.length).toBeGreaterThan(0);
    for (const key of shared.touched) {
      expect(key.startsWith(`aventa:${envName}:`)).toBe(true);
      expect(key.startsWith(`aventa:${other}:`)).toBe(false);
    }
  });

  it.each([
    ['preview', RUNTIMES.preview, 'staging'],
    ['production', RUNTIMES.production, 'production'],
  ] as const)('%s: el feed cache lee/escribe sólo bajo aventa:%s:*', async (_label, runtime, envName) => {
    setEnv(runtime);
    const feed = await loadFeedCache();
    await feed.setCachedHomeFeed({ limit: 20, type: 'trending' }, { success: true, data: [], nextCursor: null });
    await feed.getCachedHomeFeed({ limit: 20, type: 'trending' });
    await feed.invalidateHomeFeedCache();
    for (const key of shared.touched) expect(key.startsWith(`aventa:${envName}:`)).toBe(true);
    expect(shared.store.has(`aventa:${envName}:feed:home:ver`)).toBe(true);
  });

  it('staging y production con la misma identidad no comparten contadores ni cache', async () => {
    setEnv(RUNTIMES.preview);
    const staging = await load();
    await staging.enforceRateLimitCustom('mcp:same-client', 'mcp');
    const stagingFeed = await loadFeedCache();
    await stagingFeed.invalidateHomeFeedCache();
    const stagingKeys = [...shared.touched];
    shared.touched.length = 0;

    setEnv(RUNTIMES.production);
    const production = await load();
    await production.enforceRateLimitCustom('mcp:same-client', 'mcp');
    const productionFeed = await loadFeedCache();
    await productionFeed.invalidateHomeFeedCache();
    const productionKeys = [...shared.touched];

    expect(stagingKeys.filter((k) => productionKeys.includes(k))).toEqual([]);
    expect(shared.store.get('aventa:staging:feed:home:ver')).toBe(1);
    expect(shared.store.get('aventa:production:feed:home:ver')).toBe(1);
  });

  it('una identidad hostil no saca la key de su namespace', async () => {
    setEnv(RUNTIMES.preview);
    const { enforceRateLimitCustom } = await load();
    await enforceRateLimitCustom('aventa:production:ratelimit:victim', 'mcp');
    for (const key of shared.touched) expect(key.startsWith('aventa:staging:')).toBe(true);
  });
});

describe('scopedRedisKey: ningún namespace reutiliza una key del otro', () => {
  it('staging rechaza una key absoluta de production', () => {
    expect(() => scopedRedisKey('staging', 'aventa:production:feed:home:ver')).toThrow();
    expect(() => scopedRedisKey('staging', 'aventa:staging:feed:home:ver')).toThrow();
    expect(() => scopedRedisKey('staging', ':feed')).toThrow();
    expect(() => scopedRedisKey('staging', '')).toThrow();
  });

  it('production rechaza una key absoluta de staging', () => {
    expect(() => scopedRedisKey('production', 'aventa:staging:ratelimit:x')).toThrow();
    expect(() => scopedRedisKey('production', 'AVENTA:staging:x')).toThrow();
  });

  it('las keys construidas quedan siempre en su namespace', () => {
    const s = scopedRedisKey('staging', 'feed:home:ver');
    const p = scopedRedisKey('production', 'feed:home:ver');
    expect([s, p]).toEqual(['aventa:staging:feed:home:ver', 'aventa:production:feed:home:ver']);
    expect([isKeyInEnvironment('staging', s), isKeyInEnvironment('production', s)]).toEqual([true, false]);
    expect([isKeyInEnvironment('production', p), isKeyInEnvironment('staging', p)]).toEqual([true, false]);
  });
});

describe('entorno inconsistente: MCP 503 sin tocar Redis, nunca cambia de entorno', () => {
  it.each([
    ['preview sin declarar', { VERCEL_ENV: 'preview' }],
    ['preview declarando production', { VERCEL_ENV: 'preview', AVENTA_REDIS_ENVIRONMENT: 'production' }],
    ['production declarando staging', { VERCEL_ENV: 'production', AVENTA_SUPABASE_TARGET: 'production', AVENTA_REDIS_ENVIRONMENT: 'staging' }],
    ['proyecto staging declarando production', { ...RUNTIMES.stagingProject, AVENTA_REDIS_ENVIRONMENT: 'production' }],
    ['local declarando production', { AVENTA_REDIS_ENVIRONMENT: 'production', AVENTA_SUPABASE_TARGET: 'production' }],
    ['local sin declarar', {}],
    ['staging con target Supabase production', { VERCEL_ENV: 'preview', AVENTA_REDIS_ENVIRONMENT: 'staging', AVENTA_SUPABASE_TARGET: 'production' }],
    ['production con target Supabase staging', { VERCEL_ENV: 'production', AVENTA_SUPABASE_TARGET: 'staging', AVENTA_REDIS_ENVIRONMENT: 'production' }],
    ['valor declarado no permitido', { VERCEL_ENV: 'preview', AVENTA_REDIS_ENVIRONMENT: 'qa' }],
    ['surface no válida', { VERCEL_ENV: 'production', AVENTA_DEPLOYMENT_SURFACE: 'qa', AVENTA_REDIS_ENVIRONMENT: 'staging' }],
    ['VERCEL_ENV desconocido', { VERCEL_ENV: 'qa', AVENTA_REDIS_ENVIRONMENT: 'staging' }],
    ['target Supabase inválido', { VERCEL_ENV: 'preview', AVENTA_REDIS_ENVIRONMENT: 'staging', AVENTA_SUPABASE_TARGET: 'qa' }],
  ])('%s', async (_label, runtime) => {
    setEnv(runtime);
    const { enforceRateLimitCustom } = await load();
    expect(await enforceRateLimitCustom('mcp:c1', 'mcp')).toEqual(UNAVAILABLE);
    expect(shared.touched).toEqual([]);
    expect(shared.limiterOptions).toHaveLength(0);
  });

  it('preview sin declarar: el feed cache no toca Redis', async () => {
    setEnv({ VERCEL_ENV: 'preview' });
    const feed = await loadFeedCache();
    expect(await feed.invalidateHomeFeedCache()).toBe(false);
    expect(await feed.getCachedHomeFeed({ limit: 20, type: 'trending' })).toBeNull();
    expect(shared.touched).toEqual([]);
  });
});

describe('marcador de entorno verificado en runtime', () => {
  it.each([
    ['falta el marcador de staging', {}],
    ['sólo existe el marcador de production', { 'aventa:production:environment': 'production' }],
    ['sólo existe el marcador global histórico', { 'aventa:environment': 'staging' }],
    ['marcador de staging con valor production', { 'aventa:staging:environment': 'production' }],
  ])('staging, %s => MCP 503 sin crear limitador', async (_label, markers) => {
    setEnv(RUNTIMES.preview);
    seed(markers);
    const { enforceRateLimitCustom } = await load();
    expect(await enforceRateLimitCustom('mcp:c1', 'mcp')).toEqual(UNAVAILABLE);
    expect(shared.limiterOptions).toHaveLength(0);
    expect(shared.touched).toEqual(['aventa:staging:environment']);
  });

  it.each([
    ['falta el marcador de production', {}],
    ['sólo existe el marcador de staging', { 'aventa:staging:environment': 'staging' }],
    ['marcador de production con valor staging', { 'aventa:production:environment': 'staging' }],
  ])('production, %s => MCP 503 y críticos 503', async (_label, markers) => {
    setEnv(RUNTIMES.production);
    seed(markers);
    const { enforceRateLimitCustom } = await load();
    expect(await enforceRateLimitCustom('mcp:c1', 'mcp')).toEqual(UNAVAILABLE);
    expect(await enforceRateLimitCustom('offers:u1', 'offers')).toEqual(UNAVAILABLE);
    expect(shared.limiterOptions).toHaveLength(0);
    for (const key of shared.touched) expect(key).toBe('aventa:production:environment');
  });

  it('marcador incorrecto: el feed cache se desactiva en vez de usar otro namespace', async () => {
    setEnv(RUNTIMES.preview);
    seed({ 'aventa:production:environment': 'production' });
    const feed = await loadFeedCache();
    expect(await feed.invalidateHomeFeedCache()).toBe(false);
    expect(shared.touched).toEqual(['aventa:staging:environment']);
  });

  it('un marcador válido se cachea por instancia (no hay un GET por petición)', async () => {
    setEnv(RUNTIMES.preview);
    const { enforceRateLimitCustom } = await load();
    for (let i = 0; i < 5; i++) await enforceRateLimitCustom('mcp:c1', 'mcp');
    expect(shared.touched.filter((k) => k === 'aventa:staging:environment')).toHaveLength(1);
  });
});

describe('Aventa Production sin AVENTA_REDIS_ENVIRONMENT (modo histórico)', () => {
  beforeEach(() => setEnv({ VERCEL_ENV: 'production', AVENTA_SUPABASE_TARGET: 'production' }));

  it('MCP responde 503: el modo histórico nunca habilita MCP', async () => {
    const { enforceRateLimitCustom } = await load();
    expect(await enforceRateLimitCustom('mcp:c1', 'mcp')).toEqual(UNAVAILABLE);
  });

  it('los demás presets conservan su prefijo histórico y nunca escriben bajo aventa:staging:*', async () => {
    const { enforceRateLimitCustom } = await load();
    expect(await enforceRateLimitCustom('offers:u1', 'offers')).toEqual({ success: true });
    expect(shared.limiterOptions.at(-1)).not.toHaveProperty('prefix');
    for (const key of shared.touched) expect(key.startsWith('aventa:staging:')).toBe(false);
  });

  it('el feed cache conserva sus keys históricas aventa:feed:*', async () => {
    const feed = await loadFeedCache();
    await feed.invalidateHomeFeedCache();
    expect(shared.touched).toEqual(['aventa:feed:home:ver']);
  });
});

describe('MCP nunca cae a memoria', () => {
  it.each([
    ['production', RUNTIMES.production],
    ['proyecto staging', RUNTIMES.stagingProject],
    ['preview', RUNTIMES.preview],
    ['local', {}],
  ] as const)('%s sin Upstash => 503 en cada petición', async (_label, runtime) => {
    setEnv(runtime);
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const { enforceRateLimitCustom } = await load();
    for (let i = 0; i < 25; i++) expect(await enforceRateLimitCustom('mcp:c1', 'mcp')).toEqual(UNAVAILABLE);
    expect(metrics.calls).not.toContain('rate_limit_memory_fallback');
  });

  it.each([
    ['Redis lanza error', 'throw'],
  ] as const)('%s => 503 (nunca memoria ni 500)', async (_label, behavior) => {
    setEnv(RUNTIMES.preview);
    shared.behavior = behavior;
    const { enforceRateLimitCustom } = await load();
    expect(await enforceRateLimitCustom('mcp:c1', 'mcp')).toEqual(UNAVAILABLE);
    expect(metrics.calls).not.toContain('rate_limit_memory_fallback');
  });

  it('marcador o entorno incoherente => ninguna petición MCP usa memoria', async () => {
    for (const runtime of [{ VERCEL_ENV: 'preview' }, { ...RUNTIMES.preview, AVENTA_REDIS_ENVIRONMENT: 'production' }]) {
      setEnv(runtime);
      const { enforceRateLimitCustom } = await load();
      expect(await enforceRateLimitCustom('mcp:c1', 'mcp')).toEqual(UNAVAILABLE);
    }
    setEnv(RUNTIMES.preview);
    seed({});
    const { enforceRateLimitCustom } = await load();
    expect(await enforceRateLimitCustom('mcp:c1', 'mcp')).toEqual(UNAVAILABLE);
    expect(metrics.calls).not.toContain('rate_limit_memory_fallback');
  });

  it('bloqueado por Redis => 429', async () => {
    setEnv(RUNTIMES.preview);
    shared.behavior = 'blocked';
    const { enforceRateLimitCustom } = await load();
    expect(await enforceRateLimitCustom('mcp:c1', 'mcp')).toEqual({ success: false, status: 429, code: 'rate_limited' });
  });

  it('variables Upstash con sólo espacios => 503', async () => {
    setEnv(RUNTIMES.preview);
    process.env.UPSTASH_REDIS_REST_URL = '   ';
    process.env.UPSTASH_REDIS_REST_TOKEN = '   ';
    const { enforceRateLimitCustom } = await load();
    expect(await enforceRateLimitCustom('mcp:c1', 'mcp')).toEqual(UNAVAILABLE);
    expect(shared.limiterOptions).toHaveLength(0);
  });
});

describe('estructura: un único punto de acceso a Redis', () => {
  const root = process.cwd();
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.(ts|tsx)$/.test(name)) out.push(relative(root, p).replace(/\\/g, '/'));
    }
    return out;
  }
  const sources = [...walk(join(root, 'lib')), ...walk(join(root, 'app'))].map((path) => ({
    path,
    text: readFileSync(join(root, path), 'utf8'),
  }));

  it('sólo redisClient.ts crea clientes de @upstash/redis', () => {
    const users = sources.filter((s) => /from ['"]@upstash\/redis['"]/.test(s.text) && !/import type/.test(s.text.match(/.*@upstash\/redis.*/)?.[0] ?? ''));
    expect(users.map((s) => s.path)).toEqual(['lib/server/redisClient.ts']);
  });

  it('sólo scopedRedis.ts y rateLimit.ts usan el cliente Redis crudo', () => {
    const users = sources.filter((s) => /\bgetUpstashRedis\b/.test(s.text) && s.path !== 'lib/server/redisClient.ts');
    expect(users.map((s) => s.path).sort()).toEqual(['lib/server/rateLimit.ts', 'lib/server/scopedRedis.ts']);
  });

  it('ningún código de la app usa el marcador global aventa:environment', () => {
    for (const s of sources) expect(s.text).not.toMatch(/['"`]aventa:environment['"`]/);
  });
});
