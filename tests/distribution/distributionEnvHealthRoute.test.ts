import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/health/distribution-env/route';
import { buildPublicDistributionEnvHealth } from '@/lib/distribution/cronSafety';

const STAGING_URL = 'https://oojshofrpbfwsiypcecr.supabase.co';
const SECRET = 'cron-secret-for-test';
const URL_PATH = 'http://localhost/api/health/distribution-env';

function request(headers: Record<string, string> = {}) {
  return new NextRequest(URL_PATH, { headers });
}

describe('FT-04 — /api/health/distribution-env', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', STAGING_URL);
    vi.stubEnv('CRON_SECRET', SECRET);
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('DISTRIBUTION_ENGINE_ENABLED', 'false');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('público: 200 con solo el ref resuelto (lo que leen las sondas de aislamiento)', async () => {
    const res = await GET(request());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      purpose: 'distribution_env_health',
      detail: 'public',
      health: { resolved_supabase_ref: 'oojshofrpbfwsiypcecr' },
    });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('público: no expone entorno, flags ni estado de credenciales', async () => {
    const raw = JSON.stringify(await (await GET(request())).json());
    for (const key of [
      'vercel_env',
      'deployment_surface',
      'distribution_engine_enabled',
      'cron_secret_configured',
      'telegram_staging_token_configured',
      'drain_gate',
      'production_ref',
    ]) {
      expect(raw).not.toContain(key);
    }
    expect(raw).not.toContain(SECRET);
  });

  it('secreto erróneo o en query ⇒ sigue siendo la vista pública', async () => {
    const wrong = await (await GET(request({ authorization: 'Bearer nope' }))).json();
    expect(wrong.detail).toBe('public');
    const viaQuery = await (await GET(new NextRequest(`${URL_PATH}?secret=${SECRET}`))).json();
    expect(viaQuery.detail).toBe('public');
  });

  it('con CRON_SECRET (Bearer o x-cron-secret) ⇒ detalle completo sin valores secretos', async () => {
    for (const headers of [{ authorization: `Bearer ${SECRET}` }, { 'x-cron-secret': SECRET }]) {
      const body = await (await GET(request(headers))).json();
      expect(body.detail).toBe('full');
      expect(body.health.resolved_supabase_ref).toBe('oojshofrpbfwsiypcecr');
      expect(body.health.vercel_env).toBe('preview');
      expect(body.health.cron_secret_configured).toBe(true);
      expect(JSON.stringify(body)).not.toContain(SECRET);
    }
  });

  it('sin CRON_SECRET configurado ⇒ nunca da detalle', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const body = await (await GET(request({ authorization: 'Bearer ' }))).json();
    expect(body.detail).toBe('public');
  });

  it('las sondas existentes solo dependen de health.resolved_supabase_ref', () => {
    const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
    expect(read('e2e/cases.mjs')).toContain('health?.health?.resolved_supabase_ref');
    expect(read('scripts/load-read-profile.mjs')).toContain('health?.health?.resolved_supabase_ref');
    expect(Object.keys(buildPublicDistributionEnvHealth({ NEXT_PUBLIC_SUPABASE_URL: STAGING_URL } as NodeJS.ProcessEnv))).toEqual([
      'resolved_supabase_ref',
    ]);
  });
});
