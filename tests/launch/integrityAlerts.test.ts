import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  INGEST_DISCARD_MIN_SAMPLE,
  summarizeIngestDiscards,
  unhealthySources,
} from '@/lib/server/ingestDiscardSummary';
import { INTEGRITY_CHECK_SPECS } from '@/lib/server/systemIntegrity';

const failedPayload = {
  ok: false,
  startedAt: '2026-10-13T00:00:00.000Z',
  finishedAt: '2026-10-13T00:00:01.000Z',
  checks: [{ name: 'feed.home.smoke', ok: false, severity: 'critical', evidence: 'feed vacío', action: 'revisar' }],
  summary: { total: 1, failed: 1, passed: 0, warned: 0, notApplicable: 0 },
};
vi.mock('@/lib/server/cronAuth', () => ({ requireCronSecret: () => null }));
vi.mock('@/lib/moderation/releaseStaleLocks', () => ({ releaseStaleModerationLocks: async () => ({ released: 0 }) }));
vi.mock('@/lib/supabase/server', () => ({ createServerClient: () => ({}) }));
vi.mock('@/lib/server/systemIntegrity', async (orig) => ({
  ...(await orig<typeof import('@/lib/server/systemIntegrity')>()),
  runSystemIntegrityChecks: async () => failedPayload,
  persistSystemIntegrityResult: async () => undefined,
}));

describe('descartes de ingesta por código', () => {
  const rows = (n: number, status: string, error_code: string | null) => Array.from({ length: n }, () => ({ status, error_code }));

  it('cuenta descartes por código y excluye duplicados', () => {
    const s = summarizeIngestDiscards([
      ...rows(10, 'APPROVED', null),
      ...rows(8, 'REJECTED', 'PRODUCT_PAGE_UNAVAILABLE'),
      ...rows(5, 'REJECTED', 'SOURCE_TEMPORARILY_UNAVAILABLE'),
      ...rows(3, 'NEEDS_REVIEW', 'IMAGE_BLOCKED'),
      ...rows(40, 'REJECTED', 'DUPLICATE_OFFER'),
    ]);
    expect(s.total).toBe(26);
    expect(s.discarded).toBe(16);
    expect(s.byCode[0]).toEqual({ code: 'PRODUCT_PAGE_UNAVAILABLE', count: 8 });
    expect(s.violated).toBe(true);
  });

  it('no alerta con muestras pequeñas ni con tasa sana', () => {
    expect(summarizeIngestDiscards(rows(INGEST_DISCARD_MIN_SAMPLE - 1, 'ERROR', 'WRITER_FAILED')).violated).toBe(false);
    expect(summarizeIngestDiscards([...rows(15, 'APPROVED', null), ...rows(10, 'ERROR', 'WRITER_FAILED')]).violated).toBe(false);
  });

  it('fuentes caídas o con breaker abierto', () => {
    const bad = unhealthySources([
      { source_id: 'ml_api', status: 'down', breaker_state: 'open', last_error_code: 'FORBIDDEN' },
      { source_id: 'amazon', status: 'degraded', breaker_state: 'half_open', last_error_code: null },
      { source_id: 'soriana', status: 'healthy', breaker_state: 'open', last_error_code: 'RATE_LIMITED' },
    ]);
    expect(bad.map((s) => s.source_id)).toEqual(['ml_api', 'soriana']);
  });

  it('los checks nuevos avisan (WARN) y no tumban el cron si falta la tabla', () => {
    for (const name of ['hunter.source_health', 'ingest.discard_rate']) {
      expect(INTEGRITY_CHECK_SPECS[name]).toMatchObject({ onViolation: 'WARN', onSchemaMissing: 'NOT_APPLICABLE' });
    }
  });
});

describe('cron de integridad: entrega de alertas', () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.SYSTEM_ALERT_WEBHOOK_URL = 'https://hooks.example.test/secret-path-123';
    process.env.SYSTEM_ALERT_EMAIL_TO = 'ops@example.test';
    process.env.RESEND_API_KEY = 're_secret_value';
  });
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const call = async () => {
    const { GET } = await import('@/app/api/cron/system-integrity/route');
    return GET(new NextRequest('https://aventaofertas.com/api/cron/system-integrity'));
  };

  it('espera ambos envíos antes de responder y reporta el resultado', async () => {
    let resolveWebhook!: (r: Response) => void;
    const fetchMock = vi.fn((url: string) =>
      url.startsWith('https://hooks.')
        ? new Promise<Response>((r) => (resolveWebhook = r))
        : Promise.resolve(new Response('{}', { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const pending = call();
    let settled = false;
    void pending.then(() => (settled = true));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 10));
    expect(settled).toBe(false);
    resolveWebhook(new Response('', { status: 502 }));
    const res = await pending;
    expect(res.status).toBe(500);
    expect((await res.json()).alerts).toEqual(['webhook:http_502', 'email:sent']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sin canales configurados lo dice explícitamente', async () => {
    delete process.env.SYSTEM_ALERT_WEBHOOK_URL;
    delete process.env.SYSTEM_ALERT_EMAIL_TO;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await call();
    expect((await res.json()).alerts).toEqual(['none_configured']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('un fallo de red no filtra la URL ni la llave a los logs', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('connect ECONNREFUSED https://hooks.example.test/secret-path-123'); }));
    const res = await call();
    expect((await res.json()).alerts).toEqual(['webhook:network_error', 'email:network_error']);
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain('secret-path-123');
    expect(logged).not.toContain('re_secret_value');
  });
});
