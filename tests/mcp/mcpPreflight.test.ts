import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  evaluateMcpProductionPreflight,
  evaluateMcpStagingPreflight,
  evaluateStagingProvisionGuard,
  type PreflightReport,
} from '@/lib/mcp/preflight';
import { readRedisEnvironmentMarker } from '@/lib/server/redisEnvironmentMarker';

const STAGING_URL = 'https://oojshofrpbfwsiypcecr.supabase.co';
const PROD_URL = 'https://mkgsrpsuvedwwlzmzmzh.supabase.co';
const BOT = '0b0b0b0b-0000-4000-8000-000000000001';
const SECRETS = {
  UPSTASH_REDIS_REST_URL: 'https://staging-secret-host-123.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'upstash-secret-token-value-abcdef123456',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret-value-abcdef123456',
  CRON_SECRET: 'cron-secret-value-abcdef123456',
};

function previewEnv(over: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = {
    VERCEL_ENV: 'preview',
    NEXT_PUBLIC_SUPABASE_URL: STAGING_URL,
    AVENTA_SUPABASE_TARGET: 'staging',
    AVENTA_EXPECTED_SUPABASE_REF: 'oojshofrpbfwsiypcecr',
    AVENTA_REDIS_ENVIRONMENT: 'staging',
    UPSTASH_REDIS_REST_URL: SECRETS.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: SECRETS.UPSTASH_REDIS_REST_TOKEN,
    SUPABASE_SERVICE_ROLE_KEY: SECRETS.SUPABASE_SERVICE_ROLE_KEY,
    CRON_SECRET: SECRETS.CRON_SECRET,
    MCP_BOT_AUTHOR_USER_IDS: BOT,
    ...over,
  };
  for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
  return env as NodeJS.ProcessEnv;
}

const byName = (r: PreflightReport, name: string) => r.checks.find((c) => c.name === name)!;

describe('preflight MCP staging: veredicto', () => {
  it('todo presente, MCP apagado y Redis marcado como staging => READY', () => {
    const r = evaluateMcpStagingPreflight(previewEnv(), { redisMarker: 'match' });
    expect(r.verdict).toBe('READY');
    expect(byName(r, 'MCP_INGEST_ENABLED')).toMatchObject({ status: 'MISSING', ok: true });
  });

  it('proyecto staging dedicado (VERCEL_ENV=production + surface staging) => READY', () => {
    const env = previewEnv({ VERCEL_ENV: 'production', AVENTA_DEPLOYMENT_SURFACE: 'staging' });
    expect(evaluateMcpStagingPreflight(env, { redisMarker: 'match' }).verdict).toBe('READY');
  });

  it('MCP_INGEST_ENABLED=false se acepta como apagado', () => {
    const r = evaluateMcpStagingPreflight(previewEnv({ MCP_INGEST_ENABLED: 'false' }), { redisMarker: 'match' });
    expect(r.verdict).toBe('READY');
  });

  it.each(['true', '1', 'TRUE'])('MCP_INGEST_ENABLED=%s => BLOCKED', (value) => {
    const r = evaluateMcpStagingPreflight(previewEnv({ MCP_INGEST_ENABLED: value }), { redisMarker: 'match' });
    expect(r.verdict).toBe('BLOCKED');
    expect(byName(r, 'MCP_INGEST_ENABLED')).toMatchObject({ status: 'INVALID', ok: false });
  });

  it('MCP_INGEST_ENABLED con valor raro => BLOCKED', () => {
    expect(evaluateMcpStagingPreflight(previewEnv({ MCP_INGEST_ENABLED: 'yes' }), { redisMarker: 'match' }).verdict).toBe('BLOCKED');
  });

  it('sin Upstash => NOT_READY con MISSING en ambas variables y marcador sin verificar', () => {
    const r = evaluateMcpStagingPreflight(previewEnv({ UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined }));
    expect(r.verdict).toBe('NOT_READY');
    expect(byName(r, 'UPSTASH_REDIS_REST_URL').status).toBe('MISSING');
    expect(byName(r, 'UPSTASH_REDIS_REST_TOKEN').status).toBe('MISSING');
    expect(byName(r, 'redis:aventa:staging:environment')).toMatchObject({ status: 'MISSING', ok: false });
  });

  it('sin AVENTA_REDIS_ENVIRONMENT => NOT_READY (MCP respondería 503)', () => {
    const r = evaluateMcpStagingPreflight(previewEnv({ AVENTA_REDIS_ENVIRONMENT: undefined }), { redisMarker: 'match' });
    expect(r.verdict).toBe('NOT_READY');
    expect(byName(r, 'AVENTA_REDIS_ENVIRONMENT')).toMatchObject({ status: 'MISSING', severity: 'activation' });
  });

  it.each([
    ['declara production', { AVENTA_REDIS_ENVIRONMENT: 'production' }],
    ['valor no permitido', { AVENTA_REDIS_ENVIRONMENT: 'qa' }],
  ])('AVENTA_REDIS_ENVIRONMENT %s en staging => BLOCKED', (_label, over) => {
    const r = evaluateMcpStagingPreflight(previewEnv(over), { redisMarker: 'match' });
    expect(r.verdict).toBe('BLOCKED');
    expect(byName(r, 'AVENTA_REDIS_ENVIRONMENT')).toMatchObject({ status: 'INVALID', severity: 'block' });
  });

  it('Upstash con sólo espacios o URL no https => INVALID/MISSING, nunca READY', () => {
    const r1 = evaluateMcpStagingPreflight(previewEnv({ UPSTASH_REDIS_REST_TOKEN: '   ' }), { redisMarker: 'match' });
    expect(byName(r1, 'UPSTASH_REDIS_REST_TOKEN').status).toBe('MISSING');
    const r2 = evaluateMcpStagingPreflight(previewEnv({ UPSTASH_REDIS_REST_URL: 'http://x.upstash.io' }), { redisMarker: 'match' });
    expect(byName(r2, 'UPSTASH_REDIS_REST_URL').status).toBe('INVALID');
    expect([r1.verdict, r2.verdict]).toEqual(['NOT_READY', 'NOT_READY']);
  });

  it.each(['missing', 'mismatch', 'unreachable', 'not_checked'] as const)(
    'marcador de Redis %s (p. ej. Redis de producción) => NOT_READY',
    (marker) => {
      expect(evaluateMcpStagingPreflight(previewEnv(), { redisMarker: marker }).verdict).toBe('NOT_READY');
    },
  );

  it('MCP_BOT_AUTHOR_USER_IDS ausente => NOT_READY (no listo para activación)', () => {
    const r = evaluateMcpStagingPreflight(previewEnv({ MCP_BOT_AUTHOR_USER_IDS: undefined }), { redisMarker: 'match' });
    expect(r.verdict).toBe('NOT_READY');
    expect(byName(r, 'MCP_BOT_AUTHOR_USER_IDS')).toMatchObject({ status: 'MISSING', severity: 'activation' });
  });

  it('MCP_BOT_AUTHOR_USER_IDS con no-uuid o reutilizando el autor de ingesta => INVALID', () => {
    const bad = evaluateMcpStagingPreflight(previewEnv({ MCP_BOT_AUTHOR_USER_IDS: `${BOT},owner` }), { redisMarker: 'match' });
    expect(byName(bad, 'MCP_BOT_AUTHOR_USER_IDS').status).toBe('INVALID');
    const shared = evaluateMcpStagingPreflight(previewEnv({ BOT_INGEST_USER_ID: BOT }), { redisMarker: 'match' });
    expect(byName(shared, 'MCP_BOT_AUTHOR_USER_IDS').status).toBe('INVALID');
    expect([bad.verdict, shared.verdict]).toEqual(['NOT_READY', 'NOT_READY']);
  });
});

describe('preflight MCP staging: nunca contra producción', () => {
  it.each([
    ['VERCEL_ENV=production sin surface staging (Aventa Production)', { VERCEL_ENV: 'production' }],
    ['Supabase de producción', { NEXT_PUBLIC_SUPABASE_URL: PROD_URL }],
    ['AVENTA_SUPABASE_TARGET=production', { AVENTA_SUPABASE_TARGET: 'production' }],
    ['AVENTA_SUPABASE_TARGET inválido', { AVENTA_SUPABASE_TARGET: 'qa' }],
    ['AVENTA_EXPECTED_SUPABASE_REF de producción', { AVENTA_EXPECTED_SUPABASE_REF: 'mkgsrpsuvedwwlzmzmzh' }],
    ['AVENTA_EXPECTED_SUPABASE_REF ausente', { AVENTA_EXPECTED_SUPABASE_REF: undefined }],
    ['AVENTA_DEPLOYMENT_SURFACE=production', { AVENTA_DEPLOYMENT_SURFACE: 'production' }],
    ['VERCEL_ENV desconocido', { VERCEL_ENV: 'qa' }],
    ['sin URL de Supabase', { NEXT_PUBLIC_SUPABASE_URL: undefined }],
  ])('%s => BLOCKED', (_label, over) => {
    expect(evaluateMcpStagingPreflight(previewEnv(over), { redisMarker: 'match' }).verdict).toBe('BLOCKED');
  });

  it('la salida nunca contiene valores secretos', () => {
    for (const env of [previewEnv(), previewEnv({ NEXT_PUBLIC_SUPABASE_URL: PROD_URL }), previewEnv({ MCP_INGEST_ENABLED: 'true' })]) {
      const text = JSON.stringify(evaluateMcpStagingPreflight(env, { redisMarker: 'match' }));
      for (const secret of Object.values(SECRETS)) expect(text).not.toContain(secret);
      expect(text).not.toContain('staging-secret-host-123');
    }
  });

  it('cada estado es PRESENT, MISSING o INVALID', () => {
    const r = evaluateMcpStagingPreflight(previewEnv({ UPSTASH_REDIS_REST_URL: undefined }));
    for (const c of r.checks) expect(['PRESENT', 'MISSING', 'INVALID']).toContain(c.status);
  });
});

describe('guarda de aprovisionamiento del autor bot de staging', () => {
  const ok = previewEnv({ VERCEL_ENV: undefined, AVENTA_TARGET: 'staging' });

  it('staging completo => permitido', () => {
    expect(evaluateStagingProvisionGuard(ok)).toEqual({ ok: true, ref: 'oojshofrpbfwsiypcecr' });
  });

  it.each([
    ['sin AVENTA_TARGET', { AVENTA_TARGET: undefined }],
    ['AVENTA_TARGET=production', { AVENTA_TARGET: 'production' }],
    ['AVENTA_EXPECTED_SUPABASE_REF ausente', { AVENTA_EXPECTED_SUPABASE_REF: undefined }],
    ['AVENTA_EXPECTED_SUPABASE_REF de producción', { AVENTA_EXPECTED_SUPABASE_REF: 'mkgsrpsuvedwwlzmzmzh' }],
    ['URL de producción', { NEXT_PUBLIC_SUPABASE_URL: PROD_URL }],
    ['URL de otro proyecto', { NEXT_PUBLIC_SUPABASE_URL: 'https://otroproyecto.supabase.co' }],
    ['AVENTA_SUPABASE_TARGET=production', { AVENTA_SUPABASE_TARGET: 'production' }],
    ['VERCEL_ENV=production', { VERCEL_ENV: 'production' }],
    ['AVENTA_DEPLOYMENT_SURFACE=production', { AVENTA_DEPLOYMENT_SURFACE: 'production' }],
    ['sin service role', { SUPABASE_SERVICE_ROLE_KEY: undefined }],
  ])('%s => abortar', (_label, over) => {
    const r = evaluateStagingProvisionGuard({ ...ok, ...over } as NodeJS.ProcessEnv);
    expect(r.ok).toBe(false);
  });

  it('service role JWT de producción con URL de staging => abortar', () => {
    const payload = Buffer.from(JSON.stringify({ ref: 'mkgsrpsuvedwwlzmzmzh', role: 'service_role' })).toString('base64url');
    const r = evaluateStagingProvisionGuard({ ...ok, SUPABASE_SERVICE_ROLE_KEY: `eyJhbGciOiJIUzI1NiJ9.${payload}.firma` });
    expect(r).toMatchObject({ ok: false });
    expect(JSON.stringify(r)).not.toContain(payload);
  });

  it('los motivos nunca contienen la service role key', () => {
    const r = evaluateStagingProvisionGuard({ ...ok, NEXT_PUBLIC_SUPABASE_URL: PROD_URL });
    expect(JSON.stringify(r)).not.toContain(SECRETS.SUPABASE_SERVICE_ROLE_KEY);
  });
});

describe('marcador de entorno en Redis (sólo lectura)', () => {
  function fakeFetch(status: number, body: unknown) {
    return vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      async () => new Response(JSON.stringify(body), { status })
    );
  }

  it.each([
    ['staging', /\/get\/aventa%3Astaging%3Aenvironment$/],
    ['production', /\/get\/aventa%3Aproduction%3Aenvironment$/],
  ] as const)('%s: un único GET a su propio marcador y nunca escribe', async (target, path) => {
    const f = fakeFetch(200, { result: target });
    expect(await readRedisEnvironmentMarker(previewEnv(), target, f as unknown as typeof fetch)).toBe('match');
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0];
    expect(init?.method).toBe('GET');
    expect(String(url)).toMatch(path);
    expect(String(url)).not.toMatch(/\/(set|del|incr|expire)\//i);
  });

  it('nunca lee el marcador global histórico aventa:environment', async () => {
    const f = fakeFetch(200, { result: null });
    await readRedisEnvironmentMarker(previewEnv(), 'staging', f as unknown as typeof fetch);
    await readRedisEnvironmentMarker(previewEnv(), 'production', f as unknown as typeof fetch);
    for (const [url] of f.mock.calls) expect(String(url)).not.toMatch(/\/get\/aventa%3Aenvironment$/);
  });

  it.each([
    [200, { result: null }, 'missing'],
    [200, { result: 'production' }, 'mismatch'],
    [401, { error: 'unauthorized' }, 'unreachable'],
  ] as const)('HTTP %s %j => %s', async (status, body, expected) => {
    expect(await readRedisEnvironmentMarker(previewEnv(), 'staging', fakeFetch(status, body) as unknown as typeof fetch)).toBe(expected);
  });

  it('sin credenciales no consulta; con URL no https no envía el token', async () => {
    const f = fakeFetch(200, { result: 'staging' });
    expect(await readRedisEnvironmentMarker(previewEnv({ UPSTASH_REDIS_REST_TOKEN: undefined }), 'staging', f as unknown as typeof fetch)).toBe(
      'not_checked',
    );
    expect(
      await readRedisEnvironmentMarker(previewEnv({ UPSTASH_REDIS_REST_URL: 'http://x.upstash.io' }), 'staging', f as unknown as typeof fetch),
    ).toBe('unreachable');
    expect(f).not.toHaveBeenCalled();
  });
});

function productionEnv(over: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return previewEnv({
    VERCEL_ENV: 'production',
    NEXT_PUBLIC_SUPABASE_URL: PROD_URL,
    AVENTA_SUPABASE_TARGET: 'production',
    AVENTA_EXPECTED_SUPABASE_REF: 'mkgsrpsuvedwwlzmzmzh',
    AVENTA_REDIS_ENVIRONMENT: 'production',
    ...over,
  });
}

describe('preflight MCP production (sólo lectura)', () => {
  it('production completo, MCP apagado y marcador production => READY', () => {
    expect(evaluateMcpProductionPreflight(productionEnv(), { redisMarker: 'match' }).verdict).toBe('READY');
  });

  it('sin AVENTA_REDIS_ENVIRONMENT => NOT_READY (modo histórico, MCP 503)', () => {
    const r = evaluateMcpProductionPreflight(productionEnv({ AVENTA_REDIS_ENVIRONMENT: undefined }), { redisMarker: 'match' });
    expect(r.verdict).toBe('NOT_READY');
  });

  it.each([
    ['declara staging', { AVENTA_REDIS_ENVIRONMENT: 'staging' }],
    ['preview', { VERCEL_ENV: 'preview' }],
    ['local (sin VERCEL_ENV)', { VERCEL_ENV: undefined }],
    ['superficie staging', { AVENTA_DEPLOYMENT_SURFACE: 'staging' }],
    ['Supabase staging', { NEXT_PUBLIC_SUPABASE_URL: STAGING_URL }],
    ['target staging', { AVENTA_SUPABASE_TARGET: 'staging' }],
    ['MCP encendido', { MCP_INGEST_ENABLED: 'true' }],
  ])('%s => BLOCKED', (_label, over) => {
    expect(evaluateMcpProductionPreflight(productionEnv(over), { redisMarker: 'match' }).verdict).toBe('BLOCKED');
  });

  it('la salida nunca contiene valores secretos', () => {
    const text = JSON.stringify(evaluateMcpProductionPreflight(productionEnv(), { redisMarker: 'match' }));
    for (const secret of Object.values(SECRETS)) expect(text).not.toContain(secret);
  });
});

describe('Redis físico compartido: marcadores independientes por entorno', () => {
  /** Redis REST falso: responde GET /get/<key> desde un mapa y registra cualquier otra ruta. */
  function sharedRedis(store: Record<string, string>) {
    const calls: string[] = [];
    const f = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) => {
      calls.push(url);
      const m = /\/get\/([^/]+)$/.exec(url);
      const value = m ? store[decodeURIComponent(m[1])] : undefined;
      return new Response(JSON.stringify({ result: value ?? null }), { status: m ? 200 : 400 });
    });
    return { fetch: f as unknown as typeof fetch, calls };
  }

  async function stagingVerdict(store: Record<string, string>) {
    const redis = sharedRedis(store);
    const marker = await readRedisEnvironmentMarker(previewEnv(), 'staging', redis.fetch);
    return { verdict: evaluateMcpStagingPreflight(previewEnv(), { redisMarker: marker }).verdict, marker, calls: redis.calls };
  }

  async function productionVerdict(store: Record<string, string>) {
    const redis = sharedRedis(store);
    const marker = await readRedisEnvironmentMarker(productionEnv(), 'production', redis.fetch);
    return { verdict: evaluateMcpProductionPreflight(productionEnv(), { redisMarker: marker }).verdict, marker, calls: redis.calls };
  }

  const both = { 'aventa:staging:environment': 'staging', 'aventa:production:environment': 'production' };

  it('con ambos marcadores, cada entorno pasa con el suyo', async () => {
    expect((await stagingVerdict(both)).verdict).toBe('READY');
    expect((await productionVerdict(both)).verdict).toBe('READY');
  });

  it('el preflight staging falla si falta aventa:staging:environment', async () => {
    const r = await stagingVerdict({});
    expect([r.marker, r.verdict]).toEqual(['missing', 'NOT_READY']);
  });

  it('el preflight production falla si falta aventa:production:environment', async () => {
    const r = await productionVerdict({});
    expect([r.marker, r.verdict]).toEqual(['missing', 'NOT_READY']);
  });

  it('un marcador production no hace que staging pase', async () => {
    const r = await stagingVerdict({ 'aventa:production:environment': 'production', 'aventa:environment': 'staging' });
    expect([r.marker, r.verdict]).toEqual(['missing', 'NOT_READY']);
  });

  it('un marcador staging no hace que production pase', async () => {
    const r = await productionVerdict({ 'aventa:staging:environment': 'staging', 'aventa:environment': 'production' });
    expect([r.marker, r.verdict]).toEqual(['missing', 'NOT_READY']);
  });

  it('un marcador propio con el valor del otro entorno => mismatch', async () => {
    expect((await stagingVerdict({ 'aventa:staging:environment': 'production' })).marker).toBe('mismatch');
    expect((await productionVerdict({ 'aventa:production:environment': 'staging' })).marker).toBe('mismatch');
  });

  it('cada preflight sólo lee la key de su entorno', async () => {
    const s = await stagingVerdict(both);
    const p = await productionVerdict(both);
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]).toMatch(/aventa%3Astaging%3Aenvironment$/);
    expect(p.calls).toHaveLength(1);
    expect(p.calls[0]).toMatch(/aventa%3Aproduction%3Aenvironment$/);
  });
});

describe('scripts MCP de staging: estructura segura', () => {
  const root = join(__dirname, '..', '..');
  const preflight = readFileSync(join(root, 'scripts/mcp-staging-preflight.ts'), 'utf8');
  const provision = readFileSync(join(root, 'scripts/mcp-provision-staging-bot-author.ts'), 'utf8');

  it('el preflight no crea clientes ni escribe', () => {
    expect(preflight).not.toMatch(/createClient|\.insert\(|\.update\(|\.upsert\(|\.delete\(|method:\s*'(POST|PUT|DELETE)'/);
  });

  it('el aprovisionamiento usa la guarda, no crea password, roles, Rewards ni machine_clients, y no imprime la key', () => {
    expect(provision).toContain('evaluateStagingProvisionGuard(env)');
    const createUser = provision.slice(provision.indexOf('createUser({'), provision.indexOf('});', provision.indexOf('createUser({')));
    expect(createUser).toContain('email_confirm: true');
    expect(createUser).not.toMatch(/password/);
    expect(provision).not.toMatch(/from\('user_roles'\)\.(insert|upsert|update)/);
    expect(provision).not.toMatch(/from\('machine_clients'\)/);
    expect(provision).not.toMatch(/reward_program_unlocked_at:|rewards_terms_accepted_at:|commissions_accepted_at:/);
    expect(provision).not.toMatch(/console\.(log|error)\([^)]*SERVICE_ROLE/);
    expect(provision).not.toMatch(/['"`]\.env\.local['"`]/);
  });
});
