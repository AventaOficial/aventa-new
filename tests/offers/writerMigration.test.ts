import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ingestOfferObservation } from '@/lib/offers/ingestion/ingestOfferObservation';

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
  ingestion_identity_key: string | null;
  product_fingerprint: string | null;
  deleted_at: string | null;
  created_by: string;
  bot_meta?: unknown;
  moderator_comment?: string;
};

function createMemoryDb() {
  const offers = new Map<string, OfferRow>();
  const observations = new Map<string, { id: string; idempotency_key: string; offer_id: string }>();
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
        mode: 'select' | 'insert' | 'update';
        payload?: Record<string, unknown>[];
        filters: Record<string, unknown>;
        updatePatch?: Record<string, unknown>;
        inStatus?: string[];
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
      api.in = (col: string, vals: string[]) => {
        if (col === 'status') state.inStatus = vals;
        return self();
      };
      api.is = () => self();
      api.limit = () => self();
      api.maybeSingle = async () => {
        const key =
          (state.filters.ingestion_identity_key as string | undefined) ||
          (state.filters.product_fingerprint as string | undefined);
        if (key) {
          if (state.filters.ingestion_identity_key) {
            return { data: activeByIdentity(key), error: null };
          }
          for (const row of offers.values()) {
            if (row.product_fingerprint === key && !row.deleted_at) return { data: row, error: null };
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
          status: 'pending',
          title: String(row.title),
          price: Number(row.price),
          original_price: row.original_price == null ? null : Number(row.original_price),
          image_url: String(row.image_url),
          store: String(row.store),
          ingestion_identity_key: identity,
          product_fingerprint: (row.product_fingerprint as string) ?? null,
          deleted_at: null,
          created_by: String(row.created_by),
          bot_meta: row.bot_meta,
          moderator_comment: row.moderator_comment as string | undefined,
        };
        offers.set(id, offer);
        if (identity) identityIndex.set(identity, id);
        return { data: { id, status: 'pending' }, error: null };
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
        return { data: id ? observations.get(id) ?? null : null, error: null };
      };
      api.single = async () => {
        const row = state.payload?.[0];
        if (!row) return { data: null, error: { message: 'empty' } };
        const idem = String(row.idempotency_key);
        if (observationIdem.has(idem)) {
          return { data: null, error: { code: '23505', message: 'duplicate key' } };
        }
        const id = randomUUID();
        observations.set(id, { id, idempotency_key: idem, offer_id: String(row.offer_id) });
        observationIdem.set(idem, id);
        return { data: { id }, error: null };
      };
      return api;
    }
    return {
      insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
    };
  }

  return {
    client: { from, rpc: async () => ({ data: null, error: null }) },
    offers,
    observations,
    counts: () => ({ offers: offers.size, observations: observations.size }),
  };
}

describe('public-style ingest (onDuplicate reject)', () => {
  let db: ReturnType<typeof createMemoryDb>;
  beforeEach(() => {
    db = createMemoryDb();
  });

  const body = {
    title: 'Public Item',
    store: 'Amazon',
    hasDiscount: true,
    price: 100,
    original_price: 200,
    image_url: 'https://img.example/p.jpg',
    offer_url: 'https://www.amazon.com.mx/dp/B0PUBLIC01',
    description: 'desc',
  };

  it('nueva oferta', async () => {
    const r = await ingestOfferObservation(db.client as never, {
      createdBy: 'user-1',
      source: 'community:paste',
      body,
      onDuplicate: 'reject',
      allowMissingUrl: true,
      forceLoteTag: false,
    });
    expect(r.ok && r.created).toBe(true);
  });

  it('misma oferta repetida → 409', async () => {
    await ingestOfferObservation(db.client as never, {
      createdBy: 'user-1',
      source: 'community:paste',
      body,
      onDuplicate: 'reject',
      allowMissingUrl: true,
    });
    const r = await ingestOfferObservation(db.client as never, {
      createdBy: 'user-1',
      source: 'community:paste',
      body,
      onDuplicate: 'reject',
      allowMissingUrl: true,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.httpStatus).toBe(409);
    expect(r.duplicate_offer_id).toBeTruthy();
    expect(db.counts().offers).toBe(1);
    expect(db.counts().observations).toBeGreaterThanOrEqual(1);
  });

  it('tracking params → same identity collision → 409', async () => {
    await ingestOfferObservation(db.client as never, {
      createdBy: 'user-1',
      source: 'community:paste',
      body,
      onDuplicate: 'reject',
      allowMissingUrl: true,
    });
    const r = await ingestOfferObservation(db.client as never, {
      createdBy: 'user-1',
      source: 'community:paste',
      body: { ...body, offer_url: 'https://www.amazon.com.mx/dp/B0PUBLIC01?utm_source=x' },
      onDuplicate: 'reject',
      allowMissingUrl: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.httpStatus).toBe(409);
  });

  it('no identity (missing url) still goes through ingest', async () => {
    const r = await ingestOfferObservation(db.client as never, {
      createdBy: 'user-1',
      source: 'community:paste',
      body: { ...body, offer_url: undefined },
      onDuplicate: 'reject',
      allowMissingUrl: true,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.identityKey).toBeNull();
    expect(r.identityStrategy).toBe('none');
    expect(r.created).toBe(true);
  });

  it('malformed URL → 400', async () => {
    const r = await ingestOfferObservation(db.client as never, {
      createdBy: 'user-1',
      source: 'community:paste',
      body: { ...body, offer_url: 'javascript:alert(1)' },
      onDuplicate: 'reject',
      allowMissingUrl: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.httpStatus).toBe(400);
  });

  it('no privilege escalation via offerExtras from public path omitted', async () => {
    const r = await ingestOfferObservation(db.client as never, {
      createdBy: 'user-1',
      source: 'community:paste',
      body,
      onDuplicate: 'reject',
      allowMissingUrl: true,
      // public route does not pass offerExtras
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const offer = db.offers.get(r.offerId)!;
    expect(offer.bot_meta).toBeUndefined();
    expect(offer.status).toBe('pending');
  });
});

describe('bot-style ingest extras', () => {
  let db: ReturnType<typeof createMemoryDb>;
  beforeEach(() => {
    db = createMemoryDb();
  });

  const body = {
    title: 'Bot Item',
    store: 'Amazon',
    hasDiscount: true,
    price: 50,
    original_price: 80,
    image_url: 'https://img.example/b.jpg',
    offer_url: 'https://www.amazon.com.mx/dp/B0BOTITEM1',
    description: 'bot',
  };

  it('nueva oferta with bot_meta', async () => {
    const r = await ingestOfferObservation(db.client as never, {
      createdBy: 'bot-user',
      source: 'bot',
      body,
      onDuplicate: 'reuse',
      recordSubmissionCount: false,
      offerExtras: {
        bot_meta: { v: 1 },
        moderator_comment: '[bot-ingest] test',
      },
    });
    expect(r.ok && r.created).toBe(true);
    if (!r.ok) return;
    expect(db.offers.get(r.offerId)?.bot_meta).toEqual({ v: 1 });
  });

  it('duplicate price change keeps evidence', async () => {
    await ingestOfferObservation(db.client as never, {
      createdBy: 'bot-user',
      source: 'bot',
      body,
      onDuplicate: 'reuse',
      recordSubmissionCount: false,
    });
    const r = await ingestOfferObservation(db.client as never, {
      createdBy: 'bot-user',
      source: 'bot',
      body: { ...body, price: 45 },
      onDuplicate: 'reuse',
      recordSubmissionCount: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.created).toBe(false);
    expect(r.conflicts).toContain('price');
    expect(db.offers.get(r.offerId)?.price).toBe(50);
    expect(db.counts().observations).toBe(2);
  });

  it('image change on pending fills placeholder only', async () => {
    await ingestOfferObservation(db.client as never, {
      createdBy: 'bot-user',
      source: 'bot',
      body: { ...body, image_url: '/placeholder.png' },
      onDuplicate: 'reuse',
      recordSubmissionCount: false,
    });
    const r = await ingestOfferObservation(db.client as never, {
      createdBy: 'bot-user',
      source: 'bot',
      body: { ...body, image_url: 'https://img.example/new.jpg' },
      onDuplicate: 'reuse',
      recordSubmissionCount: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(db.offers.get(r.offerId)?.image_url).toBe('https://img.example/new.jpg');
  });
});
