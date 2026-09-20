/**
 * M4.2 — Legacy SPEI behind payout_intents (single claim authority).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { REWARDS_MIN_PAYOUT_CENTS } from '@/lib/rewards/config';
import {
  createManualRewardPayout,
  LEGACY_EXECUTE_REWARD_PAYOUT_RPC,
} from '@/lib/rewards/payout';
import {
  createManualSpeiProvider,
  loadPayoutIntentByReward,
  reservePayoutIntent,
  submitPayoutIntent,
  PAYOUT_INTENT_LEGACY_RPC_FORBIDDEN,
} from '@/lib/rewards/payoutIntent';
import type { PayoutIntentRow } from '@/lib/rewards/payoutIntent';

const CREATOR = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ACTOR = '11111111-1111-1111-1111-111111111111';
const REWARD = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const LEDGER = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const HISTORICAL_PAYOUT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

type RewardRow = {
  id: string;
  creator_id: string;
  creator_share_cents: number;
  currency: string;
  status: string;
  ledger_entry_id: string;
  payout_id: string | null;
  meta: Record<string, unknown>;
  paid_at: string | null;
  available_at: string | null;
  updated_at: string | null;
};

type Store = {
  rewards: Map<string, RewardRow>;
  intents: Map<string, PayoutIntentRow>;
  intentsByReward: Map<string, string>;
  intentsByKey: Map<string, string>;
  audit: unknown[];
  rewardPayouts: Array<Record<string, unknown>>;
  rpcCalls: string[];
  moneyMoves: number;
};

function uuid(): string {
  return `00000000-0000-4000-8000-${String(Math.floor(Math.random() * 1e12)).padStart(12, '0')}`;
}

function eligibleReward(overrides: Partial<RewardRow> = {}): RewardRow {
  return {
    id: REWARD,
    creator_id: CREATOR,
    creator_share_cents: REWARDS_MIN_PAYOUT_CENTS,
    currency: 'MXN',
    status: 'AVAILABLE',
    ledger_entry_id: LEDGER,
    payout_id: null,
    meta: {},
    paid_at: null,
    available_at: new Date().toISOString(),
    updated_at: null,
    ...overrides,
  };
}

function createStore(seed?: RewardRow | RewardRow[]): Store {
  const store: Store = {
    rewards: new Map(),
    intents: new Map(),
    intentsByReward: new Map(),
    intentsByKey: new Map(),
    audit: [],
    rewardPayouts: [],
    rpcCalls: [],
    moneyMoves: 0,
  };
  const seeds = seed ? (Array.isArray(seed) ? seed : [seed]) : [];
  for (const r of seeds) store.rewards.set(r.id, { ...r });
  return store;
}

function matchesFilters(
  row: Record<string, unknown>,
  filters: { eq: Record<string, unknown>; in: Record<string, unknown[]> },
): boolean {
  for (const [k, v] of Object.entries(filters.eq)) {
    if (row[k] !== v) return false;
  }
  for (const [k, vals] of Object.entries(filters.in)) {
    if (!vals.includes(row[k])) return false;
  }
  return true;
}

function makeClient(store: Store): SupabaseClient {
  const from = (table: string) => {
    if (table === 'reward_audit_log') {
      return {
        insert: (payload: unknown) => {
          store.audit.push(payload);
          return Promise.resolve({ error: null });
        },
      };
    }

    if (table === 'reward_payouts') {
      const filters = {
        eq: {} as Record<string, unknown>,
        in: {} as Record<string, unknown[]>,
        op: 'select' as string,
        insertPayload: null as unknown,
      };
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.insert = (payload: unknown) => {
        filters.op = 'insert';
        filters.insertPayload = payload;
        store.rewardPayouts.push(payload as Record<string, unknown>);
        store.moneyMoves += 1;
        const id = uuid();
        (payload as Record<string, unknown>).id = id;
        return builder;
      };
      builder.eq = (c: string, v: unknown) => {
        filters.eq[c] = v;
        return builder;
      };
      builder.maybeSingle = async () => {
        if (filters.op === 'insert') {
          return { data: filters.insertPayload, error: null };
        }
        return { data: null, error: null };
      };
      builder.then = (fn: (v: unknown) => unknown) =>
        Promise.resolve({ data: store.rewardPayouts, error: null }).then(fn);
      return builder;
    }

    const filters = {
      eq: {} as Record<string, unknown>,
      in: {} as Record<string, unknown[]>,
      updatePayload: null as Record<string, unknown> | null,
      insertPayload: null as unknown,
      op: 'select' as 'select' | 'insert' | 'update',
      orderCol: null as string | null,
    };

    const resolveList = (): RewardRow[] => {
      let rows = [...store.rewards.values()];
      if (filters.eq.creator_id) {
        rows = rows.filter((r) => r.creator_id === filters.eq.creator_id);
      }
      if (filters.eq.status) {
        rows = rows.filter((r) => r.status === filters.eq.status);
      }
      if (filters.in.id) {
        rows = rows.filter((r) => filters.in.id.includes(r.id));
      }
      return rows;
    };

    const resolve = async (): Promise<{ data: unknown; error: unknown }> => {
      if (table === 'creator_rewards') {
        if (filters.op === 'update' && filters.updatePayload) {
          if (filters.in.id) {
            const updated: RewardRow[] = [];
            for (const id of filters.in.id) {
              const row = store.rewards.get(String(id));
              if (!row) continue;
              if (filters.eq.status && row.status !== filters.eq.status) continue;
              const next = { ...row, ...filters.updatePayload } as RewardRow;
              store.rewards.set(row.id, next);
              updated.push(next);
            }
            return { data: updated, error: null };
          }
          const id = filters.eq.id as string | undefined;
          const row = id ? store.rewards.get(id) : undefined;
          if (!row) return { data: null, error: null };
          if (!matchesFilters(row as unknown as Record<string, unknown>, filters)) {
            return { data: null, error: null };
          }
          const next = { ...row, ...filters.updatePayload } as RewardRow;
          store.rewards.set(row.id, next);
          return { data: next, error: null };
        }

        // List query (balances or available selection) — no maybeSingle
        if (!filters.eq.id && (filters.eq.creator_id || filters.eq.status || filters.in.id)) {
          return { data: resolveList(), error: null };
        }

        const id = filters.eq.id as string | undefined;
        const row = id ? store.rewards.get(id) ?? null : null;
        if (row && !matchesFilters(row as unknown as Record<string, unknown>, filters)) {
          return { data: null, error: null };
        }
        return { data: row, error: null };
      }

      if (table === 'payout_intents') {
        if (filters.op === 'insert') {
          const payload = filters.insertPayload as Record<string, unknown>;
          const rewardId = String(payload.reward_id);
          const key = String(payload.idempotency_key);
          if (store.intentsByReward.has(rewardId) || store.intentsByKey.has(key)) {
            return {
              data: null,
              error: { code: '23505', message: 'duplicate key payout_intents_reward_unique' },
            };
          }
          const id = uuid();
          const now = new Date().toISOString();
          const row: PayoutIntentRow = {
            id,
            reward_id: rewardId,
            creator_id: String(payload.creator_id),
            amount_cents: Number(payload.amount_cents),
            currency: String(payload.currency ?? 'MXN'),
            status: (payload.status as PayoutIntentRow['status']) ?? 'RESERVED',
            idempotency_key: key,
            provider: String(payload.provider ?? 'manual_spei'),
            meta: (payload.meta as Record<string, unknown>) ?? {},
            reserved_at: String(payload.reserved_at ?? now),
            submitted_at: (payload.submitted_at as string | null) ?? null,
            resolved_at: (payload.resolved_at as string | null) ?? null,
            created_at: String(payload.created_at ?? now),
            updated_at: String(payload.updated_at ?? now),
          };
          store.intents.set(id, row);
          store.intentsByReward.set(rewardId, id);
          store.intentsByKey.set(key, id);
          return { data: row, error: null };
        }

        if (filters.op === 'update' && filters.updatePayload) {
          const id = filters.eq.id as string | undefined;
          const row = id ? store.intents.get(id) : undefined;
          if (!row) return { data: null, error: null };
          if (!matchesFilters(row as unknown as Record<string, unknown>, filters)) {
            return { data: null, error: null };
          }
          const next = { ...row, ...filters.updatePayload } as PayoutIntentRow;
          store.intents.set(row.id, next);
          return { data: next, error: null };
        }

        if (filters.eq.id) {
          return { data: store.intents.get(String(filters.eq.id)) ?? null, error: null };
        }
        if (filters.eq.reward_id) {
          const iid = store.intentsByReward.get(String(filters.eq.reward_id));
          return { data: iid ? store.intents.get(iid) ?? null : null, error: null };
        }
        return { data: null, error: null };
      }

      return { data: null, error: { message: `unexpected ${table}` } };
    };

    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    for (const m of ['select', 'lte', 'gte', 'limit']) {
      builder[m] = vi.fn(chain);
    }
    builder.order = () => builder;
    builder.insert = (payload: unknown) => {
      filters.op = 'insert';
      filters.insertPayload = payload;
      return builder;
    };
    builder.update = (payload: unknown) => {
      filters.op = 'update';
      filters.updatePayload = payload as Record<string, unknown>;
      return builder;
    };
    builder.eq = (col: string, val: unknown) => {
      filters.eq[col] = val;
      return builder;
    };
    builder.in = (col: string, val: unknown) => {
      filters.in[col] = val as unknown[];
      return builder;
    };
    builder.maybeSingle = () => resolve();
    builder.single = () => resolve();
    builder.then = (onFulfilled: (v: unknown) => unknown) => resolve().then(onFulfilled);
    return builder;
  };

  return {
    from: vi.fn(from),
    rpc: vi.fn(async (name: string) => {
      store.rpcCalls.push(name);
      if (name === LEGACY_EXECUTE_REWARD_PAYOUT_RPC) {
        store.moneyMoves += 1;
        return {
          data: null,
          error: { message: 'legacy_rpc_disabled_use_payout_intent' },
        };
      }
      return { data: null, error: { message: 'unexpected_rpc' } };
    }),
  } as unknown as SupabaseClient;
}

describe('M4.2 legacy SPEI behind payout_intents', () => {
  const prevFreeze = process.env.MONEY_PATH_FROZEN;

  beforeEach(() => {
    process.env.MONEY_PATH_FROZEN = 'false';
  });

  afterEach(() => {
    if (prevFreeze !== undefined) process.env.MONEY_PATH_FROZEN = prevFreeze;
    else delete process.env.MONEY_PATH_FROZEN;
  });

  it('1. manual payout AVAILABLE → un intent', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const r = await createManualRewardPayout(sb, {
      userId: CREATOR,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      speiReference: 'SPEI-M42-0001',
      createdBy: ACTOR,
      rewardIds: [REWARD],
      stubScenario: 'success',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.intentIds).toHaveLength(1);
    expect(store.intents.size).toBe(1);
    expect(store.rewards.get(REWARD)?.status).toBe('PAID');
    expect(store.rpcCalls).not.toContain(LEGACY_EXECUTE_REWARD_PAYOUT_RPC);
  });

  it('2. replay → mismo intent', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    // First: reserve only then abandon
    const reserved = await reservePayoutIntent(sb, { rewardId: REWARD });
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const firstId = reserved.intent.id;

    const r = await createManualRewardPayout(sb, {
      userId: CREATOR,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      speiReference: 'SPEI-M42-REPLAY',
      createdBy: ACTOR,
      rewardIds: [REWARD],
      stubScenario: 'success',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.intentIds[0]).toBe(firstId);
    expect(store.intents.size).toBe(1);
  });

  it('3. dos workers → un intent', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const results = await Promise.all([
      createManualRewardPayout(sb, {
        userId: CREATOR,
        amountCents: REWARDS_MIN_PAYOUT_CENTS,
        speiReference: 'SPEI-W1',
        createdBy: ACTOR,
        rewardIds: [REWARD],
        stubScenario: 'success',
      }),
      createManualRewardPayout(sb, {
        userId: CREATOR,
        amountCents: REWARDS_MIN_PAYOUT_CENTS,
        speiReference: 'SPEI-W2',
        createdBy: ACTOR,
        rewardIds: [REWARD],
        stubScenario: 'success',
      }),
    ]);
    expect(store.intents.size).toBe(1);
    const paid = results.filter((r) => r.ok);
    expect(paid.length).toBeGreaterThanOrEqual(1);
    expect(store.rewards.get(REWARD)?.status).toBe('PAID');
  });

  it('4. legacy RPC no puede saltarse el intent', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const rpc = await sb.rpc(LEGACY_EXECUTE_REWARD_PAYOUT_RPC, {});
    expect(rpc.error?.message).toContain('legacy_rpc_disabled_use_payout_intent');
    expect(store.rewards.get(REWARD)?.status).toBe('AVAILABLE');

    await createManualRewardPayout(sb, {
      userId: CREATOR,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      speiReference: 'SPEI-NO-RPC',
      createdBy: ACTOR,
      rewardIds: [REWARD],
    });
    expect(store.rpcCalls.filter((c) => c === LEGACY_EXECUTE_REWARD_PAYOUT_RPC)).toHaveLength(1);
    // Only the explicit test call — createManual must not add another
    expect(PAYOUT_INTENT_LEGACY_RPC_FORBIDDEN).toBe('execute_reward_payout');
  });

  it('5. intent UNKNOWN bloquea segundo pago', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const reserved = await reservePayoutIntent(sb, { rewardId: REWARD });
    if (!reserved.ok) throw new Error('reserve');
    await submitPayoutIntent(sb, {
      intentId: reserved.intent.id,
      provider: createManualSpeiProvider({ submit: 'unknown' }),
    });
    const intent = await loadPayoutIntentByReward(sb, REWARD);
    expect(intent?.status).toBe('UNKNOWN');

    const r = await createManualRewardPayout(sb, {
      userId: CREATOR,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      speiReference: 'SPEI-BLOCK',
      createdBy: ACTOR,
      rewardIds: [REWARD],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('intent_unknown');
    expect(store.intents.size).toBe(1);
    expect(store.rewards.get(REWARD)?.status).toBe('AVAILABLE');
  });

  it('6. SUCCESS → un solo PAID', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const r = await createManualRewardPayout(sb, {
      userId: CREATOR,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      speiReference: 'SPEI-OK',
      createdBy: ACTOR,
      rewardIds: [REWARD],
    });
    expect(r.ok).toBe(true);
    expect([...store.rewards.values()].filter((x) => x.status === 'PAID')).toHaveLength(1);
  });

  it('7. callback/replay duplicado', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const first = await createManualRewardPayout(sb, {
      userId: CREATOR,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      speiReference: 'SPEI-DUP',
      createdBy: ACTOR,
      rewardIds: [REWARD],
    });
    expect(first.ok).toBe(true);
    const second = await createManualRewardPayout(sb, {
      userId: CREATOR,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      speiReference: 'SPEI-DUP2',
      createdBy: ACTOR,
      rewardIds: [REWARD],
    });
    // Reward no longer AVAILABLE → reject; intent still single
    expect(second.ok).toBe(false);
    expect(store.intents.size).toBe(1);
  });

  it('8. reward PAID → reject', async () => {
    const store = createStore(eligibleReward({ status: 'PAID', payout_id: HISTORICAL_PAYOUT }));
    const sb = makeClient(store);
    const r = await createManualRewardPayout(sb, {
      userId: CREATOR,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      speiReference: 'SPEI-PAID',
      createdBy: ACTOR,
      rewardIds: [REWARD],
    });
    expect(r.ok).toBe(false);
    expect(store.intents.size).toBe(0);
  });

  it('9. FAILED → reject segundo pago (política terminal)', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const fail = await createManualRewardPayout(sb, {
      userId: CREATOR,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      speiReference: 'SPEI-FAIL',
      createdBy: ACTOR,
      rewardIds: [REWARD],
      stubScenario: 'failure',
    });
    expect(fail.ok).toBe(false);
    if (!fail.ok) expect(fail.code).toBe('intent_failed');
    expect(store.rewards.get(REWARD)?.status).toBe('AVAILABLE');

    const again = await createManualRewardPayout(sb, {
      userId: CREATOR,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      speiReference: 'SPEI-FAIL2',
      createdBy: ACTOR,
      rewardIds: [REWARD],
      stubScenario: 'success',
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe('intent_failed_terminal');
    expect(store.intents.size).toBe(1);
  });

  it('10. historical reward_payouts no se rompe', async () => {
    const store = createStore(eligibleReward());
    store.rewardPayouts.push({
      id: HISTORICAL_PAYOUT,
      user_id: CREATOR,
      amount_cents: 50000,
      status: 'completed',
      spei_reference: 'HISTORIC-SPEI',
    });
    const before = store.rewardPayouts.length;
    const sb = makeClient(store);
    await createManualRewardPayout(sb, {
      userId: CREATOR,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      speiReference: 'SPEI-NEW',
      createdBy: ACTOR,
      rewardIds: [REWARD],
      stubScenario: 'success',
      writeHistoricalPayoutRow: false,
    });
    expect(store.rewardPayouts.length).toBe(before);
    expect(store.rewardPayouts[0]?.id).toBe(HISTORICAL_PAYOUT);
  });

  it('11. payout_id integridad: histórico intacto; stub no escribe payout_id', async () => {
    const store = createStore([
      eligibleReward(),
      eligibleReward({
        id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        status: 'PAID',
        payout_id: HISTORICAL_PAYOUT,
        creator_share_cents: 1000,
        ledger_entry_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      }),
    ]);
    const sb = makeClient(store);
    const r = await createManualRewardPayout(sb, {
      userId: CREATOR,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      speiReference: 'SPEI-PID',
      createdBy: ACTOR,
      rewardIds: [REWARD],
    });
    expect(r.ok).toBe(true);
    expect(store.rewards.get(REWARD)?.payout_id).toBeNull();
    expect(store.rewards.get('cccccccc-cccc-cccc-cccc-cccccccccccc')?.payout_id).toBe(
      HISTORICAL_PAYOUT,
    );
  });

  it('12. reward_audit_log conserva trazabilidad', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    await createManualRewardPayout(sb, {
      userId: CREATOR,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      speiReference: 'SPEI-AUDIT',
      createdBy: ACTOR,
      rewardIds: [REWARD],
    });
    const types = store.audit.map((a) => (a as { event_type: string }).event_type);
    expect(types).toContain('payout_intent_reserved');
    expect(types).toContain('reward_paid');
    expect(types).toContain('manual_spei_via_intent');
  });

  it('13. reward_payouts=0 durante stub canary path', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    await createManualRewardPayout(sb, {
      userId: CREATOR,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      speiReference: 'SPEI-STUB',
      createdBy: ACTOR,
      rewardIds: [REWARD],
      stubScenario: 'success',
      writeHistoricalPayoutRow: false,
    });
    expect(store.rewardPayouts.length).toBe(0);
  });

  it('14. ningún movimiento de dinero real', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    await createManualRewardPayout(sb, {
      userId: CREATOR,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      speiReference: 'SPEI-NOMONEY',
      createdBy: ACTOR,
      rewardIds: [REWARD],
      provider: createManualSpeiProvider({ submit: 'success', recordsHistoricalPayout: false }),
    });
    expect(store.moneyMoves).toBe(0);
    expect(store.rpcCalls).not.toContain('execute_reward_payout');
  });
});
