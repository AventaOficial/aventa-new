import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryDb, memorySupabase, type MemoryDb } from '../helpers/memorySupabase';
import { emptyMachineClientsTable, machineClientsTableWithAuthor } from '../helpers/machineClientsTable';

const writer = vi.hoisted(() => ({
  calls: [] as Array<{ createdBy: string; sourceDetail?: string; recordSubmissionCount?: boolean }>,
}));
vi.mock('@/lib/offers/createCommunityOffer', () => ({
  createCommunityOfferPending: vi.fn(async (p: { createdBy: string; sourceDetail?: string; recordSubmissionCount?: boolean }) => {
    writer.calls.push({ createdBy: p.createdBy, sourceDetail: p.sourceDetail, recordSubmissionCount: p.recordSubmissionCount });
    return { ok: true, id: 'offer-new-1', status: 'pending' };
  }),
}));

const serverDb = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => serverDb.current,
}));

const { approveOfferBatchItem, normalizeItemRow } = await import('@/lib/offers/batch/service');
const { isEconomicallyInertAuthor, isEconomicallyInertUserId } = await import('@/lib/economy/botAuthorFirewall');
const { syncUserAchievements } = await import('@/lib/achievements/sync');
const { maybeUnlockRewardsProgram } = await import('@/lib/rewards/unlock');
const { countQualifyingCommissionOffers } = await import('@/lib/server/commissionEligibility');
const { recalculateUserReputation } = await import('@/lib/server/reputation');
const { resolveCommissionAttribution } = await import('@/lib/rewards/attribution/matcher');
const { encodeAventaSubId } = await import('@/lib/rewards/adapters/types');

const MODERATOR = 'aaaaaaaa-0000-4000-8000-00000000000a';
const BOT_AUTHOR = 'b0b0b0b0-0000-4000-8000-00000000000b';
const HUMAN = 'cccccccc-0000-4000-8000-00000000000c';
const CLIENT_ID = 'dddddddd-0000-4000-8000-00000000000d';

const prevEnv = { ...process.env };
beforeEach(() => {
  writer.calls = [];
  delete process.env.MCP_BOT_AUTHOR_USER_IDS;
  delete process.env.BOT_INGEST_USER_ID;
});
afterEach(() => {
  process.env = { ...prevEnv };
  vi.restoreAllMocks();
});

function readyItem(batchId: string) {
  return normalizeItemRow({
    id: 'item-1',
    batch_id: batchId,
    position: 1,
    status: 'READY',
    identity_key: 'amz:B0TESTAAAA',
    source_url: 'https://www.amazon.com.mx/dp/B0TESTAAAA',
    normalized_url: 'https://www.amazon.com.mx/dp/B0TESTAAAA',
    canonical_url: 'https://www.amazon.com.mx/dp/B0TESTAAAA',
    store: 'Amazon',
    title: 'Audífonos',
    images: ['https://m.media-amazon.com/images/I/x.jpg'],
    price: 499,
    original_price: 899,
    duplicate_status: 'none',
    evidence: {},
    warnings: [],
  });
}

function batchDb(machineClient: Record<string, unknown> | null, batchMachineClientId: string | null): MemoryDb {
  return createMemoryDb({
    tables: {
      offer_batches: [{ id: 'batch-1', created_by: BOT_AUTHOR, machine_client_id: batchMachineClientId, status: 'ready', meta: {} }],
      offer_batch_items: [{ ...readyItem('batch-1') }],
      machine_clients: machineClient ? [machineClient] : [],
    },
  });
}

describe('autoría al aprobar un ítem MCP', () => {
  it('created_by = machine_clients.author_profile_id, nunca el moderador', async () => {
    const db = batchDb({ id: CLIENT_ID, author_profile_id: BOT_AUTHOR, status: 'active' }, CLIENT_ID);
    const r = await approveOfferBatchItem({ supabase: memorySupabase(db), item: readyItem('batch-1'), actorId: MODERATOR });
    expect(r.ok).toBe(true);
    expect(writer.calls).toEqual([{ createdBy: BOT_AUTHOR, sourceDetail: 'mcp:batch', recordSubmissionCount: false }]);
    expect(writer.calls[0].createdBy).not.toBe(MODERATOR);
  });

  it('el moderador queda en la auditoría del lote, con el origen máquina', async () => {
    const db = batchDb({ id: CLIENT_ID, author_profile_id: BOT_AUTHOR, status: 'revoked' }, CLIENT_ID);
    await approveOfferBatchItem({ supabase: memorySupabase(db), item: readyItem('batch-1'), actorId: MODERATOR });
    const approved = (db.tables.offer_batch_item_events ?? []).find((e) => e.action === 'approved');
    expect(approved?.actor_id).toBe(MODERATOR);
    expect(approved?.payload).toMatchObject({ author: 'machine', machine_client_id: CLIENT_ID });
  });

  it('si el autor bot no se puede resolver, falla cerrado y no escribe', async () => {
    const db = batchDb(null, CLIENT_ID);
    const r = await approveOfferBatchItem({ supabase: memorySupabase(db), item: readyItem('batch-1'), actorId: MODERATOR });
    expect(r).toMatchObject({ ok: false, code: 'MACHINE_AUTHOR_UNAVAILABLE' });
    expect(writer.calls).toEqual([]);
  });

  it('lectura del lote con error => falla cerrado', async () => {
    const db = batchDb({ id: CLIENT_ID, author_profile_id: BOT_AUTHOR }, CLIENT_ID);
    db.failOn.offer_batches = { op: 'select', error: { code: 'XX000', message: 'boom' } };
    const r = await approveOfferBatchItem({ supabase: memorySupabase(db), item: readyItem('batch-1'), actorId: MODERATOR });
    expect(r).toMatchObject({ ok: false, code: 'MACHINE_AUTHOR_UNAVAILABLE' });
    expect(writer.calls).toEqual([]);
  });

  it('lote humano conserva el comportamiento: autor = quien aprueba', async () => {
    const db = batchDb(null, null);
    await approveOfferBatchItem({ supabase: memorySupabase(db), item: readyItem('batch-1'), actorId: MODERATOR });
    expect(writer.calls).toEqual([{ createdBy: MODERATOR, sourceDetail: 'community:batch', recordSubmissionCount: undefined }]);
  });

  it('antes de la migración (columna inexistente) todo lote es humano', async () => {
    const db = batchDb(null, null);
    db.failOn.offer_batches = { op: 'select', error: { code: '42703', message: 'column offer_batches.machine_client_id does not exist' } };
    await approveOfferBatchItem({ supabase: memorySupabase(db), item: readyItem('batch-1'), actorId: MODERATOR });
    expect(writer.calls[0]?.createdBy).toBe(MODERATOR);
  });
});

describe('firewall económico: identificación del autor bot', () => {
  it('entorno: BOT_INGEST_USER_ID y MCP_BOT_AUTHOR_USER_IDS', async () => {
    process.env.MCP_BOT_AUTHOR_USER_IDS = ` ${BOT_AUTHOR} , other `;
    expect(isEconomicallyInertUserId(BOT_AUTHOR)).toBe(true);
    expect(isEconomicallyInertUserId(HUMAN)).toBe(false);
    process.env.BOT_INGEST_USER_ID = HUMAN;
    expect(isEconomicallyInertUserId(HUMAN)).toBe(true);
  });

  it('base de datos: cualquier machine_clients.author_profile_id, aunque esté revocado', async () => {
    const db = createMemoryDb({ tables: { machine_clients: [{ id: CLIENT_ID, author_profile_id: BOT_AUTHOR, status: 'revoked' }] } });
    const sb = memorySupabase(db);
    expect(await isEconomicallyInertAuthor(sb, BOT_AUTHOR)).toBe(true);
    expect(await isEconomicallyInertAuthor(sb, HUMAN)).toBe(false);
    expect(await isEconomicallyInertAuthor(sb, null)).toBe(false);
  });

  it('tabla ausente => sólo entorno; otro error => falla cerrado (inerte)', async () => {
    const missing = createMemoryDb();
    missing.failOn.machine_clients = { op: 'select', error: { code: '42P01', message: 'relation "machine_clients" does not exist' } };
    expect(await isEconomicallyInertAuthor(memorySupabase(missing), HUMAN)).toBe(false);
    const broken = createMemoryDb();
    broken.failOn.machine_clients = { op: 'select', error: { code: 'XX000', message: 'timeout' } };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await isEconomicallyInertAuthor(memorySupabase(broken), HUMAN)).toBe(true);
  });
});

function trackingSupabase(machineClients: () => unknown) {
  const touched: string[] = [];
  const sb = {
    from: (table: string) => {
      touched.push(table);
      if (table === 'machine_clients') return machineClients();
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'is', 'gte', 'lte', 'order', 'limit', 'update', 'insert', 'upsert']) q[m] = () => q;
      q.maybeSingle = async () => ({ data: null, error: null });
      q.single = async () => ({ data: null, error: null });
      q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null, count: 0 });
      return q;
    },
    rpc: vi.fn(async () => ({ data: null, error: null })),
  };
  return { sb: sb as unknown as SupabaseClient, touched, rpc: sb.rpc };
}

describe('firewall económico: autor bot => económicamente inerte', () => {
  it('reputación: no recalcula para el bot; sí para el humano', async () => {
    const bot = trackingSupabase(() => machineClientsTableWithAuthor(BOT_AUTHOR));
    serverDb.current = bot.sb;
    await recalculateUserReputation(BOT_AUTHOR);
    expect(bot.rpc).not.toHaveBeenCalled();
    const human = trackingSupabase(() => emptyMachineClientsTable());
    serverDb.current = human.sb;
    await recalculateUserReputation(HUMAN);
    expect(human.rpc).toHaveBeenCalledWith('recalculate_user_reputation', { p_user_id: HUMAN });
  });

  it('logros: el bot no evalúa ni desbloquea', async () => {
    const bot = trackingSupabase(() => machineClientsTableWithAuthor(BOT_AUTHOR));
    const r = await syncUserAchievements(bot.sb, BOT_AUTHOR, { eventType: 'OFFER_APPROVED', eventId: 'o1' } as never);
    expect(r).toMatchObject({ ok: true, skipped: 'bot', unlocked: [] });
    expect(bot.touched).toEqual(['machine_clients']);
  });

  it('Rewards: el bot no desbloquea ni toca perfiles', async () => {
    const bot = trackingSupabase(() => machineClientsTableWithAuthor(BOT_AUTHOR));
    const r = await maybeUnlockRewardsProgram(bot.sb, BOT_AUTHOR, MODERATOR);
    expect(r).toEqual({ unlocked: false, unlockedAt: null, blockedReason: 'bot_author' });
    expect(bot.touched).toEqual(['machine_clients']);
  });

  it('Rewards: el humano no se bloquea por bot_author', async () => {
    const human = trackingSupabase(() => emptyMachineClientsTable());
    const r = await maybeUnlockRewardsProgram(human.sb, HUMAN, MODERATOR);
    expect(r.blockedReason).not.toBe('bot_author');
  });

  it('comisiones: el bot nunca califica', async () => {
    const bot = trackingSupabase(() => machineClientsTableWithAuthor(BOT_AUTHOR));
    expect(await countQualifyingCommissionOffers(bot.sb, BOT_AUTHOR)).toEqual({ qualifyingCount: 0, eligible: false });
    expect(bot.touched).toEqual(['machine_clients']);
  });

  it('atribución de comisión: oferta del bot no se atribuye; la del humano sí', async () => {
    const OFFER = 'eeeeeeee-0000-4000-8000-00000000000e';
    const CLICK = 'ffffffff-0000-4000-8000-00000000000f';
    const make = (creator: string, machine: () => unknown) =>
      ({
        from: (table: string) => {
          if (table === 'machine_clients') return machine();
          const q: Record<string, unknown> = {};
          for (const m of ['select', 'eq', 'gte', 'lte', 'order']) q[m] = () => q;
          if (table === 'reward_outbound_clicks') {
            q.limit = async () => ({ data: [{ id: CLICK, offer_id: OFFER }], error: null });
            q.maybeSingle = async () => ({ data: { id: CLICK, offer_id: OFFER }, error: null });
          } else {
            q.maybeSingle = async () => ({ data: { id: OFFER, created_by: creator }, error: null });
          }
          return q;
        },
      }) as unknown as SupabaseClient;
    const ledger = {
      id: 'ledger-1',
      network: 'amazon' as const,
      amount_cents: 1000,
      status: 'confirmed',
      sub_id_raw: encodeAventaSubId(OFFER, CLICK),
    };
    const bot = await resolveCommissionAttribution(make(BOT_AUTHOR, () => machineClientsTableWithAuthor(BOT_AUTHOR)), ledger);
    expect(bot.matched).toBe(false);
    const human = await resolveCommissionAttribution(make(HUMAN, () => emptyMachineClientsTable()), ledger);
    expect(human.matched && human.match.creatorId).toBe(HUMAN);
  });
});

describe('firewall económico: moderate-offer', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/admin/moderate-offer/route.ts'), 'utf8');
  const tail = route.slice(route.indexOf('const economicAuthor'));

  it('decide el autor económico con el firewall central', () => {
    expect(route).toContain("import { isEconomicallyInertAuthor } from '@/lib/economy/botAuthorFirewall'");
    expect(tail.split('\n')[0]).toContain('!(await isEconomicallyInertAuthor(supabase, createdBy))');
  });

  it('reputación, logros, unlock, notificación y correo sólo usan economicAuthor (aprobar y rechazar)', () => {
    expect(tail).toMatch(/if \(economicAuthor\) recalculateUserReputation\(economicAuthor\)/);
    expect(tail).toMatch(/syncAchievementsLater\(supabase, \[economicAuthor\]/);
    expect(tail).toMatch(/maybeUnlockRewardsProgram\(supabase, economicAuthor,/);
    expect(tail).toMatch(/getUserById\(economicAuthor\)/);
    expect((tail.match(/user_id: economicAuthor/g) ?? []).length).toBe(2);
    expect(tail).toMatch(/status === 'rejected' && economicAuthor/);
    const afterDecl = tail.split('\n').slice(1).join('\n');
    expect(afterDecl).not.toMatch(/\bcreatedBy\b/);
  });
});
