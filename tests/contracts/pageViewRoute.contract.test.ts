import { beforeEach, describe, expect, it, vi } from 'vitest';

type Limit = { success: true } | { success: false; status: 429 | 503 };

const mocks = vi.hoisted(() => ({
  observePageView: vi.fn(async () => {}),
  limits: {} as Record<string, Limit>,
  rateLimit: vi.fn(),
}));

vi.mock('@/lib/analytics/observeProductBehavior', () => ({ observePageView: mocks.observePageView }));
vi.mock('@/lib/server/rateLimit', () => ({
  enforceRateLimitCustom: mocks.rateLimit,
  getClientIp: () => '203.0.113.7',
}));

import { POST } from '@/app/api/page-view/route';
import { isPublicProductPath } from '@/lib/analytics/productEventContract';
import { resetLaunchMetricsForTests, snapshotLaunchMetrics } from '@/lib/observability/launchMetrics';

const ANON = '44444444-4444-4444-8444-444444444444';

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://aventa.mx/api/page-view', {
    method: 'POST',
    headers: { host: 'aventa.mx', 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.observePageView.mockClear();
  mocks.limits = {};
  mocks.rateLimit.mockReset();
  mocks.rateLimit.mockImplementation(async (_id: string, preset: string) => mocks.limits[preset] ?? { success: true });
  resetLaunchMetricsForTests();
});

describe('POST /api/page-view', () => {
  it('registra la vista de una ruta pública con su query de campaña', async () => {
    const res = await POST(req({ path: '/oferta/abc', search: '?utm_source=wa' }, { origin: 'https://aventa.mx' }));
    expect(res.status).toBe(204);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(mocks.observePageView).toHaveBeenCalledTimes(1);
    expect(mocks.observePageView.mock.calls[0][1]).toEqual({ path: '/oferta/abc', search: '?utm_source=wa' });
  });

  it('ignora origen cruzado sin registrar ni consumir rate limit', async () => {
    const res = await POST(req({ path: '/' }, { origin: 'https://evil.example' }));
    expect(res.status).toBe(204);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.observePageView).not.toHaveBeenCalled();
  });

  it.each(['/admin', '/admin/moderacion', '/api/feed/home', '/equipo', '/auth/reset-password'])(
    'ruta no pública %s ⇒ no registra',
    async (path) => {
      const res = await POST(req({ path }));
      expect(res.status).toBe(204);
      expect(mocks.observePageView).not.toHaveBeenCalled();
    },
  );

  it('cuerpo inválido ⇒ 204 sin registrar', async () => {
    const res = await POST(req('no-json'));
    expect(res.status).toBe(204);
    expect(mocks.observePageView).not.toHaveBeenCalled();
  });

  it('search sin "?" se descarta y se recorta a 512', async () => {
    await POST(req({ path: '/', search: 'utm_source=x' }));
    expect(mocks.observePageView.mock.calls[0][1]).toEqual({ path: '/', search: '' });
    await POST(req({ path: '/', search: '?' + 'a'.repeat(2_000) }));
    expect((mocks.observePageView.mock.calls[1][1] as { search: string }).search).toHaveLength(512);
  });

  it('/auth no es superficie de producto (tokens en la query)', () => {
    expect(isPublicProductPath('/auth/callback')).toBe(false);
    expect(isPublicProductPath('/oferta/x')).toBe(true);
  });
});

describe('POST /api/page-view — política de límites', () => {
  it('con cookie anónima válida aplica el límite por identidad y después el de IP', async () => {
    await POST(req({ path: '/' }, { cookie: `foo=1; aventa_anon=${ANON}` }));
    expect(mocks.rateLimit.mock.calls).toEqual([
      [`page_view:anon:${ANON}`, 'pageViewActor'],
      ['page_view:203.0.113.7', 'pageView'],
    ]);
    expect(mocks.observePageView).toHaveBeenCalledTimes(1);
  });

  it('sin cookie (o con una inválida) solo aplica el límite por IP, que no se puede falsificar', async () => {
    await POST(req({ path: '/' }));
    await POST(req({ path: '/' }, { cookie: 'aventa_anon=no-es-un-uuid' }));
    expect(mocks.rateLimit.mock.calls).toEqual([
      ['page_view:203.0.113.7', 'pageView'],
      ['page_view:203.0.113.7', 'pageView'],
    ]);
  });

  it('identidad excedida ⇒ 429 con scope=actor, sin consumir el cupo de la IP', async () => {
    mocks.limits.pageViewActor = { success: false, status: 429 };
    const res = await POST(req({ path: '/' }, { cookie: `aventa_anon=${ANON}` }));
    expect(res.status).toBe(429);
    expect(res.headers.get('x-rate-limit-scope')).toBe('actor');
    expect(mocks.rateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.observePageView).not.toHaveBeenCalled();
    expect(snapshotLaunchMetrics().analytics_rate_limited).toBe(1);
  });

  it('cambiar de cookie no evade el techo por IP ⇒ 429 con scope=ip (no descarte silencioso)', async () => {
    mocks.limits.pageView = { success: false, status: 429 };
    const res = await POST(req({ path: '/' }, { cookie: `aventa_anon=${ANON}` }));
    expect(res.status).toBe(429);
    expect(res.headers.get('x-rate-limit-scope')).toBe('ip');
    expect(mocks.observePageView).not.toHaveBeenCalled();
    expect(snapshotLaunchMetrics().analytics_rate_limited).toBe(1);
  });

  it('backend de límites caído ⇒ se propaga su estado (503), no se registra', async () => {
    mocks.limits.pageView = { success: false, status: 503 };
    const res = await POST(req({ path: '/' }));
    expect(res.status).toBe(503);
    expect(mocks.observePageView).not.toHaveBeenCalled();
  });
});
