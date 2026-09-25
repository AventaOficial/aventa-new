/**
 * Final ingestion audit — identity, idempotency, merge safety, concurrency.
 * Evidence for SINGLE WRITER hardening sign-off.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ingestOfferObservation } from '@/lib/offers/ingestion/ingestOfferObservation';
import { resolveIngestionIdentity } from '@/lib/offers/ingestion/identity';

vi.mock('@/lib/affiliate', async () => {
  const actual = await vi.importActual<typeof import('@/lib/affiliate')>('@/lib/affiliate');
  return {
    ...actual,
    resolveAndNormalizeAffiliateOfferUrl: async (url: string) => url.trim(),
  };
});

import { vi } from 'vitest';

type OfferRow = {
  id: string;
  status: string;
  title: string;
  price: number;
  original_price: number | null;
  image_url: string;
  store: string;
  ingestion_identity_key: string | null;
  product_fingerprint: string | null;
  deleted_at: string | null;
  created_by: string;
};

function createMemoryDb(initial?: Partial<OfferRow> & { id?: string }) {
  const offers = new Map<string, OfferRow>();
  const observations: { id: string; idempotency_key: string; offer_id: string; price: number | null; metadata: Record<string, unknown> }[] = [];
  const identityIndex = new Map<string, string>();
  const observationIdem = new Map<string, string>();

  if (initial?.id) {
    const row: OfferRow = {
      id: initial.id,
      status: initial.status ?? 'pending',
      title: initial.title ?? 'Existing',
      price: initial.price ?? 100,
      original_price: initial.original_price ?? null,
      image_url: initial.image_url ?? 'https://img/x.jpg',
      store: initial.store ?? 'Amazon',
      ingestion_identity_key: initial.ingestion_identity_key ?? null,
      product_fingerprint: initial.product_fingerprint ?? null,
      deleted_at: null,
      created_by: initial.created_by ?? 'user-0',
    };
    offers.set(row.id, row);
    if (row.ingestion_identity_key) identityIndex.set(row.ingestion_identity_key, row.id);
  }

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
        mode: 'select' | 'insert' | 'update';
        payload?: Record<string, unknown>[];
        filters: Record<string, unknown>;
        updatePatch?: Record<string, unknown>;
      } = { mode: 'select', filters: {} };
      const api: Record<string, unknown> = {};
      const self = () => api;
      api.select = () => {
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
        if (state.mode === 'update') {
          return {
            eq: (col2: string, val2: unknown) => {
              state.filters[col2] = val2;
              return {
                then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
                  const id = state.filters.id as string;
                  const row = offers.get(id);
                  if (row && state.updatePatch && row.status === (state.filters.status ?? row.status)) {
                    Object.assign(row, state.updatePatch);
                  }
                  return Promise.resolve({ data: row ?? null, error: null }).then(resolve, reject);
                },
              };
            },
          };
        }
        return self();
      };
      api.in = () => self();
      api.is = () => self();
      api.limit = () => self();
      api.maybeSingle = async () => {
        const iKey = state.filters.ingestion_identity_key as string | undefined;
        const fp = state.filters.product_fingerprint as string | undefined;
        if (iKey) return { data: activeByIdentity(iKey), error: null };
        if (fp) {
          for (const row of offers.values()) {
            if (row.product_fingerprint === fp && !row.deleted_at) return { data: row, error: null };
          }
        }
        return { data: null, error: null };
      };
      api.single = async () => {
        if (state.mode !== 'insert') return { data: null, error: { message: 'unexpected' } };
        const row = state.payload?.[0] as Record<string, unknown>;
        const identity = (row.ingestion_identity_key as string | null) ?? null;
        if (identity && activeByIdentity(identity)) {
          return { data: null, error: { code: '23505', message: 'duplicate key value' } };
        }
        const id = randomUUID();
        const offer: OfferRow = {
          id,
          status: String(row.status ?? 'pending'),
          title: String(row.title),
          price: Number(row.price),
          original_price: row.original_price == null ? null : Number(row.original_price),
          image_url: String(row.image_url),
          store: String(row.store),
          ingestion_identity_key: identity,
          product_fingerprint: (row.product_fingerprint as string) ?? null,
          deleted_at: null,
          created_by: String(row.created_by),
        };
        offers.set(id, offer);
        if (identity) identityIndex.set(identity, id);
        return { data: { id, status: offer.status }, error: null };
      };
      return api;
    }
    if (table === 'offer_observations') {
      const state: { mode: 'insert' | 'select'; payload?: Record<string, unknown>[]; filters: Record<string, unknown> } = {
        mode: 'select',
        filters: {},
      };
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
        const key = state.filters.idempotency_key as string;
        const id = observationIdem.get(key);
        return { data: id ? observations.find((o) => o.id === id) ?? null : null, error: null };
      };
      api.single = async () => {
        const row = state.payload?.[0];
        if (!row) return { data: null, error: { message: 'empty' } };
        const idem = String(row.idempotency_key);
        if (observationIdem.has(idem)) {
          return { data: null, error: { code: '23505', message: 'duplicate key' } };
        }
        const id = randomUUID();
        observations.push({
          id,
          idempotency_key: idem,
          offer_id: String(row.offer_id),
          price: row.price == null ? null : Number(row.price),
          metadata: (row.metadata as Record<string, unknown>) ?? {},
        });
        observationIdem.set(idem, id);
        return { data: { id }, error: null };
      };
      return api;
    }
    return { insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }) };
  }

  return {
    client: { from, rpc: async () => ({ data: null, error: null }) },
    offers,
    observations,
    counts: () => ({ offers: offers.size, observations: observations.length }),
  };
}

function amazonBody(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Audit Item',
    store: 'Amazon',
    hasDiscount: true,
    price: 999,
    original_price: 1499,
    image_url: 'https://img.example/a.jpg',
    offer_url: 'https://www.amazon.com.mx/dp/B0AUDIT001',
    description: 'audit',
    ...overrides,
  };
}

describe('FINAL AUDIT — identity A–F', () => {
  let db: ReturnType<typeof createMemoryDb>;
  beforeEach(() => {
    db = createMemoryDb();
  });

  it('A. Amazon mismo ASIN 100 veces → 1 offer, observations idempotentes', async () => {
    const ids = new Set<string>();
    let obsCount = 0;
    for (let i = 0; i < 100; i++) {
      const r = await ingestOfferObservation(db.client as never, {
        createdBy: 'user-1',
        source: 'audit',
        body: amazonBody(),
        onDuplicate: 'reuse',
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        ids.add(r.offerId);
        if (!r.observationReused) obsCount += 1;
      }
    }
    expect(ids.size).toBe(1);
    expect(db.counts().offers).toBe(1);
    expect(obsCount).toBe(1);
    expect(db.counts().observations).toBe(1);
    expect(resolveIngestionIdentity('https://www.amazon.com.mx/dp/B0AUDIT001').key).toBe('amz:B0AUDIT001');
    expect(
      resolveIngestionIdentity('https://www.amazon.com.mx/dp/B0AUDIT001?tag=aventa-20&utm_source=x').key,
    ).toBe('amz:B0AUDIT001');
  });

  it('B. Amazon mismo ASIN precio diferente → 1 offer, 2 observations, conflict', async () => {
    await ingestOfferObservation(db.client as never, {
      createdBy: 'user-1',
      source: 'audit',
      body: amazonBody({ price: 999 }),
      onDuplicate: 'reuse',
    });
    const r = await ingestOfferObservation(db.client as never, {
      createdBy: 'user-1',
      source: 'hunter',
      body: amazonBody({ price: 1099 }),
      onDuplicate: 'reuse',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.created).toBe(false);
    expect(r.conflicts).toContain('price');
    expect(db.counts().offers).toBe(1);
    expect(db.counts().observations).toBe(2);
    expect(db.offers.values().next().value?.price).toBe(999);
  });

  it('C. Amazon mismo ASIN título/imagen diferente → conflict, no overwrite', async () => {
    await ingestOfferObservation(db.client as never, {
      createdBy: 'user-1',
      source: 'audit',
      body: amazonBody({ title: 'Original', image_url: 'https://img/orig.jpg' }),
      onDuplicate: 'reuse',
    });
    const r = await ingestOfferObservation(db.client as never, {
      createdBy: 'user-1',
      source: 'audit',
      body: amazonBody({ title: 'Nuevo título', image_url: 'https://img/new.jpg' }),
      onDuplicate: 'reuse',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.conflicts.some((c) => c === 'title' || c === 'image_url')).toBe(true);
    const offer = db.offers.values().next().value!;
    expect(offer.title).toBe('Original');
    expect(offer.image_url).toBe('https://img/orig.jpg');
  });

  it('D. Mercado Libre mismo ITEM 100 veces → 1 offer', async () => {
    const body = {
      title: 'ML Item',
      store: 'Mercado Libre',
      hasDiscount: true,
      price: 500,
      image_url: 'https://img/ml.jpg',
      offer_url: 'https://articulo.mercadolibre.com.mx/MLM-2936772026-test',
      description: 'ml',
    };
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const r = await ingestOfferObservation(db.client as never, {
        createdBy: 'user-1',
        source: 'audit',
        body,
        onDuplicate: 'reuse',
      });
      expect(r.ok).toBe(true);
      if (r.ok) ids.add(r.offerId);
    }
    expect(ids.size).toBe(1);
    expect(db.counts().offers).toBe(1);
  });

  it('E. misma Liverpool SKU 100 veces → 1 offer', async () => {
    const body = {
      title: 'Liverpool',
      store: 'Liverpool',
      hasDiscount: false,
      price: 300,
      image_url: 'https://img/lvp.jpg',
      offer_url: 'https://www.liverpool.com.mx/tienda/pdp/camisa/12345',
      description: 'liv sku',
    };
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const r = await ingestOfferObservation(db.client as never, {
        createdBy: 'user-1',
        source: 'audit',
        body,
        onDuplicate: 'reuse',
      });
      expect(r.ok).toBe(true);
      if (r.ok) ids.add(r.offerId);
    }
    expect(ids.size).toBe(1);
    const identity = resolveIngestionIdentity(body.offer_url);
    expect(identity.strategy).toBe('liverpool_sku');
    expect(identity.key).toBe('liv:12345');
  });

  it('F. payload sin identity (sin URL) → cada ingest crea offer distinta', async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const r = await ingestOfferObservation(db.client as never, {
        createdBy: 'user-1',
        source: 'audit',
        body: {
          title: `Sin URL ${i}`,
          store: 'Tienda local',
          hasDiscount: false,
          price: 50 + i,
          image_url: '/placeholder.png',
          description: 'no url',
        },
        onDuplicate: 'reuse',
        allowMissingUrl: true,
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.identityKey).toBeNull();
        expect(r.identityStrategy).toBe('none');
        ids.add(r.offerId);
      }
    }
    expect(ids.size).toBe(5);
    expect(db.counts().offers).toBe(5);
    expect(db.counts().observations).toBe(5);
  });
});

describe('FINAL AUDIT — concurrency + merge safety', () => {
  it('concurrent same identity → 1 offer', async () => {
    const db = createMemoryDb();
    const body = amazonBody();
    const results = await Promise.all(
      Array.from({ length: 100 }, () =>
        ingestOfferObservation(db.client as never, {
          createdBy: 'user-1',
          source: 'audit',
          body,
          onDuplicate: 'reuse',
        }),
      ),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    const ids = new Set(results.filter((r) => r.ok).map((r) => (r as { offerId: string }).offerId));
    expect(ids.size).toBe(1);
    expect(db.counts().offers).toBe(1);
  });

  it('approved + nueva evidencia → NO merge campos canónicos', async () => {
    const id = randomUUID();
    const db = createMemoryDb({
      id,
      status: 'approved',
      title: 'Live offer',
      price: 100,
      image_url: 'https://img/live.jpg',
      ingestion_identity_key: 'amz:B0AUDIT001',
      product_fingerprint: 'amz:B0AUDIT001',
    });
    const r = await ingestOfferObservation(db.client as never, {
      createdBy: 'user-1',
      source: 'hunter',
      body: amazonBody({ price: 50, title: 'Hunter cheap', image_url: 'https://img/hunter.jpg' }),
      onDuplicate: 'reuse',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.created).toBe(false);
    const offer = db.offers.get(id)!;
    expect(offer.status).toBe('approved');
    expect(offer.price).toBe(100);
    expect(offer.title).toBe('Live offer');
    expect(db.counts().observations).toBe(1);
  });

  it('published + nueva evidencia → NO merge campos canónicos', async () => {
    const id = randomUUID();
    const db = createMemoryDb({
      id,
      status: 'published',
      title: 'Published',
      price: 200,
      image_url: 'https://img/pub.jpg',
      ingestion_identity_key: 'amz:B0AUDIT001',
    });
    await ingestOfferObservation(db.client as never, {
      createdBy: 'user-1',
      source: 'bot',
      body: amazonBody({ price: 150 }),
      onDuplicate: 'reuse',
    });
    const offer = db.offers.get(id)!;
    expect(offer.price).toBe(200);
    expect(db.counts().observations).toBe(1);
  });
});
