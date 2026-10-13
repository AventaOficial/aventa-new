import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { FetchMlApiResult } from '@/lib/integrations/mercadolibre/apiClient';
import { fetchMercadoLibreItemsBulk, type MlItemApiBody } from '@/lib/bots/ingest/mlItemDetails';
import { itemToMetaDetailed } from '@/lib/bots/ingest/discoverMercadoLibre';
import { isTrustedMachineOriginalProvenance } from '@/lib/bots/ingest/machinePriceProvenance';

const id = (n: number) => `MLM${String(1_000_000_000 + n)}`;
const body = (itemId: string, over: Partial<MlItemApiBody> = {}): MlItemApiBody => ({
  id: itemId,
  title: 'Audífonos inalámbricos',
  price: 499,
  original_price: 899,
  permalink: `https://articulo.mercadolibre.com.mx/${itemId.replace('MLM', 'MLM-')}-audifonos`,
  pictures: [{ secure_url: 'https://http2.mlstatic.com/D_NQ_NP_test-O.webp' }],
  ...over,
});
const ok = (data: unknown): FetchMlApiResult => ({ ok: true, data, authenticated: true, status: 200 });
const fail = (status: number, timedOut?: boolean): FetchMlApiResult => ({ ok: false, status, authenticated: true, timedOut });
const noPause = async () => undefined;

describe('/items/bulk sin fallback legado', () => {
  it('solo llama a /items/bulk, nunca a /items?ids=', async () => {
    const fetchApi = vi.fn(async () => ok([{ code: 200, body: body(id(1)) }]));
    await fetchMercadoLibreItemsBulk([id(1)], { fetchApi, pause: noPause });
    const paths = fetchApi.mock.calls.map((c) => (c as unknown as [string])[0]);
    expect(paths).toEqual([`/items/bulk?ids=${encodeURIComponent(id(1))}`]);
    for (const file of ['lib/bots/ingest/mlItemDetails.ts', 'lib/bots/ingest/discoverMercadoLibre.ts', 'scripts/debug-ml-item-fetch.ts']) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/\(\s*[`'"]\/items\?ids=/);
    }
  });

  it('respuesta vacía con 200 no dispara un fallback', async () => {
    const fetchApi = vi.fn(async () => ok([]));
    const r = await fetchMercadoLibreItemsBulk([id(1), id(2)], { fetchApi, pause: noPause });
    expect(fetchApi).toHaveBeenCalledTimes(1);
    expect(r.items.size).toBe(0);
    expect([...r.missing.values()]).toEqual(['invalid_response', 'invalid_response']);
  });

  it('respuesta parcial: conserva los encontrados y clasifica los demás por su código', async () => {
    const fetchApi = vi.fn(async () =>
      ok([
        { code: 200, body: body(id(1)) },
        { code: 404, body: { id: id(2) } },
        { code: 403, body: { id: id(3) } },
      ]),
    );
    const r = await fetchMercadoLibreItemsBulk([id(1), id(2), id(3), id(4)], { fetchApi, pause: noPause });
    expect([...r.items.keys()]).toEqual([id(1)]);
    expect(Object.fromEntries(r.missing)).toEqual({
      [id(2)]: 'not_found',
      [id(3)]: 'forbidden',
      [id(4)]: 'invalid_response',
    });
  });

  it('no acepta un cuerpo para un id que no se pidió', async () => {
    const fetchApi = vi.fn(async () => ok([{ code: 200, body: body(id(9)) }]));
    const r = await fetchMercadoLibreItemsBulk([id(1)], { fetchApi, pause: noPause });
    expect(r.items.has(id(9))).toBe(false);
    expect(r.missing.get(id(1))).toBe('invalid_response');
  });

  it.each([
    [403, undefined, 'forbidden'],
    [401, undefined, 'unauthorized'],
    [500, undefined, 'upstream_error'],
    [503, undefined, 'upstream_error'],
    [0, true, 'timeout'],
    [0, undefined, 'upstream_error'],
  ] as const)('HTTP %i del lote → %s y sigue con el siguiente lote', async (status, timedOut, failure) => {
    const ids = Array.from({ length: 25 }, (_, n) => id(n));
    const fetchApi = vi
      .fn<(path: string) => Promise<FetchMlApiResult>>()
      .mockResolvedValueOnce(fail(status, timedOut))
      .mockResolvedValueOnce(ok(ids.slice(20).map((i) => ({ code: 200, body: body(i) }))));
    const r = await fetchMercadoLibreItemsBulk(ids, { fetchApi, pause: noPause });
    expect(fetchApi).toHaveBeenCalledTimes(2);
    expect(r.items.size).toBe(5);
    expect(r.missing.size).toBe(20);
    expect(new Set(r.missing.values())).toEqual(new Set([failure]));
  });

  it('429 corta los lotes restantes sin reintentar', async () => {
    const ids = Array.from({ length: 45 }, (_, n) => id(n));
    const fetchApi = vi
      .fn<(path: string) => Promise<FetchMlApiResult>>()
      .mockResolvedValueOnce(ok(ids.slice(0, 20).map((i) => ({ code: 200, body: body(i) }))))
      .mockResolvedValueOnce(fail(429));
    const r = await fetchMercadoLibreItemsBulk(ids, { fetchApi, pause: noPause });
    expect(fetchApi).toHaveBeenCalledTimes(2);
    expect(r.items.size).toBe(20);
    expect(r.missing.size).toBe(25);
    expect(new Set(r.missing.values())).toEqual(new Set(['rate_limited']));
  });

  it('deduplica ids y respeta el máximo de 20 por llamada', async () => {
    const ids = Array.from({ length: 21 }, (_, n) => id(n));
    const fetchApi = vi.fn(async (path: string) => {
      const asked = decodeURIComponent(path.split('ids=')[1]!).split(',');
      expect(asked.length).toBeLessThanOrEqual(20);
      return ok(asked.map((i) => ({ code: 200, body: body(i) })));
    });
    const r = await fetchMercadoLibreItemsBulk([...ids, ...ids], { fetchApi, pause: noPause });
    expect(fetchApi).toHaveBeenCalledTimes(2);
    expect(r.items.size).toBe(21);
  });
});

describe('campos de /items/bulk', () => {
  it('original_price de la API no es evidencia confiable de descuento', () => {
    const { meta } = itemToMetaDetailed(body(id(1)));
    expect(meta?.originalPrice).toBe(899);
    expect(meta?.signals?.originalPriceProvenance).toBe('unknown');
    expect(isTrustedMachineOriginalProvenance(meta?.signals?.originalPriceProvenance)).toBe(false);
  });

  it.each([
    ['permalink', { permalink: undefined }, 'sin permalink'],
    ['título', { title: undefined }, 'sin título'],
    ['precio', { price: undefined }, 'sin precio actual'],
    ['precio original', { original_price: undefined }, 'sin precio original'],
    ['precio original no mayor', { original_price: 499 }, 'sin precio original'],
  ])('falta %s → no inventa el campo', (_label, over, reason) => {
    const parsed = itemToMetaDetailed(body(id(1), over as Partial<MlItemApiBody>));
    expect(parsed.meta).toBeNull();
    expect(parsed.reason).toContain(reason);
  });

  it('sin imágenes deja la imagen vacía (el escritor la exige después)', () => {
    const { meta } = itemToMetaDetailed(body(id(1), { pictures: [] }));
    expect(meta?.imageUrl).toBe('');
  });
});
