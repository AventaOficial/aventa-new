import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
import { listInterests, loadMatchCandidates } from '@/lib/interests/store';
import { GET } from '@/app/api/me/interests/route';
import { DESPENSA_CATALOG_VERSION } from '@/lib/despensa/catalog';
import { fetchDespensaPreferredNeeds, processHomeFeedList } from '@/lib/offers/homeFeedClient';

const USER = '11111111-1111-4111-8111-111111111111';
const authOk = { user: { id: USER }, supabase: { from: () => ({}) } };
const request = (qs = '?scope=despensa') =>
  new Request(`https://aventa.test/api/me/interests${qs}`, { headers: { Authorization: 'Bearer t' } });

describe('GET /api/me/interests?scope=despensa', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rechaza anónimos sin leer intereses', async () => {
    vi.mocked(requireBearerMeUser).mockResolvedValue({ error: 'No autorizado', status: 401 });
    expect((await GET(request())).status).toBe(401);
    expect(listInterests).not.toHaveBeenCalled();
  });

  it('devuelve solo ids de necesidad del usuario de la sesión, con la versión del catálogo', async () => {
    vi.mocked(requireBearerMeUser).mockResolvedValue(authOk as never);
    vi.mocked(listInterests).mockResolvedValue([
      { label: 'Pañales etapa 4', aliases: ['toallitas húmedas'] },
      { label: 'iPhone 15', aliases: [] },
    ] as never);
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      needIds: ['bebes.panales', 'bebes.toallitas'],
      catalogVersion: DESPENSA_CATALOG_VERSION,
    });
    expect(vi.mocked(listInterests).mock.calls[0][1]).toBe(USER);
    expect(loadMatchCandidates).not.toHaveBeenCalled();
    expect(enforceRateLimit).toHaveBeenCalledWith(`interests:${USER}`);
  });

  it('si la lectura falla responde 503 sin exponer el error', async () => {
    vi.mocked(requireBearerMeUser).mockResolvedValue(authOk as never);
    vi.mocked(listInterests).mockRejectedValue(new Error('relation does not exist'));
    const res = await GET(request());
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain('relation');
  });
});

describe('cliente de preferencias de Despensa', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sin sesión no llama al API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await fetchDespensaPreferredNeeds(null)).size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cualquier fallo deja el ranking sin preferencias', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 503 })));
    expect((await fetchDespensaPreferredNeeds('t')).size).toBe(0);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect((await fetchDespensaPreferredNeeds('t')).size).toBe(0);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ needIds: ['bebes.panales', 7, null] })));
    expect([...(await fetchDespensaPreferredNeeds('t'))]).toEqual(['bebes.panales']);
  });
});

describe('las reglas de Despensa solo afectan Día a día', () => {
  const NOW = new Date().toISOString();
  const offer = (id: string, title: string, score: number, upvotes: number, origin: 'community' | 'machine' = 'community') => ({
    id,
    title,
    discountPrice: 50,
    upvotes,
    createdAt: NOW,
    sourceHost: 'walmart.com.mx',
    origin,
    votes: { up: upvotes, down: 0, score },
  });
  const list = [
    offer('gadget', 'Bocina bluetooth', 50, 5),
    offer('arroz', 'Arroz 1 kg', 1, 1),
    offer('panales', 'Pañales 40 piezas', 1, 1),
    offer('sin_votos', 'Papel higiénico 12 rollos', 0, 0),
  ];
  const ids = (xs: { id?: string | null }[]) => xs.map((x) => x.id);

  it('Top conserva el orden del servidor y solo exige un voto', () => {
    expect(ids(processHomeFeedList(list, 'top', 10))).toEqual(['gadget', 'arroz', 'panales']);
  });

  it('Recientes conserva el orden cronológico del servidor', () => {
    expect(ids(processHomeFeedList(list, 'latest', 10))).toEqual(ids(list));
  });

  it('Para ti no pasa por las reglas del home', () => {
    expect(processHomeFeedList(list, 'personalized', 10)).toBe(list);
  });

  it('Día a día aplica Despensa y las preferencias desempatan', () => {
    expect(ids(processHomeFeedList(list, 'vitales', 10))).toEqual(['arroz', 'panales', 'sin_votos', 'gadget']);
    expect(ids(processHomeFeedList(list, 'vitales', 10, 2, new Set(['bebes.panales'])))).toEqual([
      'panales',
      'arroz',
      'sin_votos',
      'gadget',
    ]);
  });
});
