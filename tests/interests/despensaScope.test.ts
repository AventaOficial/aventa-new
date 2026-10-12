import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/requireMeUser', () => ({
  requireBearerMeUser: vi.fn(),
  meAuthFailureResponse: (failure: { error: string; status: number }) =>
    Response.json({ error: failure.error }, { status: failure.status }),
}));

vi.mock('@/lib/server/rateLimit', () => ({
  enforceRateLimit: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/lib/analytics/recordProductEvent', () => ({
  recordProductEvent: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/lib/interests/store', () => ({
  insertInterest: vi.fn(),
  listInterests: vi.fn(),
  loadMatchCandidates: vi.fn(),
  buildInterestView: vi.fn(),
}));

import { requireBearerMeUser } from '@/lib/server/requireMeUser';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { buildInterestView, listInterests, loadMatchCandidates } from '@/lib/interests/store';
import { GET } from '@/app/api/me/interests/route';
import { DESPENSA_CATALOG_VERSION } from '@/lib/despensa/catalog';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const sessionClient = { from: () => ({}) };
const authOk = { user: { id: USER }, supabase: sessionClient };
const request = (qs = '?scope=despensa') =>
  new Request(`https://aventa.test/api/me/interests${qs}`, { headers: { Authorization: 'Bearer t' } });

describe('GET /api/me/interests?scope=despensa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(enforceRateLimit).mockResolvedValue({ success: true } as never);
  });

  it('rechaza anónimos sin leer intereses', async () => {
    vi.mocked(requireBearerMeUser).mockResolvedValue({ error: 'No autorizado', status: 401 });
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(listInterests).not.toHaveBeenCalled();
    expect(enforceRateLimit).not.toHaveBeenCalled();
  });

  it('es una lectura: pide la sesión sin modo de escritura', async () => {
    vi.mocked(requireBearerMeUser).mockResolvedValue(authOk as never);
    vi.mocked(listInterests).mockResolvedValue([] as never);
    await GET(request());
    expect(vi.mocked(requireBearerMeUser).mock.calls[0][1]).toEqual({ mutate: false });
  });

  it('respeta el rate limit del usuario antes de leer', async () => {
    vi.mocked(requireBearerMeUser).mockResolvedValue(authOk as never);
    vi.mocked(enforceRateLimit).mockResolvedValue({ success: false } as never);
    const res = await GET(request());
    expect(res.status).toBe(429);
    expect(enforceRateLimit).toHaveBeenCalledWith(`interests:${USER}`);
    expect(listInterests).not.toHaveBeenCalled();
  });

  it('devuelve solo ids de necesidad ordenados y sin duplicar, con la versión del catálogo', async () => {
    vi.mocked(requireBearerMeUser).mockResolvedValue(authOk as never);
    vi.mocked(listInterests).mockResolvedValue([
      { label: 'Pañales etapa 4', aliases: ['toallitas húmedas'] },
      { label: 'Pañales recién nacido', aliases: [] },
      { label: 'iPhone 15', aliases: [] },
    ] as never);
    const res = await GET(request());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ needIds: ['bebes.panales', 'bebes.toallitas'], catalogVersion: DESPENSA_CATALOG_VERSION });
    expect(JSON.stringify(body)).not.toMatch(/iPhone|etapa 4|toallitas húmedas/);
    expect(loadMatchCandidates).not.toHaveBeenCalled();
  });

  it('sin intereses devuelve una lista vacía, no un error', async () => {
    vi.mocked(requireBearerMeUser).mockResolvedValue(authOk as never);
    vi.mocked(listInterests).mockResolvedValue([] as never);
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect((await res.json()).needIds).toEqual([]);
  });

  it('solo lee al usuario de la sesión, con su cliente; ignora un user_id en la URL', async () => {
    vi.mocked(requireBearerMeUser).mockResolvedValue(authOk as never);
    vi.mocked(listInterests).mockResolvedValue([] as never);
    await GET(request(`?scope=despensa&user_id=${OTHER}&userId=${OTHER}`));
    expect(listInterests).toHaveBeenCalledTimes(1);
    expect(vi.mocked(listInterests).mock.calls[0][0]).toBe(sessionClient);
    expect(vi.mocked(listInterests).mock.calls[0][1]).toBe(USER);
  });

  it('otro valor de scope sigue el listado normal', async () => {
    vi.mocked(requireBearerMeUser).mockResolvedValue(authOk as never);
    vi.mocked(listInterests).mockResolvedValue([] as never);
    vi.mocked(loadMatchCandidates).mockResolvedValue([] as never);
    vi.mocked(buildInterestView).mockReturnValue({ matches: [], discovery: [] } as never);
    for (const qs of ['?scope=DESPENSA', '?scope=otra', '']) {
      const res = await GET(request(qs));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ interests: [], matches: [], discovery: [] });
    }
    expect(loadMatchCandidates).toHaveBeenCalledTimes(3);
  });

  it('si la lectura falla responde 503 sin exponer el error', async () => {
    vi.mocked(requireBearerMeUser).mockResolvedValue(authOk as never);
    vi.mocked(listInterests).mockRejectedValue(new Error('relation user_product_interests does not exist'));
    const res = await GET(request());
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain('user_product_interests');
  });
});
