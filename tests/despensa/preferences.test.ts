import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchDespensaPreferredNeeds, processHomeFeedList } from '@/lib/offers/homeFeedClient';

describe('cliente de preferencias de Despensa', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sin sesión no llama al API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await fetchDespensaPreferredNeeds(null)).size).toBe(0);
    expect((await fetchDespensaPreferredNeeds('')).size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('pide el alcance de Despensa con el token de la sesión', async () => {
    const fetchMock = vi.fn(async () => Response.json({ needIds: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await fetchDespensaPreferredNeeds('tok');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/me/interests?scope=despensa');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('cualquier fallo deja el ranking sin preferencias', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 503 })));
    expect((await fetchDespensaPreferredNeeds('t')).size).toBe(0);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect((await fetchDespensaPreferredNeeds('t')).size).toBe(0);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 200 })));
    expect((await fetchDespensaPreferredNeeds('t')).size).toBe(0);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ needIds: ['bebes.panales', 7, null] })));
    expect([...(await fetchDespensaPreferredNeeds('t'))]).toEqual(['bebes.panales']);
  });
});

const NOW = new Date().toISOString();
const DAY = 86_400_000;
type Item = {
  id: string;
  title: string;
  discountPrice: number;
  upvotes: number;
  createdAt: string;
  expiresAt?: string | null;
  sourceHost: string | null;
  origin: 'community' | 'machine';
  votes: { up: number; down: number; score: number };
};
const offer = (id: string, title: string, score: number, upvotes: number, extra: Partial<Item> = {}): Item => ({
  id,
  title,
  discountPrice: 50,
  upvotes,
  createdAt: NOW,
  sourceHost: 'walmart.com.mx',
  origin: 'community',
  votes: { up: upvotes, down: 0, score },
  ...extra,
});
const list = [
  offer('gadget', 'Bocina bluetooth', 50, 5),
  offer('arroz', 'Arroz 1 kg', 1, 1),
  offer('panales', 'Pañales 40 piezas', 1, 1),
  offer('sin_votos', 'Papel higiénico 12 rollos', 0, 0),
];
const ids = (xs: { id?: string | null }[]) => xs.map((x) => x.id);

describe('las reglas de Despensa solo afectan Día a día', () => {
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

  it('las preferencias no cambian Top, Recientes ni Para ti', () => {
    const prefs = new Set(['bebes.panales', 'hogar.papel_higienico']);
    for (const view of ['top', 'latest'] as const) {
      expect(ids(processHomeFeedList(list, view, 10, 2, prefs))).toEqual(ids(processHomeFeedList(list, view, 10)));
    }
    expect(processHomeFeedList(list, 'personalized', 10, 2, prefs)).toBe(list);
  });
});

describe('preferencias de la sesión → ranking de Día a día', () => {
  afterEach(() => vi.unstubAllGlobals());

  async function rankWith(response: () => Promise<Response>, items: Item[] = list) {
    vi.stubGlobal('fetch', vi.fn(response));
    const prefs = await fetchDespensaPreferredNeeds('tok');
    return ids(processHomeFeedList(items, 'vitales', 10, 2, prefs));
  }
  const base = ids(processHomeFeedList(list, 'vitales', 10));

  it('las necesidades del API llegan al ranking', async () => {
    expect(await rankWith(async () => Response.json({ needIds: ['bebes.panales'] }))).toEqual([
      'panales',
      'arroz',
      'sin_votos',
      'gadget',
    ]);
  });

  it('preferencias vacías, desconocidas o con error dan el mismo orden que sin sesión', async () => {
    expect(await rankWith(async () => Response.json({ needIds: [] }))).toEqual(base);
    expect(await rankWith(async () => Response.json({ needIds: ['no.existe'] }))).toEqual(base);
    expect(await rankWith(async () => new Response('x', { status: 503 }))).toEqual(base);
    expect(await rankWith(async () => { throw new Error('offline'); })).toEqual(base);
  });

  it('una preferencia no supera mejor evidencia de precio', async () => {
    const items = [
      offer('panales_sin_tienda', 'Pañales 40 piezas', 1, 1, { sourceHost: null }),
      offer('arroz_vigente', 'Arroz 1 kg', 1, 1, { expiresAt: new Date(Date.now() + 3 * DAY).toISOString() }),
    ];
    expect(await rankWith(async () => Response.json({ needIds: ['bebes.panales'] }), items)).toEqual([
      'arroz_vigente',
      'panales_sin_tienda',
    ]);
  });

  it('una preferencia no rescata evidencia vieja', async () => {
    const items = [
      offer('panales_viejo', 'Pañales 40 piezas', 1, 1, { createdAt: new Date(Date.now() - 10 * DAY).toISOString() }),
      offer('arroz', 'Arroz 1 kg', 1, 1),
    ];
    expect(await rankWith(async () => Response.json({ needIds: ['bebes.panales'] }), items)).toEqual([
      'arroz',
      'panales_viejo',
    ]);
  });

  it('el resultado es determinista', async () => {
    const respond = async () => Response.json({ needIds: ['bebes.panales'] });
    const first = await rankWith(respond);
    expect(await rankWith(respond)).toEqual(first);
    expect(await rankWith(respond, [...list].reverse())).toEqual(first);
  });
});
