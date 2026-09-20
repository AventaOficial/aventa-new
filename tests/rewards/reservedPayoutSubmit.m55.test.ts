/**
 * M5.5 — RESERVED → provider submit automation tests.
 * Stop before PAID. No double submit. UNKNOWN → reconcile only.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { REWARDS_MIN_PAYOUT_CENTS } from '@/lib/rewards/config';
import {
  reservePayoutIntent,
  applyProviderConfirmation,
  createSandboxPayoutProvider,
  resolvePayoutProvider,
  loadPayoutIntent,
  cancelPayoutIntent,
  PAYOUT_INTENT_LEGACY_RPC_FORBIDDEN,
  type PayoutIntentRow,
  type PayoutProvider,
} from '@/lib/rewards/payoutIntent';
import {
  processReservedPayoutSubmit,
  processUnknownPayoutReconcile,
  classifySubmitReject,
} from '@/lib/rewards/reservedPayoutSubmit';

const CREATOR = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const REWARD = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const LEDGER = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const REF = 'sandbox:M55-STABLE-REF';

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
            data: [...store.rewards.values()].filter(
              (r) => r.creator_id === filters.eq.creator_id,
            ),
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
            return { data: null, error: { code: '23505', message: 'duplicate key' } };
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
            provider: String(payload.provider ?? 'sandbox'),
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
      if (name === PAYOUT_INTENT_LEGACY_RPC_FORBIDDEN) {
        return { data: null, error: { message: 'legacy_rpc_disabled' } };
      }
      return { data: null, error: { message: 'unexpected_rpc' } };
    }),
  } as unknown as SupabaseClient;
}

function countingProvider(
  options: Parameters<typeof createSandboxPayoutProvider>[0] = {},
): { provider: PayoutProvider; submitCalls: () => number; reconcileCalls: () => number } {
  const inner = createSandboxPayoutProvider(options);
  let submits = 0;
  let reconciles = 0;
  const provider: PayoutProvider = {
    id: inner.id,
    async submit(intent) {
      submits += 1;
      return inner.submit(intent);
    },
    async reconcile(intent) {
      reconciles += 1;
      return inner.reconcile(intent);
    },
  };
  return {
    provider,
    submitCalls: () => submits,
    reconcileCalls: () => reconciles,
  };
}

describe('M5.5 classify', () => {
  it('money_path_frozen → deferred', () => {
    expect(classifySubmitReject('money_path_frozen')).toEqual({
      class: 'deferred',
      terminal: false,
    });
  });
  it('use_reconcile_for_unknown → rejected terminal', () => {
    expect(classifySubmitReject('use_reconcile_for_unknown')).toEqual({
      class: 'rejected',
      terminal: true,
    });
  });
});

describe('M5.5 processReservedPayoutSubmit', () => {
  const prevFreeze = process.env.MONEY_PATH_FROZEN;
  const prevProgram = process.env.REWARDS_PROGRAM_ACTIVE;

  beforeEach(() => {
    process.env.MONEY_PATH_FROZEN = 'false';
    process.env.REWARDS_PROGRAM_ACTIVE = 'true';
  });
  afterEach(() => {
    process.env.MONEY_PATH_FROZEN = prevFreeze;
    process.env.REWARDS_PROGRAM_ACTIVE = prevProgram;
  });

  async function reserved(sb: SupabaseClient) {
    const r = await reservePayoutIntent(sb, { rewardId: REWARD });
    if (!r.ok) throw new Error(r.reason);
    return r.intent;
  }

  it('A — RESERVED → initiated submit → SUBMITTED, NOT PAID', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const intent = await reserved(sb);
    const { provider, submitCalls } = countingProvider({
      submit: 'initiated',
      providerReference: REF,
    });
    const r = await processReservedPayoutSubmit(sb, intent.id, { provider });
    expect(r.outcome).toBe('submitted');
    expect(r.intentStatus).toBe('SUBMITTED');
    expect(r.paid).toBe(false);
    expect(r.providerSubmitInvoked).toBe(true);
    expect(submitCalls()).toBe(1);
    expect(store.rewards.get(REWARD)?.status).toBe('AVAILABLE');
    expect(store.rewardPayouts).toHaveLength(0);
    expect(store.intents.size).toBe(1);
  });

  it('B — replay same intent → reused, no second submit', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const intent = await reserved(sb);
    const { provider, submitCalls } = countingProvider({
      submit: 'initiated',
      providerReference: REF,
    });
    const a = await processReservedPayoutSubmit(sb, intent.id, { provider });
    const b = await processReservedPayoutSubmit(sb, intent.id, { provider });
    expect(a.outcome).toBe('submitted');
    expect(b.outcome).toBe('reused');
    expect(b.providerSubmitInvoked).toBe(false);
    expect(submitCalls()).toBe(1);
    expect(store.intents.size).toBe(1);
  });

  it('C — concurrent ×10 → one provider.submit', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const intent = await reserved(sb);
    const { provider, submitCalls } = countingProvider({
      submit: 'initiated',
      providerReference: REF,
    });
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        processReservedPayoutSubmit(sb, intent.id, { provider }),
      ),
    );
    const invoked = results.filter((r) => r.providerSubmitInvoked);
    const submittedOrReused = results.filter(
      (r) => r.outcome === 'submitted' || r.outcome === 'reused',
    );
    expect(submitCalls()).toBe(1);
    expect(invoked.length).toBe(1);
    expect(submittedOrReused.length).toBe(10);
    expect(store.intents.size).toBe(1);
    expect(store.rewards.get(REWARD)?.status).toBe('AVAILABLE');
  });

  it('D — timeout → UNKNOWN, NOT PAID', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const intent = await reserved(sb);
    const { provider } = countingProvider({ submit: 'timeout' });
    const r = await processReservedPayoutSubmit(sb, intent.id, {
      provider,
      sandboxOptions: { submit: 'timeout' },
    });
    expect(r.outcome).toBe('unknown');
    expect(r.intentStatus).toBe('UNKNOWN');
    expect(r.paid).toBe(false);
    expect(store.rewards.get(REWARD)?.status).toBe('AVAILABLE');
  });

  it('E — UNKNOWN replay submit → rejected (no blind resubmit)', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const intent = await reserved(sb);
    await processReservedPayoutSubmit(sb, intent.id, {
      provider: createSandboxPayoutProvider({ submit: 'timeout' }),
      sandboxOptions: { submit: 'timeout' },
    });
    const { provider, submitCalls } = countingProvider({ submit: 'initiated' });
    const r = await processReservedPayoutSubmit(sb, intent.id, { provider });
    expect(r.outcome).toBe('rejected');
    expect(r.reason).toBe('use_reconcile_for_unknown');
    expect(submitCalls()).toBe(0);
  });

  it('F — UNKNOWN → reconcile SUCCESS evidence, stop before PAID', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const intent = await reserved(sb);
    await processReservedPayoutSubmit(sb, intent.id, {
      provider: createSandboxPayoutProvider({ submit: 'timeout' }),
      sandboxOptions: { submit: 'timeout' },
    });
    const r = await processUnknownPayoutReconcile(sb, intent.id, {
      sandboxOptions: { reconcile: 'success', providerReference: REF },
      applyPaid: false,
    });
    expect(r.outcome).toBe('evidence_observed');
    expect(r.confirmationPending).toBe(true);
    expect(r.paid).toBe(false);
    expect(r.intentStatus).toBe('UNKNOWN');
    expect(store.rewards.get(REWARD)?.status).toBe('AVAILABLE');
  });

  it('G — UNKNOWN → reconcile FAILURE → FAILED, NOT PAID', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const intent = await reserved(sb);
    await processReservedPayoutSubmit(sb, intent.id, {
      provider: createSandboxPayoutProvider({ submit: 'timeout' }),
      sandboxOptions: { submit: 'timeout' },
    });
    const r = await processUnknownPayoutReconcile(sb, intent.id, {
      provider: createSandboxPayoutProvider({ reconcile: 'failure' }),
      sandboxOptions: { reconcile: 'failure' },
      applyPaid: false,
    });
    expect(r.outcome).toBe('reconciled_failed');
    expect(r.intentStatus).toBe('FAILED');
    expect(r.paid).toBe(false);
    expect(store.rewards.get(REWARD)?.status).toBe('AVAILABLE');
  });

  it('H/I/J — confirmation mismatches reject', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const intent = await reserved(sb);
    await processReservedPayoutSubmit(sb, intent.id, {
      provider: createSandboxPayoutProvider({
        submit: 'initiated',
        providerReference: REF,
      }),
    });
    const base = {
      intentId: intent.id,
      rewardId: REWARD,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      currency: 'MXN',
      idempotencyKey: intent.idempotency_key,
      provider: 'sandbox',
      providerReference: REF,
      outcome: 'confirmed_success' as const,
    };
    const amount = await applyProviderConfirmation(sb, {
      ...base,
      amountCents: REWARDS_MIN_PAYOUT_CENTS + 1,
    });
    expect(amount.ok).toBe(false);
    const currency = await applyProviderConfirmation(sb, {
      ...base,
      currency: 'USD',
    });
    expect(currency.ok).toBe(false);
    const key = await applyProviderConfirmation(sb, {
      ...base,
      idempotencyKey: 'payout_intent:other:v1',
    });
    expect(key.ok).toBe(false);
    expect(store.rewards.get(REWARD)?.status).toBe('AVAILABLE');
  });

  it('K — CANCELLED / terminal → no submit', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const intent = await reserved(sb);
    await cancelPayoutIntent(sb, { intentId: intent.id });
    const { provider, submitCalls } = countingProvider({ submit: 'initiated' });
    const r = await processReservedPayoutSubmit(sb, intent.id, { provider });
    expect(r.outcome).toBe('rejected');
    expect(r.reason).toBe('already_terminal');
    expect(submitCalls()).toBe(0);
  });

  it('L — MONEY_PATH_FROZEN → deferred/fail-closed', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const intent = await reserved(sb);
    process.env.MONEY_PATH_FROZEN = 'true';
    const r = await processReservedPayoutSubmit(sb, intent.id, {
      provider: createSandboxPayoutProvider({ submit: 'initiated' }),
    });
    expect(['deferred', 'rejected']).toContain(r.outcome);
    expect(r.reason).toBe('money_path_frozen');
    expect(r.paid).toBe(false);
  });

  it('M — real provider blocked in production', () => {
    const r = resolvePayoutProvider({
      PAYOUT_PROVIDER: 'real',
      NODE_ENV: 'production',
      VERCEL_ENV: 'production',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('provider_forbidden_in_production');
  });

  it('N/O — program inactive → deferred; no PAID path in source', async () => {
    process.env.REWARDS_PROGRAM_ACTIVE = 'false';
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const intent = await reserved(sb);
    const { provider, submitCalls } = countingProvider();
    const r = await processReservedPayoutSubmit(sb, intent.id, { provider });
    expect(r.outcome).toBe('deferred');
    expect(r.reason).toBe('program_inactive');
    expect(submitCalls()).toBe(0);

    const root = join(process.cwd(), 'lib/rewards/reservedPayoutSubmit');
    for (const f of [
      'processReservedPayoutSubmit.ts',
      'reconcileReserved.ts',
      'classify.ts',
      'index.ts',
    ]) {
      const src = readFileSync(join(root, f), 'utf8');
      expect(src).not.toMatch(/confirmPayoutIntentSuccess\s*\(/);
      expect(src).not.toMatch(/createRealPayoutProvider/);
    }
    // Unknown reconcile may call executeProviderReconcile (failure path) but default applyPaid=false
    const unk = readFileSync(join(root, 'processUnknownPayoutReconcile.ts'), 'utf8');
    expect(unk).toMatch(/applyPaid/);
    expect(unk).toMatch(/stop_before_paid|confirmation_pending|applyProviderConfirmation/i);
  });

  it('same idempotency key across submit lifecycle', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const intent = await reserved(sb);
    const key = intent.idempotency_key;
    await processReservedPayoutSubmit(sb, intent.id, {
      provider: createSandboxPayoutProvider({ submit: 'timeout' }),
      sandboxOptions: { submit: 'timeout' },
    });
    const after = await loadPayoutIntent(sb, intent.id);
    expect(after?.idempotency_key).toBe(key);
    expect(store.intents.size).toBe(1);
  });
});
