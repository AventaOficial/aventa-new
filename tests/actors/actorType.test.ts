import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryDb, memorySupabase } from '../helpers/memorySupabase';

const serverDb = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => serverDb.current,
}));

const {
  countsAsCatalogSupply,
  excludesHumanSurfaces,
  loadActorDirectory,
  resolveActorType,
  resolveActorTypeFromSignals,
} = await import('@/lib/actors/actorType');
const { syncUserAchievements } = await import('@/lib/achievements/sync');
const { isEconomicallyInertAuthor } = await import('@/lib/economy/botAuthorFirewall');
const { evaluatePayoutIntentEligibility } = await import('@/lib/rewards/payoutIntent/eligibility');
const { maybeUnlockRewardsProgram } = await import('@/lib/rewards/unlock');
const { recalculateUserReputation } = await import('@/lib/server/reputation');
const { countQualifyingCommissionOffers } = await import('@/lib/server/commissionEligibility');

const HUMAN = '11111111-1111-4111-8111-111111111111';
const MACHINE_HUNTER = '22222222-2222-4222-8222-222222222222';
const SYSTEM = '33333333-3333-4333-8333-333333333333';

const prevEnv = { ...process.env };

beforeEach(() => {
  delete process.env.MCP_BOT_AUTHOR_USER_IDS;
  delete process.env.BOT_INGEST_USER_ID;
  delete process.env.BOT_INGEST_USER_ID_TECH;
  delete process.env.BOT_INGEST_USER_ID_STAPLES;
});

afterEach(() => {
  process.env = { ...prevEnv };
  vi.restoreAllMocks();
});

describe('resolveActorType', () => {
  it('HUMAN no está declarado ni es autor de un cliente máquina', async () => {
    const sb = memorySupabase(createMemoryDb({ tables: { machine_clients: [] } }));
    expect(resolveActorTypeFromSignals(HUMAN, false)).toBe('HUMAN');
    expect(await resolveActorType(sb, HUMAN)).toBe('HUMAN');
    expect(excludesHumanSurfaces('HUMAN')).toBe(false);
    expect(countsAsCatalogSupply('HUMAN')).toBe(true);
    expect(await isEconomicallyInertAuthor(sb, HUMAN)).toBe(false);
  });

  it('MACHINE_HUNTER es un autor MCP declarado o un author_profile_id, sin mirar nombres', async () => {
    process.env.MCP_BOT_AUTHOR_USER_IDS = MACHINE_HUNTER;
    expect(resolveActorTypeFromSignals(MACHINE_HUNTER, false)).toBe('MACHINE_HUNTER');

    delete process.env.MCP_BOT_AUTHOR_USER_IDS;
    const sb = memorySupabase(
      createMemoryDb({
        tables: {
          machine_clients: [{ id: 'mc-1', author_profile_id: MACHINE_HUNTER, status: 'revoked' }],
        },
      }),
    );
    expect(await resolveActorType(sb, MACHINE_HUNTER)).toBe('MACHINE_HUNTER');
    expect(excludesHumanSurfaces('MACHINE_HUNTER')).toBe(true);
    expect(countsAsCatalogSupply('MACHINE_HUNTER')).toBe(true);
  });

  it('SYSTEM es ingesta, y un error de lectura cierra como SYSTEM', async () => {
    process.env.BOT_INGEST_USER_ID = SYSTEM;
    const sb = memorySupabase(createMemoryDb({ tables: { machine_clients: [] } }));
    expect(await resolveActorType(sb, SYSTEM)).toBe('SYSTEM');
    expect(excludesHumanSurfaces('SYSTEM')).toBe(true);
    expect(countsAsCatalogSupply('SYSTEM')).toBe(true);

    const broken = createMemoryDb();
    broken.failOn.machine_clients = { op: 'select', error: { code: 'XX000', message: 'timeout' } };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await resolveActorType(memorySupabase(broken), HUMAN)).toBe('SYSTEM');
  });

  it('un id de ingesta que además es autor de cliente máquina es MACHINE_HUNTER', async () => {
    process.env.BOT_INGEST_USER_ID = MACHINE_HUNTER;
    const sb = memorySupabase(
      createMemoryDb({
        tables: { machine_clients: [{ id: 'mc-1', author_profile_id: MACHINE_HUNTER, status: 'active' }] },
      }),
    );
    expect(await resolveActorType(sb, MACHINE_HUNTER)).toBe('MACHINE_HUNTER');
  });

  it('el directorio del CEO no cuenta al Machine Hunter como cazador humano', async () => {
    process.env.BOT_INGEST_USER_ID = SYSTEM;
    const sb = memorySupabase(
      createMemoryDb({
        tables: { machine_clients: [{ id: 'mc-1', author_profile_id: MACHINE_HUNTER, status: 'active' }] },
      }),
    );
    const directory = await loadActorDirectory(sb);
    expect(directory).not.toBeNull();
    const authors = [MACHINE_HUNTER, MACHINE_HUNTER, SYSTEM, HUMAN];
    const humans = authors.filter((id) => directory!.classify(id) === 'HUMAN');
    expect(humans).toEqual([HUMAN]);
    expect(directory!.classify(MACHINE_HUNTER)).toBe('MACHINE_HUNTER');
    expect(directory!.classify(SYSTEM)).toBe('SYSTEM');
    expect(directory!.nonHumanIds()).toEqual(expect.arrayContaining([MACHINE_HUNTER, SYSTEM]));
  });
});

describe('Machine Hunter: supply de catálogo sin superficies humanas', () => {
  it('muchas ofertas cuentan en el catálogo y dejan logros, XP, reputación, rewards y payouts en cero', async () => {
    const offerCount = 40;
    const offers = Array.from({ length: offerCount }, (_, index) => ({
      id: `offer-${index}`,
      created_by: MACHINE_HUNTER,
      status: 'approved',
      upvotes_count: 20,
    }));
    const db = createMemoryDb({
      tables: {
        machine_clients: [{ id: 'mc-1', author_profile_id: MACHINE_HUNTER, status: 'active' }],
        offers,
        creator_rewards: [
          {
            id: 'reward-1',
            creator_id: MACHINE_HUNTER,
            creator_share_cents: 5000,
            currency: 'MXN',
            status: 'AVAILABLE',
            ledger_entry_id: 'ledger-1',
            payout_id: null,
          },
        ],
      },
    });
    const sb = memorySupabase(db);
    serverDb.current = sb;

    expect(await resolveActorType(sb, MACHINE_HUNTER)).toBe('MACHINE_HUNTER');

    const catalogSupply = offers.filter((offer) =>
      countsAsCatalogSupply(resolveActorTypeFromSignals(offer.created_by, true)),
    );
    expect(catalogSupply).toHaveLength(offerCount);

    const directory = await loadActorDirectory(sb);
    const humanHunters = new Set(offers.map((offer) => offer.created_by).filter((id) => directory!.classify(id) === 'HUMAN'));
    expect(humanHunters.size).toBe(0);

    const achievements = await syncUserAchievements(sb, MACHINE_HUNTER, {
      eventType: 'OFFER_APPROVED',
      eventId: 'offer-0',
    });
    expect(achievements).toMatchObject({ ok: true, skipped: 'bot', unlocked: [], facts: null });
    expect(db.rpcCalls.some((call) => call.fn === 'grant_achievement_xp')).toBe(false);

    await recalculateUserReputation(MACHINE_HUNTER);
    expect(db.rpcCalls.some((call) => call.fn === 'recalculate_user_reputation')).toBe(false);

    const rewards = await maybeUnlockRewardsProgram(sb, MACHINE_HUNTER);
    expect(rewards).toEqual({ unlocked: false, unlockedAt: null, blockedReason: 'bot_author' });

    const commission = await countQualifyingCommissionOffers(sb, MACHINE_HUNTER);
    expect(commission).toEqual({ qualifyingCount: 0, eligible: false });

    const payout = await evaluatePayoutIntentEligibility(sb as SupabaseClient, 'reward-1');
    expect(payout).toEqual({ ok: false, reason: 'non_human_actor' });
  });

  it('SYSTEM queda fuera de las mismas superficies y su oferta sigue en el catálogo', async () => {
    process.env.BOT_INGEST_USER_ID = SYSTEM;
    const sb = memorySupabase(createMemoryDb({ tables: { machine_clients: [] } }));
    expect(await resolveActorType(sb, SYSTEM)).toBe('SYSTEM');
    expect(countsAsCatalogSupply('SYSTEM')).toBe(true);
    expect(excludesHumanSurfaces(await resolveActorType(sb, SYSTEM))).toBe(true);

    const achievements = await syncUserAchievements(sb, SYSTEM);
    expect(achievements.unlocked).toEqual([]);
    expect(achievements.skipped).toBe('bot');
    const rewards = await maybeUnlockRewardsProgram(sb, SYSTEM);
    expect(rewards.unlocked).toBe(false);
    expect(rewards.blockedReason).toBe('bot_author');
  });
});
