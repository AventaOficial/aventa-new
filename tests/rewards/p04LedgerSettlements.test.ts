import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { encodeAventaSubId } from '../../lib/rewards/adapters/types';
import { createRewardFromLedgerEntry } from '../../lib/rewards/rewardsEngine';
import {
  claimCreatorRewardSettlement,
  listSettledLedgerEntryIds,
} from '../../lib/rewards/ledgerSettlements';
import { MONEY_PATH_FROZEN_CODE } from '../../lib/server/moneyPathFreeze';

const OFFER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CREATOR = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CLICK = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const LEDGER = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

type SettlementRow = {
  ledger_entry_id: string;
  channel: string;
  settlement_ref: string;
};

function makeConcurrentStore() {
  const settlements = new Map<string, SettlementRow>();
  const rewards = new Map<string, { id: string; ledger_entry_id: string }>();
  let rewardInserts = 0;
  let settlementInserts = 0;

  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    const builder: Record<string, unknown> = {};
    const self = () => builder;

    builder.select = vi.fn(self);
    builder.eq = vi.fn((col: string, val: unknown) => {
      filters[col] = val;
      return builder;
    });
    builder.in = vi.fn((col: string, val: unknown) => {
      filters[col] = val;
      return builder;
    });
    builder.update = vi.fn(() => builder);
    builder.delete = vi.fn(() => {
      const run = async () => {
        if (table === 'ledger_settlements') {
          const ledgerId = String(filters.ledger_entry_id ?? '');
          const ref = String(filters.settlement_ref ?? '');
          const row = settlements.get(ledgerId);
          if (row && row.settlement_ref === ref) settlements.delete(ledgerId);
        }
        return { data: null, error: null };
      };
      builder.then = (onFulfilled: (v: unknown) => unknown) => run().then(onFulfilled);
      return builder;
    });

    builder.insert = vi.fn((payload: unknown) => {
      const run = async () => {
        if (table === 'ledger_settlements') {
          const p = payload as SettlementRow;
          settlementInserts += 1;
          if (settlements.has(p.ledger_entry_id)) {
            return {
              data: null,
              error: { code: '23505', message: 'duplicate key value violates unique constraint' },
            };
          }
          settlements.set(p.ledger_entry_id, p);
          return { data: p, error: null };
        }
        if (table === 'creator_rewards') {
          const p = payload as { id: string; ledger_entry_id: string };
          rewardInserts += 1;
          for (const existing of rewards.values()) {
            if (existing.ledger_entry_id === p.ledger_entry_id) {
              return {
                data: null,
                error: { code: '23505', message: 'duplicate key value violates unique constraint' },
              };
            }
          }
          rewards.set(p.id, p);
          return { data: p, error: null };
        }
        if (table === 'reward_audit_log') {
          return { data: null, error: null };
        }
        return { data: null, error: null };
      };

      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.single = vi.fn(() => run());
      chain.then = (onFulfilled: (v: unknown) => unknown) => run().then(onFulfilled);
      return chain;
    });

    builder.maybeSingle = vi.fn(async () => {
      if (table === 'creator_rewards') {
        const ledgerId = String(filters.ledger_entry_id ?? '');
        for (const r of rewards.values()) {
          if (r.ledger_entry_id === ledgerId) return { data: { id: r.id }, error: null };
        }
        return { data: null, error: null };
      }
      if (table === 'reward_outbound_clicks') {
        return { data: { id: CLICK, offer_id: OFFER, clicker_user_id: 'other-user' }, error: null };
      }
      if (table === 'offers') {
        return {
          data: {
            id: OFFER,
            created_by: CREATOR,
            status: 'approved',
            created_at: '2026-07-01T00:00:00Z',
          },
          error: null,
        };
      }
      if (table === 'profiles') {
        return {
          data: { reward_program_unlocked_at: '2026-06-01T00:00:00Z', welcome_offer_id: OFFER },
          error: null,
        };
      }
      return { data: null, error: null };
    });

    builder.single = builder.maybeSingle;
    builder.then = (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(onFulfilled);

    // listSettledLedgerEntryIds path
    if (table === 'ledger_settlements') {
      builder.then = (onFulfilled: (v: unknown) => unknown) => {
        const ids = (filters.ledger_entry_id as string[] | undefined) ?? [];
        // .in() stores array under col name
        const inIds = (filters as { ledger_entry_id?: string[] }).ledger_entry_id;
        const list = Array.isArray(inIds) ? inIds : ids;
        const data = [...settlements.values()]
          .filter((s) => (list as string[]).includes?.(s.ledger_entry_id) || list.length === 0)
          .map((s) => ({ ledger_entry_id: s.ledger_entry_id }));
        // When using .in(), filters.ledger_entry_id is the array
        const wanted = Array.isArray(filters.ledger_entry_id)
          ? (filters.ledger_entry_id as string[])
          : null;
        const rows = wanted
          ? [...settlements.values()]
              .filter((s) => wanted.includes(s.ledger_entry_id))
              .map((s) => ({ ledger_entry_id: s.ledger_entry_id }))
          : data;
        return Promise.resolve({ data: rows, error: null }).then(onFulfilled);
      };
    }

    return builder;
  };

  return {
    supabase: { from: vi.fn(from) } as unknown as SupabaseClient,
    settlements,
    rewards,
    stats: () => ({ settlementInserts, rewardInserts, settlements: settlements.size, rewards: rewards.size }),
  };
}

describe('P0-4 — ledger_settlements canal único', () => {
  const prevFreeze = process.env.MONEY_PATH_FROZEN;
  const prevRewards = process.env.REWARDS_PROGRAM_ACTIVE;
  const prevLegacy = process.env.COMMISSION_PROGRAM_ACTIVE;
  const prevVercel = process.env.VERCEL_ENV;

  beforeEach(() => {
    process.env.MONEY_PATH_FROZEN = 'false';
    process.env.REWARDS_PROGRAM_ACTIVE = 'true';
    delete process.env.COMMISSION_PROGRAM_ACTIVE;
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    if (prevFreeze !== undefined) process.env.MONEY_PATH_FROZEN = prevFreeze;
    else delete process.env.MONEY_PATH_FROZEN;
    if (prevRewards !== undefined) process.env.REWARDS_PROGRAM_ACTIVE = prevRewards;
    else delete process.env.REWARDS_PROGRAM_ACTIVE;
    if (prevLegacy !== undefined) process.env.COMMISSION_PROGRAM_ACTIVE = prevLegacy;
    else delete process.env.COMMISSION_PROGRAM_ACTIVE;
    if (prevVercel !== undefined) process.env.VERCEL_ENV = prevVercel;
    else delete process.env.VERCEL_ENV;
  });

  it('Test C — dual settlement claim: 1 éxito + 1 UNIQUE', async () => {
    const store = makeConcurrentStore();
    const a = claimCreatorRewardSettlement(store.supabase, {
      ledgerEntryId: LEDGER,
      rewardId: '11111111-1111-4111-8111-111111111111',
    });
    const b = claimCreatorRewardSettlement(store.supabase, {
      ledgerEntryId: LEDGER,
      rewardId: '22222222-2222-4222-8222-222222222222',
    });
    const [ra, rb] = await Promise.all([a, b]);
    const okCount = [ra, rb].filter((r) => r.ok).length;
    const conflictCount = [ra, rb].filter((r) => !r.ok && r.reason === 'already_settled').length;
    expect(okCount).toBe(1);
    expect(conflictCount).toBe(1);
    expect(store.settlements.size).toBe(1);
  });

  it('Test A — dual createReward mismo ledger → 1 settlement + 1 reward', async () => {
    const store = makeConcurrentStore();
    const subId = encodeAventaSubId(OFFER, CLICK);
    const ledger = {
      id: LEDGER,
      network: 'amazon' as const,
      amount_cents: 10_000,
      status: 'confirmed',
      sub_id_raw: subId,
    };

    const [r1, r2] = await Promise.all([
      createRewardFromLedgerEntry(store.supabase, ledger, { force: true }),
      createRewardFromLedgerEntry(store.supabase, ledger, { force: true }),
    ]);

    const created = [r1, r2].filter((r) => r.created);
    const dupes = [r1, r2].filter((r) => !r.created && r.reason === 'duplicate_ledger');
    expect(created.length).toBe(1);
    expect(dupes.length).toBe(1);
    expect(store.settlements.size).toBe(1);
    expect(store.rewards.size).toBe(1);
  });

  it('Test D — retry mismo ledger: segundo intento duplicate_ledger, sin duplicar', async () => {
    const store = makeConcurrentStore();
    const subId = encodeAventaSubId(OFFER, CLICK);
    const ledger = {
      id: LEDGER,
      network: 'amazon' as const,
      amount_cents: 10_000,
      status: 'confirmed',
      sub_id_raw: subId,
    };

    const first = await createRewardFromLedgerEntry(store.supabase, ledger, { force: true });
    expect(first.created).toBe(true);
    const second = await createRewardFromLedgerEntry(store.supabase, ledger, { force: true });
    expect(second.created).toBe(false);
    if (!second.created) expect(second.reason).toBe('duplicate_ledger');
    expect(store.settlements.size).toBe(1);
    expect(store.rewards.size).toBe(1);
  });

  it('Test B — settlement claim bloquea segundo canal (ya settled)', async () => {
    const store = makeConcurrentStore();
    const claim1 = await claimCreatorRewardSettlement(store.supabase, {
      ledgerEntryId: LEDGER,
      rewardId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
    expect(claim1.ok).toBe(true);

    // Simula intento de “allocation” monetaria: no puede claim otro settlement.
    const claim2 = await claimCreatorRewardSettlement(store.supabase, {
      ledgerEntryId: LEDGER,
      rewardId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });
    expect(claim2.ok).toBe(false);
    if (!claim2.ok) expect(claim2.reason).toBe('already_settled');

    const settled = await listSettledLedgerEntryIds(store.supabase, [LEDGER]);
    expect(settled.has(LEDGER)).toBe(true);
    expect(store.settlements.size).toBe(1);
  });

  it('Freeze — createReward bloqueado con MONEY_PATH_FROZEN=true', async () => {
    process.env.MONEY_PATH_FROZEN = 'true';
    const store = makeConcurrentStore();
    const result = await createRewardFromLedgerEntry(
      store.supabase,
      {
        id: LEDGER,
        network: 'amazon',
        amount_cents: 10_000,
        status: 'confirmed',
        sub_id_raw: encodeAventaSubId(OFFER, CLICK),
      },
      { force: true },
    );
    expect(result.created).toBe(false);
    if (!result.created) expect(result.reason).toBe(MONEY_PATH_FROZEN_CODE);
    expect(store.settlements.size).toBe(0);
    expect(store.rewards.size).toBe(0);
  });
});
