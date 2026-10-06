import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryDb, memorySupabase } from '../helpers/memorySupabase';

const serverDb = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => serverDb.current,
}));
vi.mock('@/lib/server/requireAdmin', () => ({
  requireModeration: async () => ({ user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } }),
}));

const { incrementHumanOfferCounter } = await import('@/lib/server/reputation');
const { POST: incrementApproved } = await import('@/app/api/reputation/increment-approved/route');
const { POST: incrementRejected } = await import('@/app/api/reputation/increment-rejected/route');
const { createManualRewardPayout } = await import('@/lib/rewards/payout');

const HUMAN = '11111111-1111-4111-8111-111111111111';
const MACHINE_HUNTER = '22222222-2222-4222-8222-222222222222';
const SYSTEM = '33333333-3333-4333-8333-333333333333';

const prevEnv = { ...process.env };

beforeEach(() => {
  delete process.env.MCP_BOT_AUTHOR_USER_IDS;
  delete process.env.BOT_INGEST_USER_ID;
  delete process.env.BOT_INGEST_USER_ID_TECH;
  delete process.env.BOT_INGEST_USER_ID_STAPLES;
  delete process.env.MONEY_PATH_FROZEN;
});

afterEach(() => {
  process.env = { ...prevEnv };
  vi.restoreAllMocks();
});

function clientFor(authorId: string | null) {
  const db = createMemoryDb({
    tables: {
      machine_clients: authorId ? [{ id: 'mc-1', author_profile_id: authorId, status: 'active' }] : [],
    },
  });
  const sb = memorySupabase(db);
  serverDb.current = sb;
  return { db, sb };
}

describe('contadores de reputación', () => {
  it('HUMAN incrementa; MACHINE_HUNTER y SYSTEM no llaman al RPC', async () => {
    const human = clientFor(null);
    expect(await incrementHumanOfferCounter(human.sb, HUMAN, 'increment_offers_approved_count')).toBe('ok');
    expect(human.db.rpcCalls.map((call) => call.fn)).toEqual(['increment_offers_approved_count']);

    const hunter = clientFor(MACHINE_HUNTER);
    expect(await incrementHumanOfferCounter(hunter.sb, MACHINE_HUNTER, 'increment_offers_submitted_count')).toBe(
      'skipped',
    );
    expect(hunter.db.rpcCalls).toEqual([]);

    process.env.BOT_INGEST_USER_ID = SYSTEM;
    const system = clientFor(null);
    expect(await incrementHumanOfferCounter(system.sb, SYSTEM, 'increment_offers_rejected_count')).toBe('skipped');
    expect(system.db.rpcCalls).toEqual([]);
  });

  it('las rutas de moderación no incrementan a un Machine Hunter', async () => {
    const hunter = clientFor(MACHINE_HUNTER);
    const approved = await incrementApproved(
      new Request('http://local/api/reputation/increment-approved', {
        method: 'POST',
        body: JSON.stringify({ userId: MACHINE_HUNTER }),
      }),
    );
    const rejected = await incrementRejected(
      new Request('http://local/api/reputation/increment-rejected', {
        method: 'POST',
        body: JSON.stringify({ userId: MACHINE_HUNTER }),
      }),
    );
    expect(await approved.json()).toEqual({ ok: true, skipped: 'non_human_actor' });
    expect(await rejected.json()).toEqual({ ok: true, skipped: 'non_human_actor' });
    expect(hunter.db.rpcCalls).toEqual([]);
  });
});

describe('payout manual', () => {
  it('rechaza MACHINE_HUNTER antes de crear un payout', async () => {
    const hunter = clientFor(MACHINE_HUNTER);
    const result = await createManualRewardPayout(hunter.sb, {
      userId: MACHINE_HUNTER,
      amountCents: 5000,
      speiReference: 'SPEI-TEST-0001',
      createdBy: HUMAN,
    });
    expect(result).toMatchObject({ ok: false, status: 403, code: 'non_human_actor' });
    expect(hunter.db.rpcCalls).toEqual([]);
    expect(hunter.db.tables.payout_intents ?? []).toEqual([]);
  });
});
