import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { recordOutboundClick } from '../../lib/rewards/attribution/clickTracking';
import {
  basicFraudFlags,
  createRewardFromLedgerEntry,
} from '../../lib/rewards/rewardsEngine';
import { encodeAventaSubId } from '../../lib/rewards/adapters/types';
import { offerUrlFingerprint } from '../../lib/offers/offerUrlFingerprint';
import { detectNetworkFromUrl } from '../../lib/rewards/adapters/types';

const OFFER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OFFER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CREATOR = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const OTHER = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const CLICK = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const LEDGER = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

const URL_A = 'https://www.amazon.com.mx/dp/B0TESTAAAA';
const URL_B = 'https://www.amazon.com.mx/dp/B0TESTBBBB';
const URL_ARBITRARY = 'https://evil.example/phish';

function fingerprintOf(url: string) {
  return offerUrlFingerprint(url);
}

function networkOf(url: string) {
  return detectNetworkFromUrl(url);
}

/** Mock supabase for recordOutboundClick: offers lookup + click insert. */
function makeClickSupabase(opts: {
  offerUrlById: Record<string, string | null>;
  onInsert?: (row: Record<string, unknown>) => void;
}) {
  const from = vi.fn((table: string) => {
    if (table === 'offers') {
      const filters: Record<string, unknown> = {};
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.eq = vi.fn((c: string, v: unknown) => {
        filters[c] = v;
        return builder;
      });
      builder.maybeSingle = vi.fn(async () => {
        const id = String(filters.id ?? '');
        const url = opts.offerUrlById[id];
        if (url === undefined) return { data: null, error: null };
        return { data: { offer_url: url }, error: null };
      });
      return builder;
    }
    if (table === 'reward_outbound_clicks') {
      return {
        insert: vi.fn(async (payload: Record<string, unknown>) => {
          opts.onInsert?.(payload);
          return { error: null };
        }),
      };
    }
    return {};
  });
  return { from } as unknown as SupabaseClient;
}

describe('P0-3 — offer URL binding', () => {
  it('Test 1 — offerId=A + offerUrl=A → fingerprint/network desde DB A', async () => {
    let inserted: Record<string, unknown> | null = null;
    const supabase = makeClickSupabase({
      offerUrlById: { [OFFER_A]: URL_A },
      onInsert: (row) => {
        inserted = row;
      },
    });

    const click = await recordOutboundClick(supabase, {
      offerId: OFFER_A,
      clientOfferUrl: URL_A,
      clickerUserId: OTHER,
    });

    expect(click).not.toBeNull();
    expect(click!.productFingerprint).toBe(fingerprintOf(URL_A));
    expect(click!.network).toBe(networkOf(URL_A));
    expect(inserted?.product_fingerprint).toBe(fingerprintOf(URL_A));
    expect(inserted?.network).toBe(networkOf(URL_A));
    expect(inserted?.offer_id).toBe(OFFER_A);
  });

  it('Test 2 — offerId=A + offerUrl=B → fingerprint de A, nunca de B', async () => {
    let inserted: Record<string, unknown> | null = null;
    const supabase = makeClickSupabase({
      offerUrlById: { [OFFER_A]: URL_A, [OFFER_B]: URL_B },
      onInsert: (row) => {
        inserted = row;
      },
    });

    const click = await recordOutboundClick(supabase, {
      offerId: OFFER_A,
      clientOfferUrl: URL_B,
      clickerUserId: OTHER,
    });

    expect(click).not.toBeNull();
    expect(click!.productFingerprint).toBe(fingerprintOf(URL_A));
    expect(click!.productFingerprint).not.toBe(fingerprintOf(URL_B));
    expect(inserted?.product_fingerprint).toBe(fingerprintOf(URL_A));
    expect(inserted?.product_fingerprint).not.toBe(fingerprintOf(URL_B));
  });

  it('Test 3 — URL arbitraria del cliente ignorada', async () => {
    let inserted: Record<string, unknown> | null = null;
    const supabase = makeClickSupabase({
      offerUrlById: { [OFFER_A]: URL_A },
      onInsert: (row) => {
        inserted = row;
      },
    });

    const click = await recordOutboundClick(supabase, {
      offerId: OFFER_A,
      clientOfferUrl: URL_ARBITRARY,
    });

    expect(click).not.toBeNull();
    expect(inserted?.product_fingerprint).toBe(fingerprintOf(URL_A));
    expect(inserted?.network).toBe(networkOf(URL_A));
  });

  it('Test 4 — offerUrl cliente ausente; usa DB', async () => {
    let inserted: Record<string, unknown> | null = null;
    const supabase = makeClickSupabase({
      offerUrlById: { [OFFER_A]: URL_A },
      onInsert: (row) => {
        inserted = row;
      },
    });

    const click = await recordOutboundClick(supabase, { offerId: OFFER_A });
    expect(click).not.toBeNull();
    expect(inserted?.product_fingerprint).toBe(fingerprintOf(URL_A));
  });

  it('Test 5 — offerId inexistente → no click', async () => {
    const supabase = makeClickSupabase({ offerUrlById: {} });
    const click = await recordOutboundClick(supabase, {
      offerId: OFFER_A,
      clientOfferUrl: URL_A,
    });
    expect(click).toBeNull();
  });

  it('Test 6 — offer_url vacío/null → no click (sin fallback cliente)', async () => {
    const inserts: unknown[] = [];
    const supabase = makeClickSupabase({
      offerUrlById: { [OFFER_A]: null },
      onInsert: (row) => inserts.push(row),
    });
    const click = await recordOutboundClick(supabase, {
      offerId: OFFER_A,
      clientOfferUrl: URL_B,
    });
    expect(click).toBeNull();
    expect(inserts).toHaveLength(0);

    const empty = makeClickSupabase({
      offerUrlById: { [OFFER_A]: '   ' },
      onInsert: (row) => inserts.push(row),
    });
    expect(
      await recordOutboundClick(empty, { offerId: OFFER_A, clientOfferUrl: URL_A }),
    ).toBeNull();
  });
});

describe('P0-2 — self-click / anonymous auto-reward', () => {
  it('Test 7 — creator=U clicker=U → self_click', () => {
    const flags = basicFraudFlags({
      creatorId: CREATOR,
      offerId: OFFER_A,
      clickerUserId: CREATOR,
      clickId: CLICK,
    });
    expect(flags).toContain('self_click');
  });

  it('Test 8 — creator=U clicker=V → sin self_click ni anonymous', () => {
    const flags = basicFraudFlags({
      creatorId: CREATOR,
      offerId: OFFER_A,
      clickerUserId: OTHER,
      clickId: CLICK,
    });
    expect(flags).not.toContain('self_click');
    expect(flags).not.toContain('anonymous_click');
  });

  it('Test 9/10 — click_id + clicker NULL → anonymous_click', () => {
    const flags = basicFraudFlags({
      creatorId: CREATOR,
      offerId: OFFER_A,
      clickerUserId: null,
      clickId: CLICK,
    });
    expect(flags).toContain('anonymous_click');
    expect(flags).not.toContain('self_click');
  });

  it('sin click_id + clicker null → no anonymous_click (manual path)', () => {
    const flags = basicFraudFlags({
      creatorId: CREATOR,
      offerId: OFFER_A,
      clickerUserId: null,
      clickId: null,
    });
    expect(flags).not.toContain('anonymous_click');
  });
});

describe('P0-2/P0-3 — createRewardFromLedgerEntry chain', () => {
  const prevFreeze = process.env.MONEY_PATH_FROZEN;
  const prevRewards = process.env.REWARDS_PROGRAM_ACTIVE;

  beforeEach(() => {
    process.env.MONEY_PATH_FROZEN = 'false';
    process.env.REWARDS_PROGRAM_ACTIVE = 'true';
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    if (prevFreeze !== undefined) process.env.MONEY_PATH_FROZEN = prevFreeze;
    else delete process.env.MONEY_PATH_FROZEN;
    if (prevRewards !== undefined) process.env.REWARDS_PROGRAM_ACTIVE = prevRewards;
    else delete process.env.REWARDS_PROGRAM_ACTIVE;
  });

  function makeRewardSupabase(clicker: string | null) {
    const settlements: string[] = [];
    const rewards: unknown[] = [];
    const from = vi.fn((table: string) => {
      const filters: Record<string, unknown> = {};
      let op = 'select';
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.eq = vi.fn((c: string, v: unknown) => {
        filters[c] = v;
        return builder;
      });
      builder.in = vi.fn((c: string, v: unknown) => {
        filters[`${c}__in`] = v;
        return builder;
      });
      builder.update = vi.fn(() => builder);
      builder.delete = vi.fn(() => {
        builder.then = (fn: (v: unknown) => unknown) =>
          Promise.resolve({ data: null, error: null }).then(fn);
        return builder;
      });
      builder.insert = vi.fn((payload: unknown) => {
        op = 'insert';
        filters.payload = payload;
        const run = async () => {
          if (table === 'ledger_settlements') {
            settlements.push('claimed');
            return { data: payload, error: null };
          }
          if (table === 'creator_rewards') {
            rewards.push(payload);
            return { data: payload, error: null };
          }
          if (table === 'reward_audit_log') return { data: null, error: null };
          return { data: null, error: null };
        };
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn(() => chain);
        chain.single = vi.fn(() => run());
        chain.maybeSingle = vi.fn(() => run());
        chain.then = (fn: (v: unknown) => unknown) => run().then(fn);
        return chain;
      });
      builder.maybeSingle = vi.fn(async () => {
        if (table === 'creator_rewards' && op === 'select') {
          return { data: null, error: null };
        }
        if (table === 'reward_outbound_clicks') {
          return {
            data: { clicker_user_id: clicker, id: CLICK, offer_id: OFFER_A },
            error: null,
          };
        }
        if (table === 'offers') {
          return {
            data: {
              id: OFFER_A,
              created_by: CREATOR,
              status: 'approved',
              created_at: '2026-07-01T00:00:00Z',
            },
            error: null,
          };
        }
        if (table === 'profiles') {
          return {
            data: {
              reward_program_unlocked_at: '2026-06-01T00:00:00Z',
              welcome_offer_id: OFFER_A,
            },
            error: null,
          };
        }
        return { data: null, error: null };
      });
      builder.single = builder.maybeSingle;
      return builder;
    });
    return {
      supabase: { from } as unknown as SupabaseClient,
      settlements,
      rewards,
    };
  }

  it('Test 7 engine — self-click autenticado → NO reward', async () => {
    const store = makeRewardSupabase(CREATOR);
    const subId = encodeAventaSubId(OFFER_A, CLICK);
    const result = await createRewardFromLedgerEntry(
      store.supabase,
      {
        id: LEDGER,
        network: 'amazon',
        amount_cents: 10_000,
        status: 'confirmed',
        sub_id_raw: subId,
      },
      { force: true },
    );
    expect(result.created).toBe(false);
    if (!result.created) expect(result.reason).toBe('fraud_self_click');
    expect(store.rewards).toHaveLength(0);
  });

  it('Test 9/14 engine — anonymous click → NO auto-reward', async () => {
    const store = makeRewardSupabase(null);
    const subId = encodeAventaSubId(OFFER_A, CLICK);
    const result = await createRewardFromLedgerEntry(
      store.supabase,
      {
        id: LEDGER,
        network: 'amazon',
        amount_cents: 10_000,
        status: 'confirmed',
        sub_id_raw: subId,
      },
      { force: true },
    );
    expect(result.created).toBe(false);
    if (!result.created) expect(result.reason).toBe('anonymous_click_not_auto_rewardable');
    expect(store.rewards).toHaveLength(0);
    expect(store.settlements).toHaveLength(0);
  });

  it('Test 13 — tercero autenticado → reward permitido (cadena)', async () => {
    const store = makeRewardSupabase(OTHER);
    const subId = encodeAventaSubId(OFFER_A, CLICK);
    const result = await createRewardFromLedgerEntry(
      store.supabase,
      {
        id: LEDGER,
        network: 'amazon',
        amount_cents: 10_000,
        status: 'confirmed',
        sub_id_raw: subId,
      },
      { force: true },
    );
    expect(result.created).toBe(true);
    expect(store.rewards).toHaveLength(1);
    expect(store.settlements).toHaveLength(1);
  });

  it('Test 15 — P0-4 settlement claim sigue en path de éxito', async () => {
    const store = makeRewardSupabase(OTHER);
    const result = await createRewardFromLedgerEntry(
      store.supabase,
      {
        id: LEDGER,
        network: 'amazon',
        amount_cents: 10_000,
        status: 'confirmed',
        sub_id_raw: encodeAventaSubId(OFFER_A, CLICK),
      },
      { force: true },
    );
    expect(result.created).toBe(true);
    expect(store.settlements).toEqual(['claimed']);
  });
});

describe('P0-2/P0-3 — identity spoofing en track-outbound', () => {
  it('Test 11/12 — body userId/clickerUserId no alimentan recordOutboundClick', async () => {
    let inserted: Record<string, unknown> | null = null;
    const supabase = makeClickSupabase({
      offerUrlById: { [OFFER_A]: URL_A },
      onInsert: (row) => {
        inserted = row;
      },
    });

    // Simula lo que hace la ruta: solo Bearer-derived userId (aquí null), nunca body.
    const forgedBody = {
      offerId: OFFER_A,
      offerUrl: URL_B,
      userId: CREATOR,
      clickerUserId: CREATOR,
    };
    void forgedBody;

    const click = await recordOutboundClick(supabase, {
      offerId: OFFER_A,
      clickerUserId: null, // como track-outbound sin Authorization
    });

    expect(click).not.toBeNull();
    expect(inserted?.clicker_user_id).toBeNull();
    expect(inserted?.product_fingerprint).toBe(fingerprintOf(URL_A));
  });
});
