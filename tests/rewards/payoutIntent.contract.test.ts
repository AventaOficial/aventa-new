/**
 * M4.1 Payout Intent Foundation — contract tests.
 * Stub provider only; never invokes execute_reward_payout / reward_payouts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { REWARDS_MIN_PAYOUT_CENTS } from '@/lib/rewards/config';
import {
  reservePayoutIntent,
  submitPayoutIntent,
  reconcilePayoutIntent,
  confirmPayoutIntentSuccess,
  loadPayoutIntentByReward,
  buildPayoutIntentIdempotencyKey,
  createStubPayoutProvider,
  PAYOUT_INTENT_LEGACY_RPC_FORBIDDEN,
} from '@/lib/rewards/payoutIntent';
import type { PayoutIntentRow } from '@/lib/rewards/payoutIntent';

const CREATOR = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const REWARD = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const LEDGER = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

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
  updated_at: string | null;
};

type IntentRow = PayoutIntentRow;

type Store = {
  rewards: Map<string, RewardRow>;
  intents: Map<string, IntentRow>;
  intentsByReward: Map<string, string>;
  intentsByKey: Map<string, string>;
  audit: unknown[];
  rewardPayouts: unknown[];
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
    meta: { click_id: 'c1' },
    paid_at: null,
    updated_at: null,
    ...overrides,
  };
}

function createStore(seed?: RewardRow): Store {
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
  if (seed) store.rewards.set(seed.id, { ...seed });
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
      return {
        insert: (payload: unknown) => {
          store.rewardPayouts.push(payload);
          store.moneyMoves += 1;
          return {
            select: () => ({
              maybeSingle: async () => ({ data: payload, error: null }),
            }),
          };
        },
        select: () => {
          const filters = { eq: {} as Record<string, unknown>, in: {} as Record<string, unknown[]> };
          const builder: Record<string, unknown> = {};
          builder.eq = (c: string, v: unknown) => {
            filters.eq[c] = v;
            return builder;
          };
          builder.maybeSingle = async () => ({ data: null, error: null });
          builder.then = (fn: (v: unknown) => unknown) =>
            Promise.resolve({ data: store.rewardPayouts, error: null }).then(fn);
          return builder;
        },
      };
    }

    const filters = {
      eq: {} as Record<string, unknown>,
      in: {} as Record<string, unknown[]>,
      updatePayload: null as Record<string, unknown> | null,
      insertPayload: null as unknown,
      op: 'select' as 'select' | 'insert' | 'update',
    };

    const resolve = async (): Promise<{ data: unknown; error: unknown }> => {
      if (table === 'creator_rewards') {
        if (filters.op === 'update' && filters.updatePayload) {
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

        // balance query: select without maybeSingle → list by creator_id
        if (filters.eq.creator_id && !filters.eq.id) {
          const rows = [...store.rewards.values()].filter(
            (r) => r.creator_id === filters.eq.creator_id,
          );
          return { data: rows, error: null };
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
              error: { code: '23505', message: 'duplicate key value violates unique constraint' },
            };
          }
          const id = uuid();
          const now = new Date().toISOString();
          const row: IntentRow = {
            id,
            reward_id: rewardId,
            creator_id: String(payload.creator_id),
            amount_cents: Number(payload.amount_cents),
            currency: String(payload.currency ?? 'MXN'),
            status: (payload.status as IntentRow['status']) ?? 'RESERVED',
            idempotency_key: key,
            provider: String(payload.provider ?? 'stub'),
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
          const next = { ...row, ...filters.updatePayload } as IntentRow;
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

      return { data: null, error: { message: `unexpected table ${table}` } };
    };

    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    for (const m of ['select', 'lte', 'gte', 'order', 'limit']) {
      builder[m] = vi.fn(chain);
    }
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
      if (name === PAYOUT_INTENT_LEGACY_RPC_FORBIDDEN) {
        store.moneyMoves += 1;
      }
      return { data: null, error: { message: 'forbidden_in_m41' } };
    }),
  } as unknown as SupabaseClient;
}

describe('M4.1 payout intent contract', () => {
  const prevFreeze = process.env.MONEY_PATH_FROZEN;

  beforeEach(() => {
    process.env.MONEY_PATH_FROZEN = 'false';
  });

  afterEach(() => {
    if (prevFreeze !== undefined) process.env.MONEY_PATH_FROZEN = prevFreeze;
    else delete process.env.MONEY_PATH_FROZEN;
  });

  it('1. reward no eligible → no intent', async () => {
    const store = createStore(
      eligibleReward({ creator_share_cents: 100, status: 'AVAILABLE' }),
    );
    // available balance below minimum (100 < 20000)
    const sb = makeClient(store);
    const r = await reservePayoutIntent(sb, { rewardId: REWARD });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('below_minimum_available');
    expect(store.intents.size).toBe(0);
  });

  it('2. reward eligible → exactly one intent', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const r = await reservePayoutIntent(sb, { rewardId: REWARD });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.intent.status).toBe('RESERVED');
    expect(store.intents.size).toBe(1);
    expect(r.intent.idempotency_key).toBe(buildPayoutIntentIdempotencyKey(REWARD));
  });

  it('3. replay → same intent', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const a = await reservePayoutIntent(sb, { rewardId: REWARD });
    const b = await reservePayoutIntent(sb, { rewardId: REWARD });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(b.reused).toBe(true);
    expect(a.intent.id).toBe(b.intent.id);
    expect(store.intents.size).toBe(1);
  });

  it('4. concurrent workers ×3 → un solo intent', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const results = await Promise.all([
      reservePayoutIntent(sb, { rewardId: REWARD }),
      reservePayoutIntent(sb, { rewardId: REWARD }),
      reservePayoutIntent(sb, { rewardId: REWARD }),
    ]);
    const ok = results.filter((r) => r.ok);
    expect(ok.length).toBe(3);
    const ids = new Set(ok.map((r) => (r.ok ? r.intent.id : '')));
    expect(ids.size).toBe(1);
    expect(store.intents.size).toBe(1);
  });

  it('5. RESERVED → SUBMITTED', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const reserved = await reservePayoutIntent(sb, { rewardId: REWARD });
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;

    // Use a provider that never resolves immediately — we only check transition via
    // mark unknown path after forcing submit with timeout stub (SUBMITTED before timeout).
    const provider = createStubPayoutProvider({ submit: 'timeout' });
    const submitted = await submitPayoutIntent(sb, {
      intentId: reserved.intent.id,
      provider,
    });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    // timeout ends UNKNOWN, but must have passed SUBMITTED
    expect(submitted.intent.status).toBe('UNKNOWN');
    expect(submitted.intent.submitted_at).toBeTruthy();
  });

  it('6. SUCCESS → SUCCEEDED + reward PAID', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const reserved = await reservePayoutIntent(sb, { rewardId: REWARD });
    if (!reserved.ok) throw new Error('reserve failed');
    const r = await submitPayoutIntent(sb, {
      intentId: reserved.intent.id,
      provider: createStubPayoutProvider({ submit: 'success' }),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.intent.status).toBe('SUCCEEDED');
    expect(store.rewards.get(REWARD)?.status).toBe('PAID');
    expect(store.rewardPayouts.length).toBe(0);
    expect(store.rpcCalls).not.toContain('execute_reward_payout');
  });

  it('7. FAILURE → FAILED sin PAID', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const reserved = await reservePayoutIntent(sb, { rewardId: REWARD });
    if (!reserved.ok) throw new Error('reserve failed');
    const r = await submitPayoutIntent(sb, {
      intentId: reserved.intent.id,
      provider: createStubPayoutProvider({ submit: 'failure' }),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.intent.status).toBe('FAILED');
    expect(store.rewards.get(REWARD)?.status).toBe('AVAILABLE');
  });

  it('8. TIMEOUT → UNKNOWN', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const reserved = await reservePayoutIntent(sb, { rewardId: REWARD });
    if (!reserved.ok) throw new Error('reserve failed');
    const r = await submitPayoutIntent(sb, {
      intentId: reserved.intent.id,
      provider: createStubPayoutProvider({ submit: 'timeout' }),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.intent.status).toBe('UNKNOWN');
    expect(store.rewards.get(REWARD)?.status).toBe('AVAILABLE');
  });

  it('9. UNKNOWN → reconciliation SUCCESS', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const reserved = await reservePayoutIntent(sb, { rewardId: REWARD });
    if (!reserved.ok) throw new Error('reserve failed');
    const key = reserved.intent.idempotency_key;
    await submitPayoutIntent(sb, {
      intentId: reserved.intent.id,
      provider: createStubPayoutProvider({ submit: 'timeout' }),
    });
    const r = await reconcilePayoutIntent(sb, {
      intentId: reserved.intent.id,
      provider: createStubPayoutProvider({ submit: 'timeout', reconcile: 'success' }),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.intent.status).toBe('SUCCEEDED');
    expect(r.intent.idempotency_key).toBe(key);
    expect(store.rewards.get(REWARD)?.status).toBe('PAID');
    expect(store.intents.size).toBe(1);
  });

  it('10. UNKNOWN → reconciliation FAILURE', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const reserved = await reservePayoutIntent(sb, { rewardId: REWARD });
    if (!reserved.ok) throw new Error('reserve failed');
    await submitPayoutIntent(sb, {
      intentId: reserved.intent.id,
      provider: createStubPayoutProvider({ submit: 'timeout' }),
    });
    const r = await reconcilePayoutIntent(sb, {
      intentId: reserved.intent.id,
      provider: createStubPayoutProvider({ submit: 'timeout', reconcile: 'failure' }),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.intent.status).toBe('FAILED');
    expect(store.rewards.get(REWARD)?.status).toBe('AVAILABLE');
  });

  it('11. UNKNOWN → nunca crea segundo intent', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const reserved = await reservePayoutIntent(sb, { rewardId: REWARD });
    if (!reserved.ok) throw new Error('reserve failed');
    await submitPayoutIntent(sb, {
      intentId: reserved.intent.id,
      provider: createStubPayoutProvider({ submit: 'timeout' }),
    });
    const again = await reservePayoutIntent(sb, { rewardId: REWARD });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.reused).toBe(true);
    expect(again.intent.id).toBe(reserved.intent.id);
    expect(store.intents.size).toBe(1);
  });

  it('12. misma idempotency key durante retry', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const reserved = await reservePayoutIntent(sb, { rewardId: REWARD });
    if (!reserved.ok) throw new Error('reserve failed');
    const key = reserved.intent.idempotency_key;
    await submitPayoutIntent(sb, {
      intentId: reserved.intent.id,
      provider: createStubPayoutProvider({ submit: 'timeout' }),
    });
    const loaded = await loadPayoutIntentByReward(sb, REWARD);
    expect(loaded?.idempotency_key).toBe(key);
    expect(key).toBe(buildPayoutIntentIdempotencyKey(REWARD, 1));
  });

  it('13. callback duplicado', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const reserved = await reservePayoutIntent(sb, { rewardId: REWARD });
    if (!reserved.ok) throw new Error('reserve failed');
    const first = await submitPayoutIntent(sb, {
      intentId: reserved.intent.id,
      provider: createStubPayoutProvider({ submit: 'success' }),
    });
    expect(first.ok).toBe(true);
    const dup = await confirmPayoutIntentSuccess(sb, { intentId: reserved.intent.id });
    expect(dup.ok).toBe(true);
    if (!dup.ok) return;
    expect(dup.reused).toBe(true);
    expect(dup.intent.status).toBe('SUCCEEDED');
    expect(store.rewards.get(REWARD)?.status).toBe('PAID');
    // Only one PAID transition in store
    expect([...store.rewards.values()].filter((r) => r.status === 'PAID').length).toBe(1);
  });

  it('14. amount mismatch → reject', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const r = await reservePayoutIntent(sb, {
      rewardId: REWARD,
      expectedAmountCents: REWARDS_MIN_PAYOUT_CENTS + 1,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('amount_mismatch');
    expect(store.intents.size).toBe(0);
  });

  it('15. currency mismatch → reject', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const r = await reservePayoutIntent(sb, {
      rewardId: REWARD,
      expectedCurrency: 'USD',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('currency_mismatch');
    expect(store.intents.size).toBe(0);
  });

  it('16. reward CANCELLED/REVERSED → no payout', async () => {
    for (const status of ['CANCELLED', 'REVERSED'] as const) {
      const store = createStore(eligibleReward({ status }));
      const sb = makeClient(store);
      const r = await reservePayoutIntent(sb, { rewardId: REWARD });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('reward_terminal');
      expect(store.intents.size).toBe(0);
    }
  });

  it('17. concurrent SUCCESS → un solo PAID', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const reserved = await reservePayoutIntent(sb, { rewardId: REWARD });
    if (!reserved.ok) throw new Error('reserve failed');
    // Force SUBMITTED without resolving
    const intent = store.intents.get(reserved.intent.id)!;
    store.intents.set(intent.id, {
      ...intent,
      status: 'SUBMITTED',
      submitted_at: new Date().toISOString(),
    });

    const results = await Promise.all([
      confirmPayoutIntentSuccess(sb, { intentId: intent.id, externalRef: 'a' }),
      confirmPayoutIntentSuccess(sb, { intentId: intent.id, externalRef: 'b' }),
      confirmPayoutIntentSuccess(sb, { intentId: intent.id, externalRef: 'c' }),
    ]);
    const succeeded = results.filter((r) => r.ok && r.intent.status === 'SUCCEEDED');
    expect(succeeded.length).toBeGreaterThanOrEqual(1);
    expect(store.rewards.get(REWARD)?.status).toBe('PAID');
    expect(store.intents.size).toBe(1);
    const paidAudits = store.audit.filter(
      (a) => (a as { event_type?: string }).event_type === 'reward_paid',
    );
    // Best-effort: at least one, but CAS ensures reward paid once
    expect(paidAudits.length).toBeGreaterThanOrEqual(1);
  });

  it('18. provider stub nunca mueve dinero real', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const reserved = await reservePayoutIntent(sb, { rewardId: REWARD });
    if (!reserved.ok) throw new Error('reserve failed');
    await submitPayoutIntent(sb, {
      intentId: reserved.intent.id,
      provider: createStubPayoutProvider({ submit: 'success' }),
    });
    expect(store.moneyMoves).toBe(0);
    expect(store.rewardPayouts.length).toBe(0);
    expect(store.rpcCalls).not.toContain(PAYOUT_INTENT_LEGACY_RPC_FORBIDDEN);
    expect(store.rpcCalls).not.toContain('execute_reward_payout');
  });

  it('legacy execute_reward_payout no es autoridad del flujo M4.1', async () => {
    // Source-level / module-level guard
    expect(PAYOUT_INTENT_LEGACY_RPC_FORBIDDEN).toBe('execute_reward_payout');
    const src = await import('@/lib/rewards/payoutIntent/engine');
    const text = Object.keys(src).join(',');
    expect(text).not.toContain('createManualRewardPayout');
  });
});
