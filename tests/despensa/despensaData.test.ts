import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildOfferPriceInsights, computePriceInsight } from '@/lib/offers/priceHistory';
import { isDespensaCandidate, loadDespensaOffers, toDespensaOffer } from '@/lib/despensa/despensaFeed';
import { savingEvidence } from '@/lib/despensa/evidence';
import type { FeedOffer } from '@/lib/offers/feedService';

describe('computePriceInsight (misma regla que el detalle de la oferta)', () => {
  it('sin registros o con uno solo es insuficiente', () => {
    expect(computePriceInsight(30, null, []).verdict).toBe('insufficient');
    expect(computePriceInsight(30, null, [30]).verdict).toBe('insufficient');
  });

  it('en el mínimo de 90 días es fuerte; etiqueta alta lejos del mínimo es solo etiqueta', () => {
    expect(computePriceInsight(30, null, [30, 40, 38])).toMatchObject({ verdict: 'strong', min90d: 30, max90d: 40, samples90d: 3 });
    expect(computePriceInsight(40, 100, [30, 40, 38])).toMatchObject({ verdict: 'label_only', labelDiscountPct: 60 });
    expect(computePriceInsight(31.5, null, [30, 40])).toMatchObject({ verdict: 'fair' });
  });

  it('descarta precios no numéricos sin inventar registros', () => {
    expect(computePriceInsight(30, null, [Number.NaN, -1, 30]).samples90d).toBe(1);
  });
});

describe('savingEvidence', () => {
  it('solo verifica con historial fuerte y un precio visto más alto', () => {
    expect(savingEvidence({ price: 30, history: { verdict: 'strong', min90d: 30, max90d: 40, samples90d: 3 } })).toEqual({
      status: 'verified',
      amount: 10,
      percent: 25,
      reference: 40,
    });
    expect(savingEvidence({ price: 30, history: { verdict: 'strong', min90d: 30, max90d: 30, samples90d: 2 } })).toEqual({ status: 'none' });
    expect(savingEvidence({ price: 30, originalPrice: 90, history: { verdict: 'label_only', min90d: 20, max90d: 30, samples90d: 3 } })).toEqual({
      status: 'list_contradicted',
    });
    expect(savingEvidence({ price: 30, originalPrice: 20 })).toEqual({ status: 'none' });
    expect(savingEvidence({ price: 0, originalPrice: 90 })).toEqual({ status: 'none' });
  });
});

type Row = { offer_id: string; price: number; recorded_at: string; source?: string };

/** Imita PostgREST: filtra por ids, ordena por fecha desc, aplica `limit` y un tope de filas. */
function fakeSupabase(
  tables: { offer_price_snapshots?: Row[] | 'error'; offers?: { id: string; source_currency: string | null }[] },
  opts: { maxRows?: number } = {},
) {
  const calls: { table: string; ids: string[] }[] = [];
  const from = vi.fn((table: string) => {
    const chain = {
      ids: [] as string[],
      limitN: Infinity,
      select: () => chain,
      in: (_col: string, ids: string[]) => {
        chain.ids = ids;
        calls.push({ table, ids });
        return chain;
      },
      gte: () => chain,
      order: () => chain,
      limit: (n: number) => {
        chain.limitN = n;
        return chain;
      },
      then: (resolve: (v: unknown) => unknown) => {
        const data = tables[table as keyof typeof tables];
        if (data === 'error') return resolve({ data: null, error: { message: 'boom' }, count: null });
        const rows = ((data ?? []) as { offer_id?: string; id?: string; recorded_at?: string }[])
          .filter((r) => chain.ids.includes(r.offer_id ?? r.id ?? ''))
          .sort((a, b) => String(b.recorded_at ?? '').localeCompare(String(a.recorded_at ?? '')));
        const cap = Math.min(chain.limitN, opts.maxRows ?? Infinity);
        return resolve({ data: rows.slice(0, cap), error: null, count: rows.length });
      },
    };
    return chain;
  });
  return { client: { from } as unknown as SupabaseClient, calls };
}

describe('buildOfferPriceInsights (lote)', () => {
  it('una sola consulta para todas las ofertas; sin registros queda insuficiente', async () => {
    const { client, calls } = fakeSupabase({
      offer_price_snapshots: [
        { offer_id: 'a', price: 30, recorded_at: '2026-10-10', source: 'create' },
        { offer_id: 'a', price: 40, recorded_at: '2026-09-10', source: 'health' },
      ],
    });
    const out = await buildOfferPriceInsights(client, [
      { offerId: 'a', currentPrice: 30 },
      { offerId: 'b', currentPrice: 20, originalPrice: 99 },
    ]);
    expect(calls).toEqual([{ table: 'offer_price_snapshots', ids: ['a', 'b'] }]);
    expect(out.get('a')).toMatchObject({ verdict: 'strong', max90d: 40 });
    expect(out.get('b')).toMatchObject({ verdict: 'insufficient', samples90d: 0 });
  });

  it('si la consulta falla, nadie obtiene historial', async () => {
    const { client } = fakeSupabase({ offer_price_snapshots: 'error' });
    const out = await buildOfferPriceInsights(client, [{ offerId: 'a', currentPrice: 30 }]);
    expect(out.get('a')?.verdict).toBe('insufficient');
  });

  it('una respuesta recortada no fabrica un mínimo: el grupo queda sin historial', async () => {
    // Completo: 80 (viejo), 120, 100 → actual 100 es «fair». Recortado sin el 80 parecería «strong».
    const rows: Row[] = [
      { offer_id: 'a', price: 100, recorded_at: '2026-10-11' },
      { offer_id: 'a', price: 120, recorded_at: '2026-09-11' },
      { offer_id: 'a', price: 80, recorded_at: '2026-08-11' },
    ];
    const full = await buildOfferPriceInsights(fakeSupabase({ offer_price_snapshots: rows }).client, [{ offerId: 'a', currentPrice: 100 }]);
    expect(full.get('a')?.verdict).toBe('fair');
    const cut = await buildOfferPriceInsights(fakeSupabase({ offer_price_snapshots: rows }, { maxRows: 2 }).client, [
      { offerId: 'a', currentPrice: 100 },
    ]);
    expect(cut.get('a')?.verdict).toBe('insufficient');
    expect(savingEvidence({ price: 100, history: cut.get('a') })).toEqual({ status: 'none' });
  });

  it('consulta en grupos de 8 ofertas para no chocar con el tope de filas', async () => {
    const { client, calls } = fakeSupabase({ offer_price_snapshots: [] });
    await buildOfferPriceInsights(
      client,
      Array.from({ length: 20 }, (_, i) => ({ offerId: `o${i}`, currentPrice: 10 })),
    );
    expect(calls.map((c) => c.ids.length)).toEqual([8, 8, 4]);
  });

  it('un precio corregido no sirve de referencia de ahorro', async () => {
    const { client } = fakeSupabase({
      offer_price_snapshots: [
        { offer_id: 'a', price: 15, recorded_at: '2026-10-11', source: 'create' },
        { offer_id: 'a', price: 15, recorded_at: '2026-10-05', source: 'update' },
        { offer_id: 'a', price: 1500, recorded_at: '2026-10-01', source: 'create' },
      ],
    });
    const out = await buildOfferPriceInsights(client, [{ offerId: 'a', currentPrice: 15 }]);
    expect(out.get('a')).toMatchObject({ max90d: 15, samples90d: 2 });
    expect(savingEvidence({ price: 15, history: out.get('a') })).toEqual({ status: 'none' });
  });

  it('sin ofertas no consulta', async () => {
    const { client, calls } = fakeSupabase({});
    expect((await buildOfferPriceInsights(client, [])).size).toBe(0);
    expect(calls).toEqual([]);
  });
});

const feedOffer = (o: Partial<FeedOffer> & Pick<FeedOffer, 'id' | 'title'>): FeedOffer => ({
  price: 30,
  original_price: null,
  source_currency: null,
  offer_url: 'https://www.walmart.com.mx/ip/1',
  created_at: '2026-10-12T10:00:00.000Z',
  score: 0,
  up_votes: 3,
  down_votes: 1,
  ranking_blend: null,
  ranking_momentum: null,
  images: ['https://img/1.jpg'],
  bank_coupon: null,
  store: 'Walmart',
  category: 'supermercado',
  msi_months: null,
  description: null,
  hunter_comment: null,
  coupons: null,
  conditions: 'Alcance: compra en línea.',
  slug: o.id,
  created_by: null,
  expires_at: null,
  origin: 'community',
  author: { display_name: 'x', avatar_url: null, leader_badge: null, ml_tracking_tag: null, amazon_tracking_tag: null, slug: null },
  ...o,
});

describe('datos de /api/despensa', () => {
  it('solo ofertas del catálogo con MXN confirmado', () => {
    expect(isDespensaCandidate({ title: 'Arroz blanco 1 kg', price: 30 }, 'MXN')).toBe(true);
    expect(isDespensaCandidate({ title: 'Arroz blanco 1 kg', price: 30 }, 'USD')).toBe(false);
    expect(isDespensaCandidate({ title: 'Arroz blanco 1 kg', price: 30 }, null)).toBe(false);
    expect(isDespensaCandidate({ title: 'Audífonos bluetooth', price: 30 }, 'MXN')).toBe(false);
  });

  it('mapea la oferta sin exponer la URL ni datos del autor', () => {
    const out = toDespensaOffer(feedOffer({ id: 'a', title: 'Arroz blanco 1 kg', original_price: 45 }), null);
    expect(out).toEqual({
      id: 'a',
      title: 'Arroz blanco 1 kg',
      discountPrice: 30,
      originalPrice: 45,
      store: 'Walmart',
      sourceHost: 'walmart.com.mx',
      imageUrl: 'https://img/1.jpg',
      createdAt: '2026-10-12T10:00:00.000Z',
      expiresAt: null,
      votes: { score: 2 },
      offerScope: 'online',
      priceHistory: null,
    });
  });

  it('sin alcance declarado, solo las tiendas que el código ya trata como en línea quedan «online»', () => {
    const amazon = toDespensaOffer(feedOffer({ id: 'a', title: 'Arroz blanco 1 kg', conditions: null, offer_url: 'https://www.amazon.com.mx/dp/X', store: 'Amazon' }), null);
    const soriana = toDespensaOffer(feedOffer({ id: 's', title: 'Arroz blanco 1 kg', conditions: null, offer_url: 'https://www.soriana.com/p/1', store: 'Soriana' }), null);
    const tienda = toDespensaOffer(
      feedOffer({ id: 't', title: 'Arroz blanco 1 kg', conditions: 'Alcance: oferta en tienda física / sucursales.', offer_url: 'https://www.amazon.com.mx/dp/X' }),
      null,
    );
    expect([amazon.offerScope, soriana.offerScope, tienda.offerScope]).toEqual(['online', null, 'in_store']);
  });

  it('usa la moneda guardada, descarta otras monedas y adjunta el historial', async () => {
    const { client } = fakeSupabase({
      offers: [
        { id: 'meli', source_currency: 'MXN' },
        { id: 'usd', source_currency: 'USD' },
      ],
      offer_price_snapshots: [
        { offer_id: 'walmart', price: 30, recorded_at: '2026-10-10' },
        { offer_id: 'walmart', price: 36, recorded_at: '2026-09-10' },
      ],
    });
    const feed = [
      feedOffer({ id: 'walmart', title: 'Arroz blanco 1 kg' }),
      feedOffer({ id: 'meli', title: 'Frijol negro 900 g', offer_url: 'https://meli.la/abc' }),
      feedOffer({ id: 'usd', title: 'Aceite vegetal 1 L', offer_url: 'https://amazon.com/x' }),
      feedOffer({ id: 'nocat', title: 'Audífonos', offer_url: 'https://amazon.com/x' }),
    ];
    const out = await loadDespensaOffers(client, feed);
    expect(out.offers.map((o) => o.id)).toEqual(['walmart', 'meli']);
    expect(out.excludedCurrency).toBe(1);
    // Filas legado (sin moneda, presentación ni alcance) no forman historial comparable.
    expect(out.offers[0].priceHistory).toMatchObject({
      verdict: 'insufficient',
      min90d: null,
      max90d: null,
      samples90d: 0,
      engine: { label: 'insufficient', reference: null, savingAmount: null },
    });
    expect(savingEvidence({ price: 30, history: out.offers[0].priceHistory })).toEqual({ status: 'none' });
    expect(out.offers[1].priceHistory?.verdict).toBe('insufficient');
  });
});
