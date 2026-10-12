import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BATCH_ID,
  BOT_AUTHOR_ID,
  COMMUNITY_BATCH_ID,
  MODERATOR_ID,
  createFakeDb,
  itemRow,
  seedTables,
} from './fakeDb';

const writer = vi.hoisted(() => ({
  createCommunityOfferPending: vi.fn(),
}));
vi.mock('@/lib/offers/createCommunityOffer', () => writer);

const auth = vi.hoisted(() => ({ requireModeration: vi.fn() }));
vi.mock('@/lib/server/requireAdmin', () => auth);

const db = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/lib/supabase/server', () => ({ createServerClient: () => db.current }));

import { pipelineStatusesFor } from '@/lib/huntersAi/contract';
import {
  approveHunterCandidate,
  approveHunterCandidates,
  rejectHunterCandidate,
  rejectHunterCandidates,
} from '@/lib/huntersAi/decide';
import { toHunterCard } from '@/lib/huntersAi/present';
import { rowToSource } from '@/lib/huntersAi/queue';
import { approveOfferBatchItem, getOfferBatchItem } from '@/lib/offers/batch/service';
import { POST } from '@/app/api/admin/hunters-ai/route';

const ITEM_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ITEM_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ITEM_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ITEM_D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

/** Simula el UNIQUE activo de `offers` por identidad: una sola oferta pending por producto. */
function uniqueWriter() {
  const byIdentity = new Map<string, string>();
  let n = 0;
  writer.createCommunityOfferPending.mockImplementation(async (params: { body: { offer_url: string } }) => {
    await Promise.resolve();
    const key = params.body.offer_url;
    const existing = byIdentity.get(key);
    if (existing) {
      return { ok: false, httpStatus: 409, error: 'duplicate', duplicate_offer_id: existing };
    }
    n += 1;
    const id = `offer-${n}`;
    byIdentity.set(key, id);
    return { ok: true, id, status: 'pending' };
  });
  return { created: () => n };
}

function events(tables: Record<string, Record<string, unknown>[]>, action: string) {
  return tables.offer_batch_item_events.filter((e) => e.action === action);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Hunters IA · 1. un candidato Grok válido llega a moderación sin publicarse', () => {
  it('ítem APPROVED con oferta pending se muestra «en moderación», sin aprobar ni rechazar desde aquí', () => {
    const card = toHunterCard(
      rowToSource({
        ...itemRow(ITEM_A, { status: 'APPROVED', offer_id: 'offer-9' }),
        offers: { status: 'pending' },
        offer_batches: { mcp_run_id: 'run-1', machine_client_id: 'mc', machine_clients: { name: 'grok', hunter_code: null } },
      }),
    );
    expect(card.queueStatus).toBe('IN_MODERATION');
    expect(card.moderationHref).toBe('/admin/moderation?focus=offer-9');
    expect(card.canApprove).toBe(false);
    expect(card.canReject).toBe(false);
  });

  it('solo pasa a «aprobada» cuando la oferta quedó aprobada; si moderación la rechaza, aparece rechazada', () => {
    const base = { ...itemRow(ITEM_A, { status: 'APPROVED', offer_id: 'offer-9' }), offer_batches: {} };
    expect(toHunterCard(rowToSource({ ...base, offers: { status: 'approved' } })).queueStatus).toBe('APPROVED');
    const rejected = toHunterCard(rowToSource({ ...base, offers: { status: 'rejected' } }));
    expect(rejected.queueStatus).toBe('REJECTED');
    expect(rejected.rejectionReason).toBe('Rechazada en moderación');
    const deleted = toHunterCard(rowToSource({ ...base, offers: { status: 'approved', deleted_at: '2026-10-10T00:00:00Z' } }));
    expect(deleted.queueStatus).toBe('REJECTED');
    expect(deleted.rejectionReason).toBe('Oferta eliminada');
  });

  it('nunca muestra como descuento el precio que declaró el hunter', () => {
    const card = toHunterCard(rowToSource({ ...itemRow(ITEM_A), offer_batches: {} }));
    expect(card.price).toBe(189);
    expect(card.referencePrice).toBeNull();
    expect(card.discountPercent).toBeNull();
    expect(card.absoluteSavings).toBeNull();
    expect(card.declaredPrice).toBe(150);
    expect(card.declaredReferencePrice).toBe(400);

    const hintOnly = toHunterCard(rowToSource({ ...itemRow(ITEM_A, { price: null }), offer_batches: {} }));
    expect(hintOnly.price).toBeNull();
  });

  it('muestra el código del control que retuvo el candidato', () => {
    const card = toHunterCard(
      rowToSource({ ...itemRow(ITEM_A, { error_code: 'PRICE_SOURCE_UNKNOWN', warnings: ['NO_IMAGES'] }), offer_batches: {} }),
    );
    expect(card.reviewCode).toBe('PRICE_SOURCE_UNKNOWN');
    expect(card.warnings).toEqual(['NO_IMAGES']);
  });

  it('el filtro de pendientes consulta solo estados abiertos para que los cerrados no los desplacen', () => {
    expect(pipelineStatusesFor('PENDING')).toEqual(['INGESTED', 'PROCESSING', 'READY', 'NEEDS_REVIEW', 'ERROR']);
    expect(pipelineStatusesFor('NEEDS_REVIEW')).not.toContain('APPROVED');
    expect(pipelineStatusesFor('IN_MODERATION')).toEqual(['APPROVED']);
    expect(pipelineStatusesFor('ALL')).toBeNull();
  });
});

describe('Hunters IA · 2. un duplicado no crea una segunda oferta', () => {
  it('approve sobre un duplicado responde 409 sin llamar al writer', async () => {
    uniqueWriter();
    const { supabase, tables } = createFakeDb(
      seedTables([itemRow(ITEM_A, { duplicate_status: 'duplicate', duplicate_offer_id: 'offer-existing' })]),
    );
    const result = await approveHunterCandidate({ supabase, batchId: BATCH_ID, itemId: ITEM_A, actorId: MODERATOR_ID });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('DUPLICATE_OFFER');
    expect(writer.createCommunityOfferPending).not.toHaveBeenCalled();
    expect(events(tables, 'approved')).toHaveLength(0);
  });
});

describe('Hunters IA · 3. un candidato rechazado por una quality gate no puede publicarse', () => {
  for (const code of ['NEGATIVE_MEMORY', 'LOW_QUALITY_TITLE']) {
    it(`${code}: approve no reprocesa ni crea oferta`, async () => {
      uniqueWriter();
      const { supabase, tables } = createFakeDb(
        seedTables([itemRow(ITEM_A, { status: 'REJECTED', error_code: code, rejection_reason: `quality:${code}` })]),
      );
      const result = await approveHunterCandidate({ supabase, batchId: BATCH_ID, itemId: ITEM_A, actorId: MODERATOR_ID });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('REJECTED_TERMINAL');
        expect(result.httpStatus).toBe(409);
      }
      expect(writer.createCommunityOfferPending).not.toHaveBeenCalled();
      expect(tables.offer_batch_items[0].status).toBe('REJECTED');
      expect(tables.offer_batch_item_events).toHaveLength(0);
    });
  }

  it('la tarjeta de un rechazado no ofrece aprobar ni seleccionar', () => {
    const card = toHunterCard(rowToSource({ ...itemRow(ITEM_A, { status: 'REJECTED', error_code: 'NEGATIVE_MEMORY' }), offer_batches: {} }));
    expect(card.canApprove).toBe(false);
    expect(card.canReject).toBe(false);
  });
});

describe('Hunters IA · 4. un moderador autorizado aprueba y el flujo existente continúa', () => {
  it('crea una oferta pending con el autor bot y deja traza', async () => {
    uniqueWriter();
    const { supabase, tables } = createFakeDb(seedTables([itemRow(ITEM_A)]));
    const result = await approveHunterCandidate({ supabase, batchId: BATCH_ID, itemId: ITEM_A, actorId: MODERATOR_ID });
    expect(result.ok).toBe(true);
    const call = writer.createCommunityOfferPending.mock.calls[0][0];
    expect(call.createdBy).toBe(BOT_AUTHOR_ID);
    expect(call.sourceDetail).toBe('mcp:batch');
    expect(call.body.original_price).toBeNull();
    expect(call.body.price).toBe(189);
    const item = tables.offer_batch_items[0];
    expect(item.status).toBe('APPROVED');
    expect(item.offer_id).toBe('offer-1');
    const approved = events(tables, 'approved');
    expect(approved).toHaveLength(1);
    expect(approved[0].actor_id).toBe(MODERATOR_ID);
    expect((approved[0].payload as Record<string, unknown>).author).toBe('machine');
  });
});

describe('Hunters IA · 5. un usuario no autorizado no puede moderar', () => {
  for (const action of ['approve', 'approve_many', 'reject_many']) {
    it(`${action} responde el error de requireModeration sin tocar datos`, async () => {
      uniqueWriter();
      const fake = createFakeDb(seedTables([itemRow(ITEM_A)]));
      db.current = fake.supabase;
      auth.requireModeration.mockResolvedValue({ error: 'Forbidden', status: 403 });
      const res = await POST(
        new Request('http://localhost/api/admin/hunters-ai', {
          method: 'POST',
          body: JSON.stringify({
            action,
            batchId: BATCH_ID,
            itemId: ITEM_A,
            items: [{ batchId: BATCH_ID, itemId: ITEM_A }],
            reasonId: 'other',
          }),
        }),
      );
      expect(res.status).toBe(403);
      expect(writer.createCommunityOfferPending).not.toHaveBeenCalled();
      expect(fake.tables.offer_batch_items[0].status).toBe('NEEDS_REVIEW');
      expect(fake.tables.offer_batch_item_events).toHaveLength(0);
    });
  }
});

describe('Hunters IA · 6. decisiones concurrentes dejan un estado consistente', () => {
  it('dos aprobaciones simultáneas crean una sola oferta y un solo evento approved', async () => {
    const w = uniqueWriter();
    const { supabase, tables } = createFakeDb(seedTables([itemRow(ITEM_A)]));
    const [a, b] = await Promise.all([
      approveHunterCandidate({ supabase, batchId: BATCH_ID, itemId: ITEM_A, actorId: MODERATOR_ID }),
      approveHunterCandidate({ supabase, batchId: BATCH_ID, itemId: ITEM_A, actorId: MODERATOR_ID }),
    ]);
    expect(w.created()).toBe(1);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const loser = a.ok ? b : a;
    if (!loser.ok) expect(loser.httpStatus).toBe(409);
    const item = tables.offer_batch_items[0];
    expect(item.status).toBe('APPROVED');
    expect(item.offer_id).toBe('offer-1');
    expect(events(tables, 'approved')).toHaveLength(1);
  });

  it('dos aprobaciones simultáneas crean una sola oferta aunque el writer no deduplique', async () => {
    let n = 0;
    writer.createCommunityOfferPending.mockImplementation(async () => {
      await Promise.resolve();
      n += 1;
      return { ok: true, id: `offer-${n}`, status: 'pending' };
    });
    const { supabase, tables } = createFakeDb(seedTables([itemRow(ITEM_A)]));
    const [a, b] = await Promise.all([
      approveHunterCandidate({ supabase, batchId: BATCH_ID, itemId: ITEM_A, actorId: MODERATOR_ID }),
      approveHunterCandidate({ supabase, batchId: BATCH_ID, itemId: ITEM_A, actorId: MODERATOR_ID }),
    ]);
    expect(n).toBe(1);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const loser = a.ok ? b : a;
    if (!loser.ok) expect(loser.code).toBe('CONCURRENT_DECISION');
    expect(tables.offer_batch_items[0]).toMatchObject({ status: 'APPROVED', offer_id: 'offer-1', lease_expires_at: null });
    expect(events(tables, 'approved')).toHaveLength(1);
  });

  it('si el rechazo ganó antes, la aprobación con lectura vieja no crea oferta', async () => {
    uniqueWriter();
    const { supabase, tables } = createFakeDb(seedTables([itemRow(ITEM_A)]));
    const stale = await getOfferBatchItem(supabase, BATCH_ID, ITEM_A);
    const rejected = await rejectHunterCandidate({ supabase, batchId: BATCH_ID, itemId: ITEM_A, actorId: MODERATOR_ID, reasonId: 'other' });
    expect(rejected.ok).toBe(true);
    const approved = await approveOfferBatchItem({ supabase, item: stale!, actorId: MODERATOR_ID });
    expect(approved.ok).toBe(false);
    if (!approved.ok) expect(approved.code).toBe('CONCURRENT_DECISION');
    expect(writer.createCommunityOfferPending).not.toHaveBeenCalled();
    expect(tables.offer_batch_items[0].status).toBe('REJECTED');
    expect(events(tables, 'approved')).toHaveLength(0);
  });

  it('un rechazo durante la aprobación en curso devuelve conflicto y no pisa la aprobación', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    writer.createCommunityOfferPending.mockImplementation(async () => {
      await gate;
      return { ok: true, id: 'offer-late', status: 'pending' };
    });
    const { supabase, tables } = createFakeDb(seedTables([itemRow(ITEM_A)]));
    const approving = approveHunterCandidate({ supabase, batchId: BATCH_ID, itemId: ITEM_A, actorId: MODERATOR_ID });
    await vi.waitFor(() => expect(writer.createCommunityOfferPending).toHaveBeenCalled());
    expect(tables.offer_batch_items[0].status).toBe('PROCESSING');
    const rejected = await rejectHunterCandidate({ supabase, batchId: BATCH_ID, itemId: ITEM_A, actorId: MODERATOR_ID, reasonId: 'other' });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.code).toBe('CONCURRENT_DECISION');
    release();
    const approved = await approving;
    expect(approved.ok).toBe(true);
    expect(tables.offer_batch_items[0]).toMatchObject({ status: 'APPROVED', offer_id: 'offer-late' });
    expect(events(tables, 'rejected')).toHaveLength(0);
    expect(events(tables, 'approved')).toHaveLength(1);
  });

  it('si el lease vence y el pipeline reclama el ítem, la aprobación no se registra como éxito', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    writer.createCommunityOfferPending.mockImplementation(async () => {
      await gate;
      return { ok: true, id: 'offer-late', status: 'pending' };
    });
    const { supabase, tables } = createFakeDb(seedTables([itemRow(ITEM_A)]));
    const approving = approveHunterCandidate({ supabase, batchId: BATCH_ID, itemId: ITEM_A, actorId: MODERATOR_ID });
    await vi.waitFor(() => expect(writer.createCommunityOfferPending).toHaveBeenCalled());
    Object.assign(tables.offer_batch_items[0], { status: 'INGESTED', lease_expires_at: null });
    release();
    const approved = await approving;
    expect(approved.ok).toBe(false);
    if (!approved.ok) expect(approved.code).toBe('CONCURRENT_DECISION');
    expect(tables.offer_batch_items[0].status).toBe('INGESTED');
    expect(events(tables, 'approved')).toHaveLength(0);
    expect((events(tables, 'approve_conflict')[0].payload as Record<string, unknown>).offer_id).toBe('offer-late');
  });

  it('un fallo del writer libera el reclamo y deja el ítem como estaba', async () => {
    writer.createCommunityOfferPending.mockResolvedValue({ ok: false, httpStatus: 500, error: 'db down' });
    const { supabase, tables } = createFakeDb(seedTables([itemRow(ITEM_A, { status: 'READY' })]));
    const result = await approveHunterCandidate({ supabase, batchId: BATCH_ID, itemId: ITEM_A, actorId: MODERATOR_ID });
    expect(result.ok).toBe(false);
    expect(tables.offer_batch_items[0]).toMatchObject({ status: 'READY', lease_expires_at: null, offer_id: null });
  });

  it('rechazar dos veces es idempotente', async () => {
    const { supabase, tables } = createFakeDb(seedTables([itemRow(ITEM_A)]));
    const args = { supabase, batchId: BATCH_ID, itemId: ITEM_A, actorId: MODERATOR_ID, reasonId: 'other' };
    const [a, b] = await Promise.all([rejectHunterCandidate(args), rejectHunterCandidate(args)]);
    expect(a.ok && b.ok).toBe(true);
    expect(tables.offer_batch_items[0].status).toBe('REJECTED');
  });
});

describe('Hunters IA · 7. la revisión de varios candidatos no omite ni duplica', () => {
  it('aprobación masiva: cada ítem una vez, en orden, con su resultado; ninguna oferta publicada', async () => {
    const w = uniqueWriter();
    const { supabase, tables } = createFakeDb(
      seedTables([
        itemRow(ITEM_A),
        itemRow(ITEM_B, { duplicate_status: 'duplicate', duplicate_offer_id: 'offer-existing' }),
        itemRow(ITEM_C, { price: null }),
        itemRow(ITEM_D, { status: 'REJECTED', error_code: 'NEGATIVE_MEMORY' }),
      ]),
    );
    const t = (itemId: string) => ({ batchId: BATCH_ID, itemId });
    const out = await approveHunterCandidates({
      supabase,
      actorId: MODERATOR_ID,
      items: [t(ITEM_A), t(ITEM_B), t(ITEM_A), t(ITEM_C), t(ITEM_D)],
    });
    expect(out.results.map((r) => [r.itemId, r.outcome])).toEqual([
      [ITEM_A, 'ok'],
      [ITEM_B, 'conflict'],
      [ITEM_C, 'needs_review'],
      [ITEM_D, 'conflict'],
    ]);
    expect(out.ok).toBe(1);
    expect(out.failed).toBe(3);
    expect(w.created()).toBe(1);
    expect(writer.createCommunityOfferPending.mock.calls.every(([p]) => !('status' in p.body))).toBe(true);
    expect(tables.offer_batch_items.find((r) => r.id === ITEM_C)?.status).toBe('NEEDS_REVIEW');
    expect(tables.offer_batch_items.find((r) => r.id === ITEM_D)?.status).toBe('REJECTED');
  });

  it('rechazo masivo: deduplica, informa ya rechazados como idempotentes y no toca los que tienen oferta', async () => {
    const { supabase, tables } = createFakeDb(
      seedTables([
        itemRow(ITEM_A),
        itemRow(ITEM_B, { status: 'REJECTED' }),
        itemRow(ITEM_C, { status: 'APPROVED', offer_id: 'offer-1' }),
      ]),
    );
    const t = (itemId: string) => ({ batchId: BATCH_ID, itemId });
    const out = await rejectHunterCandidates({
      supabase,
      actorId: MODERATOR_ID,
      items: [t(ITEM_A), t(ITEM_A), t(ITEM_B), t(ITEM_C)],
      reasonId: 'not_relevant',
    });
    expect(out.results.map((r) => [r.itemId, r.outcome])).toEqual([
      [ITEM_A, 'ok'],
      [ITEM_B, 'idempotent'],
      [ITEM_C, 'conflict'],
    ]);
    expect(events(tables, 'rejected')).toHaveLength(1);
    expect(tables.offer_batch_items.find((r) => r.id === ITEM_C)?.status).toBe('APPROVED');
  });

  it('la API rechaza más de 50 candidatos en vez de procesar una parte en silencio', async () => {
    const fake = createFakeDb(seedTables([itemRow(ITEM_A)]));
    db.current = fake.supabase;
    auth.requireModeration.mockResolvedValue({ user: { id: MODERATOR_ID } });
    const items = Array.from({ length: 51 }, (_, i) => ({
      batchId: BATCH_ID,
      itemId: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`,
    }));
    const res = await POST(
      new Request('http://localhost/api/admin/hunters-ai', {
        method: 'POST',
        body: JSON.stringify({ action: 'approve_many', items }),
      }),
    );
    expect(res.status).toBe(400);
    expect(writer.createCommunityOfferPending).not.toHaveBeenCalled();
  });

  it('la API autorizada devuelve resultados por ítem', async () => {
    uniqueWriter();
    const fake = createFakeDb(seedTables([itemRow(ITEM_A)]));
    db.current = fake.supabase;
    auth.requireModeration.mockResolvedValue({ user: { id: MODERATOR_ID } });
    const res = await POST(
      new Request('http://localhost/api/admin/hunters-ai', {
        method: 'POST',
        body: JSON.stringify({ action: 'approve_many', items: [{ batchId: BATCH_ID, itemId: ITEM_A }] }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([
      expect.objectContaining({ itemId: ITEM_A, outcome: 'ok', offerId: 'offer-1' }),
    ]);
  });
});

describe('Hunters IA · 8. otras fuentes siguen funcionando', () => {
  it('un lote de comunidad se aprueba con el moderador como autor', async () => {
    uniqueWriter();
    const { supabase, tables } = createFakeDb(seedTables([itemRow(ITEM_A, { batch_id: COMMUNITY_BATCH_ID })]));
    const item = await getOfferBatchItem(supabase, COMMUNITY_BATCH_ID, ITEM_A);
    const result = await approveOfferBatchItem({ supabase, item: item!, actorId: MODERATOR_ID });
    expect(result.ok).toBe(true);
    const call = writer.createCommunityOfferPending.mock.calls[0][0];
    expect(call.createdBy).toBe(MODERATOR_ID);
    expect(call.sourceDetail).toBe('community:batch');
    expect(tables.offer_batch_items[0].status).toBe('APPROVED');
  });

  it('Hunters IA no decide ítems de lotes sin cliente máquina', async () => {
    uniqueWriter();
    const { supabase } = createFakeDb(seedTables([itemRow(ITEM_A, { batch_id: COMMUNITY_BATCH_ID })]));
    const result = await approveHunterCandidate({ supabase, batchId: COMMUNITY_BATCH_ID, itemId: ITEM_A, actorId: MODERATOR_ID });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOUND');
    expect(writer.createCommunityOfferPending).not.toHaveBeenCalled();
  });
});
