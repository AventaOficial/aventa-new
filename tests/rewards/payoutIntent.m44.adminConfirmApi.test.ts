/**
 * M4.4 — Admin payout confirmation API boundary tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { REWARDS_MIN_PAYOUT_CENTS } from '@/lib/rewards/config';
import {
  reservePayoutIntent,
  submitPayoutIntent,
  createManualSpeiProvider,
  adminConfirmPayoutIntent,
  PAYOUT_INTENT_LEGACY_RPC_FORBIDDEN,
} from '@/lib/rewards/payoutIntent';
import type { PayoutIntentRow } from '@/lib/rewards/payoutIntent';

const CREATOR = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ADMIN = '11111111-1111-1111-1111-111111111111';
const REWARD = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const LEDGER = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const PROVIDER_REF = 'SPEI-M44-ADMIN-REF';

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

type Store = {
  rewards: Map<string, RewardRow>;
  intents: Map<string, PayoutIntentRow>;
  intentsByReward: Map<string, string>;
  intentsByKey: Map<string, string>;
  audit: unknown[];
  rewardPayouts: unknown[];
  rpcCalls: string[];
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
          return { select: () => ({ maybeSingle: async () => ({ data: payload, error: null }) }) };
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
        if (filters.eq.creator_id && !filters.eq.id) {
          return {
            data: [...store.rewards.values()].filter((r) => r.creator_id === filters.eq.creator_id),
            error: null,
          };
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
              error: { code: '23505', message: 'duplicate key' },
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
      return { data: null, error: { message: 'legacy_rpc_disabled_use_payout_intent' } };
    }),
  } as unknown as SupabaseClient;
}

async function initiatedIntent(sb: SupabaseClient) {
  const reserved = await reservePayoutIntent(sb, { rewardId: REWARD });
  if (!reserved.ok) throw new Error(reserved.reason);
  const submitted = await submitPayoutIntent(sb, {
    intentId: reserved.intent.id,
    provider: createManualSpeiProvider({
      submit: 'initiated',
      providerReference: PROVIDER_REF,
    }),
  });
  if (!submitted.ok) throw new Error(submitted.reason);
  return submitted.intent;
}

describe('M4.4 adminConfirmPayoutIntent domain', () => {
  const prevFreeze = process.env.MONEY_PATH_FROZEN;

  beforeEach(() => {
    process.env.MONEY_PATH_FROZEN = 'false';
  });

  afterEach(() => {
    if (prevFreeze !== undefined) process.env.MONEY_PATH_FROZEN = prevFreeze;
    else delete process.env.MONEY_PATH_FROZEN;
  });

  it('1. admin confirm → success', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const intent = await initiatedIntent(sb);
    const r = await adminConfirmPayoutIntent(sb, {
      operation: 'confirm',
      payoutIntentId: intent.id,
      provider: 'manual_spei',
      providerReference: PROVIDER_REF,
      idempotencyKey: intent.idempotency_key,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      currency: 'MXN',
      outcome: 'confirmed_success',
      actorId: ADMIN,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.code).toBe('SUCCESS');
    expect(r.intent.status).toBe('SUCCEEDED');
    expect(store.rewards.get(REWARD)?.status).toBe('PAID');
  });

  it('4. creator attempting own payout → reject', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const intent = await initiatedIntent(sb);
    const r = await adminConfirmPayoutIntent(sb, {
      operation: 'confirm',
      payoutIntentId: intent.id,
      provider: 'manual_spei',
      providerReference: PROVIDER_REF,
      idempotencyKey: intent.idempotency_key,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      currency: 'MXN',
      outcome: 'confirmed_success',
      actorId: CREATOR,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('FORBIDDEN_SELF');
    expect(store.rewards.get(REWARD)?.status).toBe('AVAILABLE');
  });

  it('5. invalid intent → reject', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const r = await adminConfirmPayoutIntent(sb, {
      operation: 'confirm',
      payoutIntentId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      provider: 'manual_spei',
      providerReference: PROVIDER_REF,
      idempotencyKey: 'payout_intent:x:v1',
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      currency: 'MXN',
      outcome: 'confirmed_success',
      actorId: ADMIN,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NOT_FOUND');
  });

  it('6-9. invalid evidence rejected', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const intent = await initiatedIntent(sb);
    const base = {
      operation: 'confirm' as const,
      payoutIntentId: intent.id,
      provider: 'manual_spei',
      providerReference: PROVIDER_REF,
      idempotencyKey: intent.idempotency_key,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      currency: 'MXN',
      outcome: 'confirmed_success' as const,
      actorId: ADMIN,
    };
    const ref = await adminConfirmPayoutIntent(sb, { ...base, providerReference: 'WRONG' });
    expect(ref.ok).toBe(false);
    if (!ref.ok) expect(ref.reason).toBe('provider_reference_mismatch');

    const amt = await adminConfirmPayoutIntent(sb, {
      ...base,
      amountCents: REWARDS_MIN_PAYOUT_CENTS + 1,
    });
    expect(amt.ok).toBe(false);
    if (!amt.ok) expect(amt.reason).toBe('amount_mismatch');

    const cur = await adminConfirmPayoutIntent(sb, { ...base, currency: 'USD' });
    expect(cur.ok).toBe(false);
    if (!cur.ok) expect(cur.reason).toBe('currency_mismatch');

    const key = await adminConfirmPayoutIntent(sb, {
      ...base,
      idempotencyKey: 'payout_intent:wrong:v1',
    });
    expect(key.ok).toBe(false);
    if (!key.ok) expect(key.reason).toBe('idempotency_key_mismatch');
  });

  it('10. duplicate confirmation → ALREADY_APPLIED', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const intent = await initiatedIntent(sb);
    const input = {
      operation: 'confirm' as const,
      payoutIntentId: intent.id,
      provider: 'manual_spei',
      providerReference: PROVIDER_REF,
      idempotencyKey: intent.idempotency_key,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      currency: 'MXN',
      outcome: 'confirmed_success' as const,
      actorId: ADMIN,
    };
    const a = await adminConfirmPayoutIntent(sb, input);
    const b = await adminConfirmPayoutIntent(sb, input);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(b.code).toBe('ALREADY_APPLIED');
    expect(store.intents.size).toBe(1);
  });

  it('11. concurrent confirmations → one PAID', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const intent = await initiatedIntent(sb);
    const input = {
      operation: 'confirm' as const,
      payoutIntentId: intent.id,
      provider: 'manual_spei',
      providerReference: PROVIDER_REF,
      idempotencyKey: intent.idempotency_key,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      currency: 'MXN',
      outcome: 'confirmed_success' as const,
      actorId: ADMIN,
    };
    await Promise.all([
      adminConfirmPayoutIntent(sb, input),
      adminConfirmPayoutIntent(sb, input),
      adminConfirmPayoutIntent(sb, input),
    ]);
    expect(store.rewards.get(REWARD)?.status).toBe('PAID');
    expect(store.intents.size).toBe(1);
  });

  it('12-13. UNKNOWN reconcile success/failure', async () => {
    for (const outcome of ['confirmed_success', 'confirmed_failure'] as const) {
      const store = createStore(
        eligibleReward({
          id: outcome === 'confirmed_success' ? REWARD : 'cccccccc-cccc-cccc-cccc-cccccccccccc',
          ledger_entry_id:
            outcome === 'confirmed_success'
              ? LEDGER
              : 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        }),
      );
      const sb = makeClient(store);
      const rewardId =
        outcome === 'confirmed_success' ? REWARD : 'cccccccc-cccc-cccc-cccc-cccccccccccc';
      const reserved = await reservePayoutIntent(sb, { rewardId });
      if (!reserved.ok) throw new Error(reserved.reason);
      const submitted = await submitPayoutIntent(sb, {
        intentId: reserved.intent.id,
        provider: createManualSpeiProvider({
          submit: 'unknown',
          providerReference: `${PROVIDER_REF}-${outcome}`,
        }),
      });
      expect(submitted.ok && submitted.intent.status === 'UNKNOWN').toBe(true);
      if (!submitted.ok) return;
      const r = await adminConfirmPayoutIntent(sb, {
        operation: 'reconcile',
        payoutIntentId: submitted.intent.id,
        provider: 'manual_spei',
        providerReference: `${PROVIDER_REF}-${outcome}`,
        idempotencyKey: submitted.intent.idempotency_key,
        amountCents: REWARDS_MIN_PAYOUT_CENTS,
        currency: 'MXN',
        outcome,
        actorId: ADMIN,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.intent.status).toBe(
        outcome === 'confirmed_success' ? 'SUCCEEDED' : 'FAILED',
      );
    }
  });

  it('14. UNKNOWN invalid evidence rejected', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const reserved = await reservePayoutIntent(sb, { rewardId: REWARD });
    if (!reserved.ok) throw new Error(reserved.reason);
    await submitPayoutIntent(sb, {
      intentId: reserved.intent.id,
      provider: createManualSpeiProvider({
        submit: 'unknown',
        providerReference: PROVIDER_REF,
      }),
    });
    const r = await adminConfirmPayoutIntent(sb, {
      operation: 'reconcile',
      payoutIntentId: reserved.intent.id,
      provider: 'manual_spei',
      providerReference: PROVIDER_REF,
      idempotencyKey: reserved.intent.idempotency_key,
      amountCents: REWARDS_MIN_PAYOUT_CENTS + 99,
      currency: 'MXN',
      outcome: 'confirmed_success',
      actorId: ADMIN,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('INVALID_EVIDENCE');
      expect(r.reason).toBe('amount_mismatch');
    }
  });

  it('15. SUCCEEDED conflicting confirmation rejected', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const intent = await initiatedIntent(sb);
    await adminConfirmPayoutIntent(sb, {
      operation: 'confirm',
      payoutIntentId: intent.id,
      provider: 'manual_spei',
      providerReference: PROVIDER_REF,
      idempotencyKey: intent.idempotency_key,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      currency: 'MXN',
      outcome: 'confirmed_success',
      actorId: ADMIN,
    });
    const conflict = await adminConfirmPayoutIntent(sb, {
      operation: 'confirm',
      payoutIntentId: intent.id,
      provider: 'manual_spei',
      providerReference: 'OTHER-REF-AFTER-SUCCESS',
      idempotencyKey: intent.idempotency_key,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      currency: 'MXN',
      outcome: 'confirmed_success',
      actorId: ADMIN,
    });
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.reason).toBe('provider_reference_mismatch');
  });

  it('16. FAILED → confirmation rejected', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const reserved = await reservePayoutIntent(sb, { rewardId: REWARD });
    if (!reserved.ok) throw new Error(reserved.reason);
    await submitPayoutIntent(sb, {
      intentId: reserved.intent.id,
      provider: createManualSpeiProvider({
        submit: 'failure',
        providerReference: PROVIDER_REF,
      }),
    });
    const r = await adminConfirmPayoutIntent(sb, {
      operation: 'confirm',
      payoutIntentId: reserved.intent.id,
      provider: 'manual_spei',
      providerReference: PROVIDER_REF,
      idempotencyKey: reserved.intent.idempotency_key,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      currency: 'MXN',
      outcome: 'confirmed_success',
      actorId: ADMIN,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('INVALID_TRANSITION');
  });

  it('17-18. no reward_payouts / no legacy rpc; audit actor', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const intent = await initiatedIntent(sb);
    await adminConfirmPayoutIntent(sb, {
      operation: 'confirm',
      payoutIntentId: intent.id,
      provider: 'manual_spei',
      providerReference: PROVIDER_REF,
      idempotencyKey: intent.idempotency_key,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      currency: 'MXN',
      outcome: 'confirmed_success',
      actorId: ADMIN,
    });
    expect(store.rewardPayouts.length).toBe(0);
    expect(store.rpcCalls).not.toContain(PAYOUT_INTENT_LEGACY_RPC_FORBIDDEN);
    const adminAudit = store.audit.find(
      (a) => (a as { event_type?: string }).event_type === 'admin_payout_confirm',
    ) as { actor_id?: string } | undefined;
    expect(adminAudit?.actor_id).toBe(ADMIN);
  });
});

describe('M4.4 confirm route HTTP auth boundary', () => {
  const prevFreeze = process.env.MONEY_PATH_FROZEN;

  beforeEach(() => {
    process.env.MONEY_PATH_FROZEN = 'false';
    process.env.NODE_ENV = 'test';
    vi.resetModules();
  });

  afterEach(() => {
    if (prevFreeze !== undefined) process.env.MONEY_PATH_FROZEN = prevFreeze;
    else delete process.env.MONEY_PATH_FROZEN;
    vi.doUnmock('@/lib/server/requireAdmin');
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('@/lib/server/rateLimit');
    vi.doUnmock('@/lib/rewards/payoutIntent/adminConfirm');
    vi.resetModules();
  });

  it('2. unauthenticated → 401', async () => {
    vi.doMock('@/lib/server/requireAdmin', () => ({
      requireUsersLogs: vi.fn(async () => ({ error: 'Unauthorized', status: 401 })),
    }));
    vi.doMock('@/lib/server/rateLimit', () => ({
      getClientIp: () => '127.0.0.1',
      enforceRateLimit: vi.fn(async () => ({ success: true })),
    }));
    vi.doMock('@/lib/supabase/server', () => ({
      createServerClient: vi.fn(() => ({})),
    }));
    const { POST } = await import('@/app/api/admin/rewards/payouts/confirm/route');
    const res = await POST(
      new Request('http://localhost/api/admin/rewards/payouts/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ operation: 'confirm' }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('3. non-admin → 403', async () => {
    vi.doMock('@/lib/server/requireAdmin', () => ({
      requireUsersLogs: vi.fn(async () => ({ error: 'Forbidden', status: 403 })),
    }));
    vi.doMock('@/lib/server/rateLimit', () => ({
      getClientIp: () => '127.0.0.1',
      enforceRateLimit: vi.fn(async () => ({ success: true })),
    }));
    vi.doMock('@/lib/supabase/server', () => ({
      createServerClient: vi.fn(() => ({})),
    }));
    const { POST } = await import('@/app/api/admin/rewards/payouts/confirm/route');
    const res = await POST(
      new Request('http://localhost/api/admin/rewards/payouts/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ operation: 'confirm' }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it('19. actor from session — body actor_id rejected', async () => {
    const confirmFn = vi.fn();
    vi.doMock('@/lib/server/requireAdmin', () => ({
      requireUsersLogs: vi.fn(async () => ({
        user: { id: ADMIN },
        role: 'admin',
      })),
    }));
    vi.doMock('@/lib/server/rateLimit', () => ({
      getClientIp: () => '127.0.0.1',
      enforceRateLimit: vi.fn(async () => ({ success: true })),
    }));
    vi.doMock('@/lib/supabase/server', () => ({
      createServerClient: vi.fn(() => ({})),
    }));
    vi.doMock('@/lib/rewards/payoutIntent/adminConfirm', () => ({
      adminConfirmPayoutIntent: confirmFn,
    }));
    const { POST } = await import('@/app/api/admin/rewards/payouts/confirm/route');
    const res = await POST(
      new Request('http://localhost/api/admin/rewards/payouts/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          operation: 'confirm',
          payout_intent_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          provider: 'manual_spei',
          provider_reference: PROVIDER_REF,
          idempotency_key: 'payout_intent:x:v1',
          amount_cents: 20000,
          currency: 'MXN',
          outcome: 'confirmed_success',
          actor_id: CREATOR,
        }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('INVALID_EVIDENCE');
    expect(confirmFn).not.toHaveBeenCalled();
  });

  it('20. money path frozen → 503 fail-closed', async () => {
    process.env.MONEY_PATH_FROZEN = 'true';
    vi.doMock('@/lib/server/requireAdmin', () => ({
      requireUsersLogs: vi.fn(async () => ({
        user: { id: ADMIN },
        role: 'owner',
      })),
    }));
    vi.doMock('@/lib/server/rateLimit', () => ({
      getClientIp: () => '127.0.0.1',
      enforceRateLimit: vi.fn(async () => ({ success: true })),
    }));
    vi.doMock('@/lib/supabase/server', () => ({
      createServerClient: vi.fn(() => ({})),
    }));
    const { POST } = await import('@/app/api/admin/rewards/payouts/confirm/route');
    const res = await POST(
      new Request('http://localhost/api/admin/rewards/payouts/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          operation: 'confirm',
          payout_intent_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          provider: 'manual_spei',
          provider_reference: PROVIDER_REF,
          idempotency_key: 'payout_intent:x:v1',
          amount_cents: 20000,
          currency: 'MXN',
          outcome: 'confirmed_success',
        }),
      }),
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.frozen).toBe(true);
  });

  it('authorized path passes actorId from session only', async () => {
    const confirmFn = vi.fn(async () => ({
      ok: true,
      code: 'SUCCESS',
      intent: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        status: 'SUCCEEDED',
        reward_id: REWARD,
        meta: { provider_reference: PROVIDER_REF },
      },
      rewardId: REWARD,
      rewardStatus: 'PAID',
    }));
    vi.doMock('@/lib/server/requireAdmin', () => ({
      requireUsersLogs: vi.fn(async () => ({
        user: { id: ADMIN },
        role: 'admin',
      })),
    }));
    vi.doMock('@/lib/server/rateLimit', () => ({
      getClientIp: () => '127.0.0.1',
      enforceRateLimit: vi.fn(async () => ({ success: true })),
    }));
    vi.doMock('@/lib/supabase/server', () => ({
      createServerClient: vi.fn(() => ({})),
    }));
    vi.doMock('@/lib/rewards/payoutIntent/adminConfirm', () => ({
      adminConfirmPayoutIntent: confirmFn,
    }));
    const { POST } = await import('@/app/api/admin/rewards/payouts/confirm/route');
    const res = await POST(
      new Request('http://localhost/api/admin/rewards/payouts/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          operation: 'confirm',
          payout_intent_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          provider: 'manual_spei',
          provider_reference: PROVIDER_REF,
          idempotency_key: 'payout_intent:ffffffff-ffff-ffff-ffff-ffffffffffff:v1',
          amount_cents: 20000,
          currency: 'MXN',
          outcome: 'confirmed_success',
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(confirmFn).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorId: ADMIN }),
    );
  });
});
