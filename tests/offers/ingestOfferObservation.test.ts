import { createHash, randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mergePendingOfferFields, resolveIngestionIdentity } from '@/lib/offers/ingestion';
import { ingestOfferObservation } from '@/lib/offers/ingestion/ingestOfferObservation';
import { buildObservationIdempotencyKey } from '@/lib/offers/ingestion/observationIdempotency';

vi.mock('@/lib/affiliate', async () => {
  const actual = await vi.importActual<typeof import('@/lib/affiliate')>('@/lib/affiliate');
  return {
    ...actual,
    resolveAndNormalizeAffiliateOfferUrl: async (url: string) => url.trim(),
  };
});

type OfferRow = {
  id: string;
  status: string;
  title: string;
  price: number;
  original_price: number | null;
  image_url: string;
  store: string;
  offer_url: string;
  original_offer_url: string | null;
  ingestion_identity_key: string | null;
  product_fingerprint: string | null;
  deleted_at: string | null;
  created_by: string;
};

type ObservationRow = {
  id: string;
  offer_id: string | null;
  identity_key: string;
  idempotency_key: string;
  source: string;
  title: string | null;
  image_url: string | null;
  price: number | null;
  previous_price: number | null;
  seller: string | null;
  metadata: Record<string, unknown>;
};

function createMemoryDb() {
  const offers = new Map<string, OfferRow>();
  const observations = new Map<string, ObservationRow>();
  const identityIndex = new Map<string, string>();
  const observationIdem = new Map<string, string>();

  function activeByIdentity(key: string): OfferRow | null {
    const id = identityIndex.get(key);
    if (!id) return null;
    const row = offers.get(id);
    if (!row || row.deleted_at) return null;
    if (!['pending', 'approved', 'published'].includes(row.status)) return null;
    return row;
  }

  function from(table: string) {
    if (table === 'offers') {
      const state: {
        filters: Record<string, unknown>;
        inStatus?: string[];
        isDeleted?: null;
        limitN?: number;
        payload?: Record<string, unknown> | Record<string, unknown>[];
        mode: 'select' | 'insert' | 'update';
        updatePatch?: Record<string, unknown>;
      } = { filters: {}, mode: 'select' };

      const api: Record<string, unknown> = {};
      const self = () => api;

      api.select = () => {
        // insert().select().single() must keep insert mode
        if (state.mode !== 'insert' && state.mode !== 'update') state.mode = 'select';
        return self();
      };
      api.insert = (rows: Record<string, unknown>[]) => {
        state.mode = 'insert';
        state.payload = rows;
        return self();
      };
      api.update = (patch: Record<string, unknown>) => {
        state.mode = 'update';
        state.updatePatch = patch;
        return self();
      };
      api.eq = (col: string, val: unknown) => {
        state.filters[col] = val;
        return self();
      };
      api.in = (col: string, vals: string[]) => {
        if (col === 'status') state.inStatus = vals;
        return self();
      };
      api.is = (col: string, val: unknown) => {
        if (col === 'deleted_at') state.isDeleted = val as null;
        return self();
      };
      api.limit = (n: number) => {
        state.limitN = n;
        return self();
      };
      api.maybeSingle = async () => {
        const key = state.filters.ingestion_identity_key as string | undefined;
        if (key) {
          const row = activeByIdentity(key);
          return { data: row, error: null };
        }
        return { data: null, error: null };
      };
      api.single = async () => {
        if (state.mode === 'insert') {
          const row = (Array.isArray(state.payload) ? state.payload[0] : state.payload) as Record<
            string,
            unknown
          >;
          const identity = (row.ingestion_identity_key as string | null) ?? null;
          if (identity && activeByIdentity(identity)) {
            return { data: null, error: { code: '23505', message: 'duplicate key value' } };
          }
          const id = randomUUID();
          const offer: OfferRow = {
            id,
            status: (row.status as string) || 'pending',
            title: String(row.title),
            price: Number(row.price),
            original_price: row.original_price == null ? null : Number(row.original_price),
            image_url: String(row.image_url),
            store: String(row.store),
            offer_url: String(row.offer_url ?? ''),
            original_offer_url: (row.original_offer_url as string) ?? null,
            ingestion_identity_key: identity,
            product_fingerprint: (row.product_fingerprint as string) ?? null,
            deleted_at: null,
            created_by: String(row.created_by),
          };
          offers.set(id, offer);
          if (identity) identityIndex.set(identity, id);
          return { data: { id, status: offer.status }, error: null };
        }
        return { data: null, error: { message: 'unexpected' } };
      };
      // thenable for update().eq().eq()
      const runUpdate = async () => {
        const id = state.filters.id as string | undefined;
        if (!id || !state.updatePatch) return { data: null, error: null };
        const row = offers.get(id);
        if (!row) return { data: null, error: { message: 'missing' } };
        if (state.filters.status && row.status !== state.filters.status) {
          return { data: null, error: null };
        }
        Object.assign(row, state.updatePatch);
        return { data: row, error: null };
      };
      // Make chain awaitable after update eqs
      (api as { then?: unknown }).then = undefined;
      const origEq = api.eq as (col: string, val: unknown) => unknown;
      api.eq = (col: string, val: unknown) => {
        state.filters[col] = val;
        if (state.mode === 'update') {
          return {
            eq: (col2: string, val2: unknown) => {
              state.filters[col2] = val2;
              return {
                then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
                  runUpdate().then(resolve, reject),
              };
            },
            then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
              runUpdate().then(resolve, reject),
          };
        }
        return origEq(col, val);
      };

      return api;
    }

    if (table === 'offer_observations') {
      const state: {
        mode: 'insert' | 'select';
        payload?: Record<string, unknown>[];
        filters: Record<string, unknown>;
      } = { mode: 'select', filters: {} };
      const api: Record<string, unknown> = {};
      const self = () => api;
      api.insert = (rows: Record<string, unknown>[]) => {
        state.mode = 'insert';
        state.payload = rows;
        return self();
      };
      api.select = () => {
        if (state.mode !== 'insert') state.mode = 'select';
        return self();
      };
      api.eq = (col: string, val: unknown) => {
        state.filters[col] = val;
        return self();
      };
      api.maybeSingle = async () => {
        const key = state.filters.idempotency_key as string | undefined;
        if (!key) return { data: null, error: null };
        const id = observationIdem.get(key);
        return { data: id ? observations.get(id) ?? null : null, error: null };
      };
      api.single = async () => {
        const row = state.payload?.[0];
        if (!row) return { data: null, error: { message: 'empty' } };
        const idem = String(row.idempotency_key);
        if (observationIdem.has(idem)) {
          return { data: null, error: { code: '23505', message: 'duplicate key value' } };
        }
        const id = randomUUID();
        const obs: ObservationRow = {
          id,
          offer_id: (row.offer_id as string) ?? null,
          identity_key: String(row.identity_key),
          idempotency_key: idem,
          source: String(row.source),
          title: (row.title as string) ?? null,
          image_url: (row.image_url as string) ?? null,
          price: row.price == null ? null : Number(row.price),
          previous_price: row.previous_price == null ? null : Number(row.previous_price),
          seller: (row.seller as string) ?? null,
          metadata: (row.metadata as Record<string, unknown>) ?? {},
        };
        observations.set(id, obs);
        observationIdem.set(idem, id);
        return { data: { id }, error: null };
      };
      return api;
    }

    return {
      insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
    };
  }

  return {
    client: {
      from,
      rpc: async () => ({ data: null, error: null }),
    },
    offers,
    observations,
    identityIndex,
    counts: () => ({ offers: offers.size, observations: observations.size }),
  };
}

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Audífonos XY',
    store: 'Amazon',
    hasDiscount: true,
    price: 999,
    original_price: 1499,
    image_url: 'https://img.example/a.jpg',
    offer_url: 'https://www.amazon.com.mx/dp/B0TESTASI1',
    description: 'Oferta de prueba',
    tags: ['lote'],
    ...overrides,
  };
}

describe('resolveIngestionIdentity', () => {
  it('5. Amazon ASIN equivalent across tracking', () => {
    const a = resolveIngestionIdentity(
      'https://www.amazon.com.mx/dp/B0TESTASI1?utm_source=x&tag=old',
    );
    const b = resolveIngestionIdentity('https://www.amazon.com.mx/dp/B0TESTASI1');
    expect(a.key).toBe('amz:B0TESTASI1');
    expect(a.key).toBe(b.key);
    expect(a.strategy).toBe('amazon_asin');
  });

  it('6. ML item ID equivalent across tracking', () => {
    const a = resolveIngestionIdentity(
      'https://articulo.mercadolibre.com.mx/MLM-2936772026-foo?utm_campaign=y',
    );
    const b = resolveIngestionIdentity('https://articulo.mercadolibre.com.mx/MLM-2936772026');
    expect(a.key).toBe('ml:MLM2936772026');
    expect(a.key).toBe(b.key);
    expect(a.strategy).toBe('ml_item');
  });

  it('4. canonical URL equivalent → same url fingerprint', () => {
    const a = resolveIngestionIdentity(
      'https://www.liverpool.com.mx/tienda/pdp/camisa/12345?utm_source=x',
    );
    const b = resolveIngestionIdentity('https://www.liverpool.com.mx/tienda/pdp/camisa/12345');
    expect(a.strategy).toBe('url_fingerprint');
    expect(a.key).toBe(b.key);
    expect(a.key).toContain('url:');
  });

  it('13. malformed identity → none', () => {
    const r = resolveIngestionIdentity('not-a-url');
    expect(r.strategy).toBe('none');
    expect(r.key).toBeNull();
  });

  it('14. missing identity fallback for meli.la shortlink', () => {
    const r = resolveIngestionIdentity('https://meli.la/abc123');
    expect(r.strategy).toBe('none');
    expect(r.key).toBeNull();
    expect(r.reason).toMatch(/meli_la/);
  });
});

describe('mergePendingOfferFields', () => {
  it('7. different price → conflict, keep existing', () => {
    const r = mergePendingOfferFields(
      { title: 'A', price: 100, original_price: 200, image_url: 'https://img/a.jpg', store: 'Amazon' },
      { price: 120 },
    );
    expect(r.conflicts).toContain('price');
    expect(r.patch.price).toBeUndefined();
  });

  it('8. different image → conflict unless placeholder', () => {
    const fill = mergePendingOfferFields(
      { title: 'A', price: 100, original_price: null, image_url: '/placeholder.png', store: 'Amazon' },
      { imageUrl: 'https://img/new.jpg' },
    );
    expect(fill.filled).toContain('image_url');
    expect(fill.patch.image_url).toBe('https://img/new.jpg');

    const conflict = mergePendingOfferFields(
      { title: 'A', price: 100, original_price: null, image_url: 'https://img/old.jpg', store: 'Amazon' },
      { imageUrl: 'https://img/new.jpg' },
    );
    expect(conflict.conflicts).toContain('image_url');
  });

  it('9. different seller/store → conflict', () => {
    const r = mergePendingOfferFields(
      { title: 'A', price: 100, original_price: null, image_url: 'https://img/a.jpg', store: 'Amazon' },
      { store: 'Walmart' },
    );
    expect(r.conflicts).toContain('store');
  });

  it('10. weak observation does not overwrite strong pending fields', () => {
    const r = mergePendingOfferFields(
      {
        title: 'Strong title',
        price: 100,
        original_price: 200,
        image_url: 'https://img/strong.jpg',
        store: 'Amazon',
      },
      { title: 'Weak', price: 99, imageUrl: 'https://img/weak.jpg' },
    );
    expect(Object.keys(r.patch)).toHaveLength(0);
    expect(r.conflicts.length).toBeGreaterThan(0);
  });
});

describe('ingestOfferObservation idempotency', () => {
  let db: ReturnType<typeof createMemoryDb>;

  beforeEach(() => {
    db = createMemoryDb();
  });

  it('1. same offer twice → one offer', async () => {
    const first = await ingestOfferObservation(db.client as never, {
      createdBy: 'user-1',
      source: 'community:batch',
      body: baseBody(),
    });
    const second = await ingestOfferObservation(db.client as never, {
      createdBy: 'user-1',
      source: 'community:batch',
      body: baseBody(),
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(first.offerId).toBe(second.offerId);
    expect(db.counts().offers).toBe(1);
  });

  it('2. same offer 100 times → one pending', async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const r = await ingestOfferObservation(db.client as never, {
        createdBy: 'user-1',
        source: 'community:batch',
        body: baseBody(),
      });
      expect(r.ok).toBe(true);
      if (r.ok) ids.add(r.offerId);
    }
    expect(ids.size).toBe(1);
    expect(db.counts().offers).toBe(1);
  });

  it('3. tracking params different → same identity offer', async () => {
    const a = await ingestOfferObservation(db.client as never, {
      createdBy: 'user-1',
      source: 'community:batch',
      body: baseBody({
        offer_url: 'https://www.amazon.com.mx/dp/B0TESTASI1?utm_source=hunter',
      }),
    });
    const b = await ingestOfferObservation(db.client as never, {
      createdBy: 'user-1',
      source: 'community:batch',
      body: baseBody({
        offer_url: 'https://www.amazon.com.mx/dp/B0TESTASI1?fbclid=zzz',
      }),
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.offerId).toBe(b.offerId);
    expect(a.identityKey).toBe('amz:B0TESTASI1');
  });

  it('7+16. price different → observation kept, offer price not LWW', async () => {
    const first = await ingestOfferObservation(db.client as never, {
      createdBy: 'user-1',
      source: 'community:batch',
      body: baseBody({ price: 999 }),
    });
    const second = await ingestOfferObservation(db.client as never, {
      createdBy: 'user-1',
      source: 'hunter',
      body: baseBody({ price: 1099 }),
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.created).toBe(false);
    expect(second.conflicts).toContain('price');
    const offer = db.offers.get(first.offerId)!;
    expect(offer.price).toBe(999);
    expect(db.counts().observations).toBe(2);
  });

  it('15. idempotency key repeated → observation reused', async () => {
    const key = buildObservationIdempotencyKey({
      identityKey: 'amz:B0TESTASI1',
      source: 'community:batch',
      canonicalUrl: 'https://www.amazon.com.mx/dp/B0TESTASI1',
      title: 'Audífonos XY',
      imageUrl: 'https://img.example/a.jpg',
      price: 999,
      previousPrice: 1499,
    });
    const a = await ingestOfferObservation(db.client as never, {
      createdBy: 'user-1',
      source: 'community:batch',
      idempotencyKey: key,
      body: baseBody(),
    });
    const b = await ingestOfferObservation(db.client as never, {
      createdBy: 'user-1',
      source: 'community:batch',
      idempotencyKey: key,
      body: baseBody(),
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.observationId).toBe(b.observationId);
    expect(b.observationReused).toBe(true);
    expect(db.counts().observations).toBe(1);
  });

  it('11. two concurrent requests → single offer', async () => {
    const [a, b] = await Promise.all([
      ingestOfferObservation(db.client as never, {
        createdBy: 'user-1',
        source: 'community:batch',
        body: baseBody(),
      }),
      ingestOfferObservation(db.client as never, {
        createdBy: 'user-2',
        source: 'community:batch',
        body: baseBody(),
      }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.offerId).toBe(b.offerId);
    expect(db.counts().offers).toBe(1);
    expect([a.created, b.created].filter(Boolean).length).toBe(1);
  });

  it('12. identity collision across URLs with same ASIN', async () => {
    const a = await ingestOfferObservation(db.client as never, {
      createdBy: 'user-1',
      source: 'community:batch',
      body: baseBody({
        offer_url: 'https://www.amazon.com.mx/gp/product/B0TESTASI1',
      }),
    });
    const b = await ingestOfferObservation(db.client as never, {
      createdBy: 'user-1',
      source: 'community:batch',
      body: baseBody({
        offer_url: 'https://www.amazon.com.mx/dp/B0TESTASI1?ref=abc',
      }),
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.identityKey).toBe(b.identityKey);
    expect(a.offerId).toBe(b.offerId);
  });

  it('17. pending created once; later ingest reuses', async () => {
    const first = await ingestOfferObservation(db.client as never, {
      createdBy: 'user-1',
      source: 'community:batch',
      body: baseBody(),
    });
    expect(first.ok && first.created).toBe(true);
    for (let i = 0; i < 5; i++) {
      const r = await ingestOfferObservation(db.client as never, {
        createdBy: 'user-1',
        source: 'community:batch',
        body: baseBody({ title: `Variant title ${i}` }),
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.created).toBe(false);
        expect(r.offerId).toBe(first.ok ? first.offerId : '');
      }
    }
    expect(db.counts().offers).toBe(1);
  });
});

describe('observation idempotency key stability', () => {
  it('same inputs → same key', () => {
    const a = buildObservationIdempotencyKey({
      identityKey: 'amz:B0TESTASI1',
      source: 'community:batch',
      price: 10,
    });
    const b = buildObservationIdempotencyKey({
      identityKey: 'amz:B0TESTASI1',
      source: 'community:batch',
      price: 10,
    });
    expect(a).toBe(b);
    expect(a).toHaveLength(48);
    expect(createHash('sha256').update('x').digest('hex')).toBeTruthy();
  });
});
