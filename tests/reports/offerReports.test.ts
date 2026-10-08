import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const OFFER = '33333333-3333-4333-8333-333333333333';
const OFFER_2 = '44444444-4444-4444-8444-444444444444';

const { auth, limit } = vi.hoisted(() => ({
  auth: vi.fn(),
  limit: vi.fn(),
}));

vi.mock('@/lib/server/requireCommunityUser', () => ({
  requireBearerCommunityUser: (...args: unknown[]) => auth(...args),
}));

vi.mock('@/lib/server/rateLimit', () => ({
  enforceRateLimitCustom: (...args: unknown[]) => limit(...args),
  getClientIp: () => '203.0.113.8',
}));

vi.mock('@/lib/abuse/risk', () => ({
  evaluateAbusePolicy: () => ({ allow: true }),
}));

type Row = { id?: string; created_by?: string | null } | null;

function client(state: { offer: Row; existing: Row; inserts: Array<Record<string, unknown>> }) {
  return {
    from(table: string) {
      const chain = {
        select() {
          return chain;
        },
        eq() {
          return chain;
        },
        async maybeSingle() {
          if (table === 'offers') return { data: state.offer };
          if (table === 'offer_reports') return { data: state.existing };
          return { data: null };
        },
        async insert(payload: Record<string, unknown>) {
          state.inserts.push({ table, ...payload });
          return { error: null };
        },
      };
      return chain;
    },
  };
}

function asUser(id: string, state: { offer: Row; existing: Row; inserts: Array<Record<string, unknown>> }) {
  auth.mockResolvedValue({ user: { id, created_at: '2020-01-01T00:00:00.000Z' }, supabase: client(state) });
}

async function post(body: unknown, authorization = 'Bearer token') {
  const { POST } = await import('@/app/api/reports/route');
  return POST(new Request('http://local/api/reports', {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

describe('texto de reporte', () => {
  it('29 caracteres útiles se rechazan y 30 se aceptan', async () => {
    const { assessOfferReportText } = await import('@/lib/reports/offerReportContract');
    expect(assessOfferReportText('a'.repeat(29)).ok).toBe(false);
    expect(assessOfferReportText('a'.repeat(30)).ok).toBe(true);
    expect(assessOfferReportText(`${'a'.repeat(30)}   `).ok).toBe(true);
    expect(assessOfferReportText('a'.repeat(500)).ok).toBe(true);
    expect(assessOfferReportText('a'.repeat(501)).code).toBe('REPORT_TEXT_TOO_LONG');
    expect(assessOfferReportText('   '.repeat(40)).code).toBe('REPORT_TEXT_TOO_SHORT');
    expect(assessOfferReportText('asdf asdf asdf').code).toBe('REPORT_TEXT_TOO_SHORT');
  });
});

describe('POST /api/reports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    limit.mockResolvedValue({ success: true });
  });

  it('el primer reporte de un usuario pasa y el segundo también', async () => {
    const state = { offer: { id: OFFER, created_by: USER_B }, existing: null, inserts: [] as Array<Record<string, unknown>> };
    asUser(USER_A, state);
    const first = await post({ offerId: OFFER, reportType: 'precio_falso', comment: 'a'.repeat(30) });
    expect(first.status).toBe(200);
    state.offer = { id: OFFER_2, created_by: USER_B };
    const second = await post({ offerId: OFFER_2, reportType: 'expirada', comment: 'b'.repeat(40) });
    expect(second.status).toBe(200);
    expect(limit).toHaveBeenCalledWith(`user:${USER_A}`, 'reports');
  });

  it('otro usuario no comparte el contador', async () => {
    asUser(USER_B, { offer: { id: OFFER, created_by: USER_A }, existing: null, inserts: [] });
    await post({ offerId: OFFER, reportType: 'spam', comment: 'c'.repeat(30) });
    expect(limit).toHaveBeenCalledWith(`user:${USER_B}`, 'reports');
    expect(limit.mock.calls.some((call) => String(call[0]).includes('203.0.113.8'))).toBe(false);
  });

  it('el límite agotado no se confunde con un fallo de Redis', async () => {
    asUser(USER_A, { offer: { id: OFFER, created_by: USER_B }, existing: null, inserts: [] });
    limit.mockResolvedValueOnce({ success: false, status: 429, code: 'rate_limited' });
    const limited = await post({ offerId: OFFER, reportType: 'otro', comment: 'd'.repeat(30) });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ code: 'REPORT_RATE_LIMITED' });

    limit.mockResolvedValueOnce({ success: false, status: 503, code: 'rate_limit_backend_unavailable' });
    const down = await post({ offerId: OFFER, reportType: 'otro', comment: 'd'.repeat(30) });
    expect(down.status).toBe(503);
    const body = await down.json();
    expect(body.code).toBe('REPORT_RATE_LIMIT_UNAVAILABLE');
    expect(body.error).not.toMatch(/límite temporal de reportes/i);
  });

  it('la misma oferta del mismo usuario es duplicado', async () => {
    asUser(USER_A, { offer: { id: OFFER, created_by: USER_B }, existing: { id: 'rep' }, inserts: [] });
    const res = await post({ offerId: OFFER, reportType: 'otro', comment: 'e'.repeat(30) });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'REPORT_DUPLICATE', error: 'Ya reportaste esta oferta.' });
    expect(limit).not.toHaveBeenCalled();
  });

  it('un user_id forjado no sustituye la sesión', async () => {
    const state = { offer: { id: OFFER, created_by: USER_B }, existing: null, inserts: [] as Array<Record<string, unknown>> };
    asUser(USER_A, state);
    const res = await post({
      offerId: OFFER,
      reportType: 'spam',
      comment: 'f'.repeat(30),
      reporter_id: USER_B,
      user_id: USER_B,
      status: 'reviewed',
    });
    expect(res.status).toBe(200);
    expect(state.inserts[0]).toMatchObject({ reporter_id: USER_A, report_type: 'spam' });
    expect(state.inserts[0]).not.toHaveProperty('status');
  });

  it('una oferta inexistente y una sesión ausente se rechazan', async () => {
    asUser(USER_A, { offer: null, existing: null, inserts: [] });
    const missing = await post({ offerId: OFFER, reportType: 'spam', comment: 'g'.repeat(30) });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ code: 'REPORT_OFFER_NOT_FOUND' });

    auth.mockResolvedValue({ error: 'No autorizado', status: 401 });
    const anon = await post({ offerId: OFFER, reportType: 'spam', comment: 'g'.repeat(30) }, '');
    expect(anon.status).toBe(401);
    expect(await anon.json()).toMatchObject({ code: 'REPORT_UNAUTHORIZED' });
  });

  it('29 y 501 no pasan el servidor', async () => {
    asUser(USER_A, { offer: { id: OFFER, created_by: USER_B }, existing: null, inserts: [] });
    const short = await post({ offerId: OFFER, reportType: 'otro', comment: 'h'.repeat(29) });
    expect(await short.json()).toMatchObject({ code: 'REPORT_TEXT_TOO_SHORT' });
    const long = await post({ offerId: OFFER, reportType: 'otro', comment: 'h'.repeat(501) });
    expect(await long.json()).toMatchObject({ code: 'REPORT_TEXT_TOO_LONG' });
    const blank = await post({ offerId: OFFER, reportType: 'otro', comment: ' '.repeat(80) });
    expect(await blank.json()).toMatchObject({ code: 'REPORT_TEXT_TOO_SHORT' });
  });
});

describe('contrato visible y RLS', () => {
  it('la UI ya no pide 100 caracteres', () => {
    const page = readFileSync('app/oferta/[id]/OfferPageContent.tsx', 'utf8');
    const modal = readFileSync('app/components/OfferModal.tsx', 'utf8');
    for (const source of [page, modal]) {
      expect(source).toContain('Escribe al menos 30 caracteres.');
      expect(source).toContain('offerReportUsefulLength');
      expect(source).not.toContain('100 caracteres');
    }
  });

  it('RLS no deja insertar el reporte desde el cliente', () => {
    const sql = readFileSync('docs/supabase-migrations/20260830_beta_security_lockdown.sql', 'utf8');
    expect(sql).toContain('REVOKE ALL ON TABLE public.offer_reports FROM anon');
    expect(sql).toContain('DROP POLICY IF EXISTS offer_reports_insert_own');
    expect(sql).toContain('GRANT ALL ON TABLE public.offer_reports TO service_role');
  });
});
