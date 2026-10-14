import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/offers/offerExtraction/extractOfferFromUrl', () => ({
  extractOfferFromUrl: vi.fn(async () => ({
    httpStatus: 200,
    body: {
      title: 'Producto de prueba',
      image: 'https://m.media-amazon.com/images/I/test.jpg',
      images: ['https://m.media-amazon.com/images/I/test.jpg'],
      store: 'Amazon',
      suggested_discount_price: 99,
      suggested_original_price: 149,
      suggested_category: 'Despensa',
      reason: null,
      extraction_status: 'success',
      missing: [],
      diagnostics: { accessFailure: null, extractionErrorCode: null },
    },
    adapter: { provider: 'amazon', blockedByHostPolicy: false, priceSource: 'amazon_html', originalPriceSource: 'amazon_html' },
    core: { provider: 'amazon' },
  })),
}));
import type { MachineClientContext } from '@/lib/mcp/auth';
import { checkOfferExists } from '@/lib/mcp/catalog';
import { submitDealCandidates } from '@/lib/mcp/submissions';
import { offerBatchIdentityKey } from '@/lib/offers/batchPaste/extractOfferUrls';
import { resolveIngestionIdentity } from '@/lib/offers/ingestion/identity';
import { createMemoryDb, mcpUniqueIndexes, memorySupabase, type MemoryDb } from '../helpers/memorySupabase';

const NOW = new Date('2026-10-13T18:00:00.000Z');
const OBSERVED = '2026-10-13T17:30:00.000Z';
const OLD_BATCH = '99999999-9999-4999-8999-999999999999';

function client(): MachineClientContext {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Grok',
    scopes: ['candidates:submit', 'candidates:read', 'catalog:read'],
    status: 'active',
    authorProfileId: '0b0b0b0b-0000-4000-8000-000000000001',
    dailyCandidateCap: 200,
  };
}

function candidate(url: string, over: Record<string, unknown> = {}) {
  return { url, title: 'Producto de prueba', price: 99, originalPrice: 149, currency: 'MXN', note: 'Bajó hoy', observedAt: OBSERVED, ...over };
}

function freshDb(): MemoryDb {
  return createMemoryDb({ unique: mcpUniqueIndexes() });
}

let seq = 0;
function seedOffer(db: MemoryDb, url: string, over: Record<string, unknown> = {}): string {
  const id = `offer-${++seq}`;
  const identity = resolveIngestionIdentity(url);
  (db.tables.offers ??= []).push({
    id,
    offer_url: url,
    ingestion_identity_key: identity.key,
    product_fingerprint: identity.productFingerprint,
    status: 'pending',
    deleted_at: null,
    bot_meta: null,
    expires_at: null,
    ...over,
  });
  return id;
}

function seedItem(db: MemoryDb, url: string, status: string, offerId: string | null) {
  const id = `item-${++seq}`;
  (db.tables.offer_batch_items ??= []).push({ id, batch_id: OLD_BATCH, identity_key: offerBatchIdentityKey(url), url, status, offer_id: offerId });
  return id;
}

async function submit(db: MemoryDb, url: string, key: string, over: Record<string, unknown> = {}) {
  const r = await submitDealCandidates(memorySupabase(db), client(), { runId: 'dedup-run', idempotencyKey: key, candidates: [candidate(url, over)] }, NOW);
  if (!r.ok) throw new Error(`submit falló: ${r.code}`);
  return r;
}

/** El envío quedó bloqueado por un registro activo de la misma identidad (en la entrada o en el writer). */
function blockedAsDuplicate(db: MemoryDb, r: Awaited<ReturnType<typeof submit>>): boolean {
  if (r.data.rejected.some((x) => x.code === 'ALREADY_IN_REVIEW')) return true;
  const batch = db.tables.offer_batches.find((b) => b.id === r.data.submissionId);
  return (db.tables.offer_batch_items ?? []).some((i) => i.batch_id === batch?.id && i.error_code === 'DUPLICATE_OFFER');
}

const prevEnv = { ...process.env };
beforeEach(() => {
  process.env.MCP_INGEST_ENABLED = 'true';
});
afterEach(() => {
  process.env = { ...prevEnv };
  vi.restoreAllMocks();
});

/**
 * Fixtures SINTÉTICOS: las URLs son las de los incidentes reales (Ariel, McCormick, KleenBebé,
 * piloto grok-v3-pilot-20261013-1758), pero las filas se construyen aquí. En producción los tres
 * estaban retenidos por un ítem APPROVED de 2026-10-06 cuya oferta fue rechazada en moderación.
 */
const HISTORICAL = [
  ['Ariel', 'https://www.soriana.com/detergente-en-polvo-ariel-limpieza-profunda-5.5kg/11667079.html'],
  ['McCormick', 'https://www.soriana.com/mayonesa-mccormick-con-jugo-de-limon-507-g/1213681.html'],
  ['KleenBebé', 'https://www.soriana.com/toallitas-suavelastic-max-coco-300-pz/11883955.html'],
] as const;

describe('casos históricos (fixtures sintéticos): check y submit coinciden', () => {
  it.each(HISTORICAL)('%s: ítem APPROVED con oferta rechazada ya no bloquea; check lo anticipa', async (_name, url) => {
    const db = freshDb();
    const oldOffer = seedOffer(db, url, { status: 'rejected' });
    const oldItem = seedItem(db, url, 'APPROVED', oldOffer);

    const check = await checkOfferExists(memorySupabase(db), url, NOW);
    expect(check).toEqual({ ok: true, data: { exists: false, status: 'none', matchedBy: null, canSubmit: true, previouslyRejected: true } });

    const r = await submit(db, url, `hist-${oldItem}`);
    expect(r.data.rejected).toEqual([]);
    expect(r.data.accepted).toEqual([{ index: 0 }]);
    expect(db.tables.offer_batch_items.find((i) => i.id === oldItem)).toMatchObject({ status: 'REJECTED', rejection_reason: 'offer_no_longer_active' });
    expect(db.tables.offers.filter((o) => o.status === 'pending')).toHaveLength(1);
  });

  it.each(HISTORICAL)('%s: mientras la nueva propuesta está en revisión, check dice in_review y submit ALREADY_IN_REVIEW', async (_name, url) => {
    const db = freshDb();
    seedItem(db, url, 'APPROVED', seedOffer(db, url, { status: 'rejected' }));
    await submit(db, url, 'hist-first-1');

    const check = await checkOfferExists(memorySupabase(db), url, NOW);
    expect(check).toMatchObject({ ok: true, data: { status: 'in_review', canSubmit: false } });
    const again = await submit(db, url, 'hist-second-1', { price: 89 });
    expect(again.data.rejected).toEqual([{ index: 0, code: 'ALREADY_IN_REVIEW' }]);
  });
});

describe('consistencia: canSubmit=false exactamente cuando submit rechaza por duplicado', () => {
  const URL = 'https://www.soriana.com/toallitas-suavelastic-max-coco-300-pz/11883955.html';
  const scenarios: Array<[label: string, seed: (db: MemoryDb) => void, expected: { status: string; canSubmit: boolean }]> = [
    ['sin registros', () => {}, { status: 'none', canSubmit: true }],
    ['ítem INGESTED', (db) => seedItem(db, URL, 'INGESTED', null), { status: 'in_review', canSubmit: false }],
    ['ítem NEEDS_REVIEW', (db) => seedItem(db, URL, 'NEEDS_REVIEW', null), { status: 'in_review', canSubmit: false }],
    ['ítem ERROR (sigue abierto)', (db) => seedItem(db, URL, 'ERROR', null), { status: 'in_review', canSubmit: false }],
    ['APPROVED + oferta pending', (db) => seedItem(db, URL, 'APPROVED', seedOffer(db, URL)), { status: 'in_review', canSubmit: false }],
    ['APPROVED + oferta approved', (db) => seedItem(db, URL, 'APPROVED', seedOffer(db, URL, { status: 'approved' })), { status: 'published', canSubmit: false }],
    ['APPROVED + oferta published', (db) => seedItem(db, URL, 'APPROVED', seedOffer(db, URL, { status: 'published' })), { status: 'published', canSubmit: false }],
    [
      'APPROVED + oferta publicada sin clave de identidad (legado)',
      (db) => seedItem(db, URL, 'APPROVED', seedOffer(db, URL, { status: 'published', ingestion_identity_key: null, product_fingerprint: null, offer_url: 'https://www.soriana.com/otra-ruta/1.html' })),
      { status: 'not_visible', canSubmit: false },
    ],
    ['APPROVED + oferta rejected', (db) => seedItem(db, URL, 'APPROVED', seedOffer(db, URL, { status: 'rejected' })), { status: 'none', canSubmit: true }],
    [
      'APPROVED + oferta pending borrada',
      (db) => seedItem(db, URL, 'APPROVED', seedOffer(db, URL, { deleted_at: '2026-10-07T00:00:00Z' })),
      { status: 'none', canSubmit: true },
    ],
    ['ítem REJECTED + oferta rejected', (db) => seedItem(db, URL, 'REJECTED', seedOffer(db, URL, { status: 'rejected' })), { status: 'none', canSubmit: true }],
    ['oferta pending sin ítem (alta humana)', (db) => seedOffer(db, URL), { status: 'in_review', canSubmit: false }],
    ['oferta approved vencida sin ítem', (db) => seedOffer(db, URL, { status: 'approved', expires_at: '2026-10-01T00:00:00Z' }), { status: 'not_visible', canSubmit: false }],
  ];

  it.each(scenarios)('%s', async (_label, seed, expected) => {
    const db = freshDb();
    seed(db);
    const check = await checkOfferExists(memorySupabase(db), URL, NOW);
    expect(check).toMatchObject({ ok: true, data: expected });
    const r = await submit(db, URL, `cons-${++seq}-key`);
    expect(blockedAsDuplicate(db, r)).toBe(!expected.canSubmit);
  });
});

describe('URLs equivalentes y parámetros', () => {
  const CANON = 'https://www.amazon.com.mx/dp/B0DEDUPAAA';

  it.each([
    ['ruta con título', 'https://www.amazon.com.mx/Toallitas-Humedas/dp/B0DEDUPAAA'],
    ['gp/product', 'https://www.amazon.com.mx/gp/product/B0DEDUPAAA'],
    ['barra final', 'https://www.amazon.com.mx/dp/B0DEDUPAAA/'],
  ])('%s => misma identidad: check y submit bloquean', async (_label, variant) => {
    const db = freshDb();
    seedItem(db, CANON, 'APPROVED', seedOffer(db, CANON));
    const check = await checkOfferExists(memorySupabase(db), variant, NOW);
    expect(check).toMatchObject({ ok: true, data: { status: 'in_review', matchedBy: 'product_identity', canSubmit: false } });
    expect(blockedAsDuplicate(db, await submit(db, variant, `eq-${++seq}-key`))).toBe(true);
  });

  it('mayúsculas y barra final en URL de tienda genérica => misma identidad de lote', async () => {
    const url = HISTORICAL[2][1];
    const db = freshDb();
    seedItem(db, url, 'NEEDS_REVIEW', null);
    const variant = url.replace('www.soriana.com', 'WWW.Soriana.com') + '/';
    expect(await checkOfferExists(memorySupabase(db), variant, NOW)).toMatchObject({ ok: true, data: { status: 'in_review', canSubmit: false } });
    expect((await submit(db, variant, 'eq-case-key')).data.rejected).toEqual([{ index: 0, code: 'ALREADY_IN_REVIEW' }]);
  });

  it('con y sin www: el lote no choca, pero check y el writer coinciden en duplicado', async () => {
    const url = HISTORICAL[0][1];
    const bare = url.replace('https://www.', 'https://');
    const db = freshDb();
    seedItem(db, url, 'APPROVED', seedOffer(db, url));
    expect(await checkOfferExists(memorySupabase(db), bare, NOW)).toMatchObject({ ok: true, data: { status: 'in_review', matchedBy: 'product_identity', canSubmit: false } });
    const r = await submit(db, bare, 'eq-www-key');
    expect(r.data.rejected).toEqual([]);
    expect(blockedAsDuplicate(db, r)).toBe(true);
  });

  it('parámetros de tracking: check y submit rechazan la URL igual, sin quitarlos a ciegas', async () => {
    const db = freshDb();
    const sb = memorySupabase(db);
    expect(await checkOfferExists(sb, `${CANON}?tag=afiliado-20`, NOW)).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    const r = await submit(db, `${CANON}?tag=afiliado-20`, 'eq-track-key');
    expect(r.data.rejected).toEqual([{ index: 0, code: 'INVALID_URL' }]);
  });

  it('otro producto del mismo sitio no coincide (sin coincidencia por título)', async () => {
    const db = freshDb();
    seedItem(db, CANON, 'APPROVED', seedOffer(db, CANON));
    const other = 'https://www.amazon.com.mx/dp/B0DEDUPBBB';
    expect(await checkOfferExists(memorySupabase(db), other, NOW)).toMatchObject({ ok: true, data: { status: 'none', canSubmit: true } });
    expect((await submit(db, other, 'eq-other-key', { title: 'Producto de prueba' })).data.accepted).toEqual([{ index: 0 }]);
  });
});

describe('nueva promoción del mismo producto', () => {
  const URL = HISTORICAL[1][1];

  it('tras un rechazo: previouslyRejected=true y se acepta con precio nuevo', async () => {
    const db = freshDb();
    seedOffer(db, URL, { status: 'rejected' });
    const check = await checkOfferExists(memorySupabase(db), URL, NOW);
    expect(check).toEqual({ ok: true, data: { exists: false, status: 'none', matchedBy: null, canSubmit: true, previouslyRejected: true } });
    const r = await submit(db, URL, 'promo-new-key', { price: 79 });
    expect(r.data.accepted).toEqual([{ index: 0 }]);
    expect(blockedAsDuplicate(db, r)).toBe(false);
  });

  it('con la anterior todavía activa: la identidad del producto bloquea aunque cambie el precio', async () => {
    const db = freshDb();
    seedItem(db, URL, 'APPROVED', seedOffer(db, URL));
    expect(await checkOfferExists(memorySupabase(db), URL, NOW)).toMatchObject({ ok: true, data: { canSubmit: false } });
    expect(blockedAsDuplicate(db, await submit(db, URL, 'promo-active-key', { price: 59 }))).toBe(true);
  });
});

describe('concurrencia, reintentos y errores', () => {
  const URL = HISTORICAL[2][1];

  it('dos envíos simultáneos sobre un retenedor caducado: un solo ganador', async () => {
    const db = freshDb();
    seedItem(db, URL, 'APPROVED', seedOffer(db, URL, { status: 'rejected' }));
    const sb = memorySupabase(db);
    const send = (key: string) => submitDealCandidates(sb, client(), { runId: 'dedup-run', idempotencyKey: key, candidates: [candidate(URL)] }, NOW);
    const [a, b] = await Promise.all([send('race-a-key'), send('race-b-key')]);
    const results = [a, b].map((x) => (x.ok ? x.data : null));
    expect(results.filter((d) => d?.accepted.length === 1)).toHaveLength(1);
    expect(results.filter((d) => d?.rejected.some((x) => x.code === 'ALREADY_IN_REVIEW'))).toHaveLength(1);
    const open = db.tables.offer_batch_items.filter((i) => i.identity_key === offerBatchIdentityKey(URL) && i.status !== 'REJECTED');
    expect(open).toHaveLength(1);
  });

  it('reintento idempotente tras liberar: mismo resultado, sin ítems ni ofertas nuevas', async () => {
    const db = freshDb();
    seedItem(db, URL, 'APPROVED', seedOffer(db, URL, { status: 'rejected' }));
    const first = await submit(db, URL, 'retry-key-1');
    const items = db.tables.offer_batch_items.length;
    const offers = db.tables.offers.length;
    const replay = await submitDealCandidates(memorySupabase(db), client(), { runId: 'dedup-run', idempotencyKey: 'retry-key-1', candidates: [candidate(URL)] }, NOW);
    expect(replay.ok && replay.replay).toBe(true);
    expect(replay.ok && replay.data).toEqual(first.data);
    expect(db.tables.offer_batch_items).toHaveLength(items);
    expect(db.tables.offers).toHaveLength(offers);
  });

  it('si no se puede liberar el retenedor, submit falla cerrado (ALREADY_IN_REVIEW)', async () => {
    const db = freshDb();
    const oldItem = seedItem(db, URL, 'APPROVED', seedOffer(db, URL, { status: 'rejected' }));
    db.failOn.offer_batch_items = { op: 'update', error: { message: 'boom' } };
    const r = await submit(db, URL, 'fail-release-key');
    expect(r.data.rejected).toEqual([{ index: 0, code: 'ALREADY_IN_REVIEW' }]);
    expect(db.tables.offer_batch_items.find((i) => i.id === oldItem)?.status).toBe('APPROVED');
  });

  it('error de base en check => INTERNAL_ERROR sin detalles', async () => {
    for (const table of ['offers', 'offer_batch_items']) {
      const db = freshDb();
      db.failOn[table] = { op: 'select', error: { message: 'relation secret_internal does not exist' } };
      const r = await checkOfferExists(memorySupabase(db), URL, NOW);
      expect(r).toMatchObject({ ok: false, code: 'INTERNAL_ERROR' });
      expect(JSON.stringify(r)).not.toContain('secret_internal');
    }
  });

  it('la liberación sólo toca ítems APPROVED cuya oferta ya no está activa', async () => {
    const db = freshDb();
    const live = seedItem(db, URL, 'APPROVED', seedOffer(db, URL, { status: 'published' }));
    await submit(db, URL, 'no-touch-key');
    expect(db.tables.offer_batch_items.find((i) => i.id === live)?.status).toBe('APPROVED');
  });
});
