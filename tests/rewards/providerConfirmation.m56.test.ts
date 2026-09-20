/**
 * M5.6 — Automated provider confirmation tests.
 * Sole PAID authority: applyProviderConfirmation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { REWARDS_MIN_PAYOUT_CENTS } from '@/lib/rewards/config';
import {
  reservePayoutIntent,
  createSandboxPayoutProvider,
  resolvePayoutProvider,
  cancelPayoutIntent,
  processProviderWebhook,
  signProviderWebhookPayload,
  PROVIDER_WEBHOOK_SIGNATURE_HEADER,
  PAYOUT_INTENT_LEGACY_RPC_FORBIDDEN,
  type PayoutIntentRow,
  type PayoutProvider,
} from '@/lib/rewards/payoutIntent';
import { processReservedPayoutSubmit } from '@/lib/rewards/reservedPayoutSubmit';
import {
  processConfirmablePayoutIntent,
  classifyConfirmReject,
} from '@/lib/rewards/providerConfirmationAutomation';

const CREATOR = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const REWARD = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const LEDGER = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const REF = 'sandbox:M56-STABLE-REF';
const WEBHOOK_SECRET = 'm56-test-webhook-secret';

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

function countingReconcile(
  options: Parameters<typeof createSandboxPayoutProvider>[0] = {},
): { provider: PayoutProvider; reconcileCalls: () => number; submitCalls: () => number } {
  const inner = createSandboxPayoutProvider(options);
  let reconciles = 0;
  let submits = 0;
  return {
    provider: {
      id: inner.id,
      async submit(intent) {
        submits += 1;
        return inner.submit(intent);
      },
      async reconcile(intent) {
        reconciles += 1;
        return inner.reconcile(intent);
      },
    },
    reconcileCalls: () => reconciles,
    submitCalls: () => submits,
  };
}

async function toSubmitted(sb: SupabaseClient, ref = REF) {
  const reserved = await reservePayoutIntent(sb, { rewardId: REWARD });
  if (!reserved.ok) throw new Error(reserved.reason);
  const sub = await processReservedPayoutSubmit(sb, reserved.intent.id, {
    provider: createSandboxPayoutProvider({ submit: 'initiated', providerReference: ref }),
  });
  if (sub.intentStatus !== 'SUBMITTED') throw new Error(`submit:${sub.outcome}`);
  return { intentId: reserved.intent.id, intent: reserved.intent };
}

async function toUnknown(sb: SupabaseClient) {
  const reserved = await reservePayoutIntent(sb, { rewardId: REWARD });
  if (!reserved.ok) throw new Error(reserved.reason);
  const sub = await processReservedPayoutSubmit(sb, reserved.intent.id, {
    provider: createSandboxPayoutProvider({ submit: 'timeout' }),
    sandboxOptions: { submit: 'timeout' },
  });
  if (sub.intentStatus !== 'UNKNOWN') throw new Error(`timeout:${sub.outcome}`);
  return { intentId: reserved.intent.id, key: reserved.intent.idempotency_key };
}

describe('M5.6 classify', () => {
  it('mismatches → invalid_evidence', () => {
    expect(classifyConfirmReject('amount_mismatch').class).toBe('invalid_evidence');
    expect(classifyConfirmReject('money_path_frozen').class).toBe('deferred');
  });
});

describe('M5.6 processConfirmablePayoutIntent', () => {
  const prevFreeze = process.env.MONEY_PATH_FROZEN;
  const prevProgram = process.env.REWARDS_PROGRAM_ACTIVE;
  const prevSecret = process.env.PAYOUT_PROVIDER_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.MONEY_PATH_FROZEN = 'false';
    process.env.REWARDS_PROGRAM_ACTIVE = 'true';
    process.env.PAYOUT_PROVIDER_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });
  afterEach(() => {
    process.env.MONEY_PATH_FROZEN = prevFreeze;
    process.env.REWARDS_PROGRAM_ACTIVE = prevProgram;
    process.env.PAYOUT_PROVIDER_WEBHOOK_SECRET = prevSecret;
  });

  it('A — SUBMITTED → reconcile SUCCESS → PAID', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const { intentId } = await toSubmitted(sb);
    const { provider, submitCalls } = countingReconcile({
      reconcile: 'success',
      providerReference: REF,
    });
    const r = await processConfirmablePayoutIntent(sb, intentId, { provider });
    expect(r.outcome).toBe('paid');
    expect(r.paid).toBe(true);
    expect(r.intentStatus).toBe('SUCCEEDED');
    expect(store.rewards.get(REWARD)?.status).toBe('PAID');
    expect(submitCalls()).toBe(0);
    expect(store.rewardPayouts).toHaveLength(0);
  });

  it('B — UNKNOWN → reconcile SUCCESS → PAID', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const { intentId } = await toUnknown(sb);
    const r = await processConfirmablePayoutIntent(sb, intentId, {
      provider: createSandboxPayoutProvider({
        reconcile: 'success',
        providerReference: `sandbox:unk:${intentId}`,
      }),
    });
    expect(r.outcome).toBe('paid');
    expect(store.rewards.get(REWARD)?.status).toBe('PAID');
  });

  it('C — UNKNOWN → reconcile UNKNOWN → stays UNKNOWN', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const { intentId } = await toUnknown(sb);
    const r = await processConfirmablePayoutIntent(sb, intentId, {
      provider: createSandboxPayoutProvider({ reconcile: 'unknown' }),
    });
    expect(r.outcome).toBe('still_unknown');
    expect(r.intentStatus).toBe('UNKNOWN');
    expect(r.paid).toBe(false);
    expect(store.rewards.get(REWARD)?.status).toBe('AVAILABLE');
  });

  it('D — UNKNOWN → reconcile FAILURE → FAILED', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const { intentId } = await toUnknown(sb);
    const r = await processConfirmablePayoutIntent(sb, intentId, {
      provider: createSandboxPayoutProvider({ reconcile: 'failure' }),
    });
    expect(r.outcome).toBe('failed');
    expect(r.intentStatus).toBe('FAILED');
    expect(store.rewards.get(REWARD)?.status).toBe('AVAILABLE');
  });

  it('E — duplicate SUCCESS → no double PAID', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const { intentId } = await toSubmitted(sb);
    const provider = createSandboxPayoutProvider({
      reconcile: 'success',
      providerReference: REF,
    });
    const a = await processConfirmablePayoutIntent(sb, intentId, { provider });
    const b = await processConfirmablePayoutIntent(sb, intentId, { provider });
    expect(a.outcome).toBe('paid');
    expect(b.outcome).toBe('reused');
    expect(b.paid).toBe(true);
    expect(store.intents.size).toBe(1);
  });

  it('F/G — webhook SUCCESS + duplicate → one PAID', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const { intentId, intent } = await toSubmitted(sb);
    const body = JSON.stringify({
      intent_id: intentId,
      reward_id: REWARD,
      amount_cents: REWARDS_MIN_PAYOUT_CENTS,
      currency: 'MXN',
      idempotency_key: intent.idempotency_key,
      provider_reference: REF,
      provider: 'sandbox',
      status: 'success',
    });
    const sig = signProviderWebhookPayload(body, WEBHOOK_SECRET);
    const headers = { [PROVIDER_WEBHOOK_SIGNATURE_HEADER]: sig };
    const a = await processProviderWebhook(sb, { rawBody: body, headers });
    const b = await processProviderWebhook(sb, { rawBody: body, headers });
    expect(a.ok).toBe(true);
    if (a.ok) expect(a.code).toBe('SUCCESS');
    expect(b.ok).toBe(true);
    if (b.ok) expect(b.code).toBe('ALREADY_APPLIED');
    expect(store.rewards.get(REWARD)?.status).toBe('PAID');
  });

  it('H — webhook + reconcile concurrent → one PAID', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const { intentId, intent } = await toSubmitted(sb);
    const body = JSON.stringify({
      intent_id: intentId,
      reward_id: REWARD,
      amount_cents: REWARDS_MIN_PAYOUT_CENTS,
      currency: 'MXN',
      idempotency_key: intent.idempotency_key,
      provider_reference: REF,
      provider: 'sandbox',
      status: 'success',
    });
    const sig = signProviderWebhookPayload(body, WEBHOOK_SECRET);
    const headers = { [PROVIDER_WEBHOOK_SIGNATURE_HEADER]: sig };
    const provider = createSandboxPayoutProvider({
      reconcile: 'success',
      providerReference: REF,
    });
    await Promise.all([
      processProviderWebhook(sb, { rawBody: body, headers }),
      processConfirmablePayoutIntent(sb, intentId, { provider }),
      processConfirmablePayoutIntent(sb, intentId, { provider }),
    ]);
    expect(store.rewards.get(REWARD)?.status).toBe('PAID');
    expect(store.intents.size).toBe(1);
  });

  it('I/J/K/L — evidence mismatches → no PAID', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const { intentId, intent } = await toSubmitted(sb);
    const mk = (patch: Record<string, unknown>) => {
      const body = JSON.stringify({
        intent_id: intentId,
        reward_id: REWARD,
        amount_cents: REWARDS_MIN_PAYOUT_CENTS,
        currency: 'MXN',
        idempotency_key: intent.idempotency_key,
        provider_reference: REF,
        provider: 'sandbox',
        status: 'success',
        ...patch,
      });
      const sig = signProviderWebhookPayload(body, WEBHOOK_SECRET);
      return processProviderWebhook(sb, {
        rawBody: body,
        headers: { [PROVIDER_WEBHOOK_SIGNATURE_HEADER]: sig },
      });
    };
    expect((await mk({ amount_cents: REWARDS_MIN_PAYOUT_CENTS + 1 })).ok).toBe(false);
    expect((await mk({ currency: 'USD' })).ok).toBe(false);
    expect((await mk({ provider_reference: 'OTHER-REF' })).ok).toBe(false);
    expect((await mk({ idempotency_key: 'payout_intent:other:v1' })).ok).toBe(false);
    expect(store.rewards.get(REWARD)?.status).toBe('AVAILABLE');
  });

  it('N — CANCELLED → no PAID', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const reserved = await reservePayoutIntent(sb, { rewardId: REWARD });
    if (!reserved.ok) throw new Error('reserve');
    await cancelPayoutIntent(sb, { intentId: reserved.intent.id });
    const r = await processConfirmablePayoutIntent(sb, reserved.intent.id, {
      provider: createSandboxPayoutProvider({ reconcile: 'success', providerReference: REF }),
    });
    expect(r.outcome).toBe('rejected');
    expect(r.reason).toBe('already_terminal');
    expect(store.rewards.get(REWARD)?.status).toBe('AVAILABLE');
  });

  it('P — MONEY_PATH_FROZEN → no economic transition', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const { intentId } = await toSubmitted(sb);
    process.env.MONEY_PATH_FROZEN = 'true';
    const r = await processConfirmablePayoutIntent(sb, intentId, {
      provider: createSandboxPayoutProvider({ reconcile: 'success', providerReference: REF }),
    });
    expect(r.outcome).toBe('deferred');
    expect(r.reason).toBe('money_path_frozen');
    expect(store.rewards.get(REWARD)?.status).toBe('AVAILABLE');
  });

  it('Q — real provider blocked in production', () => {
    const r = resolvePayoutProvider({
      PAYOUT_PROVIDER: 'real',
      NODE_ENV: 'production',
      VERCEL_ENV: 'production',
    });
    expect(r.ok).toBe(false);
  });

  it('S — concurrent ×10 reconcile → one PAID', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const { intentId } = await toSubmitted(sb);
    const { provider, submitCalls, reconcileCalls } = countingReconcile({
      reconcile: 'success',
      providerReference: REF,
    });
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        processConfirmablePayoutIntent(sb, intentId, { provider }),
      ),
    );
    const paid = results.filter((r) => r.outcome === 'paid');
    const reused = results.filter((r) => r.outcome === 'reused');
    expect(paid.length + reused.length).toBe(10);
    expect(paid.length).toBeGreaterThanOrEqual(1);
    expect(store.rewards.get(REWARD)?.status).toBe('PAID');
    expect(submitCalls()).toBe(0);
    expect(reconcileCalls()).toBeGreaterThanOrEqual(1);
    expect(store.intents.size).toBe(1);
    expect(store.rewardPayouts).toHaveLength(0);
  });

  it('source guard — no direct PAID writer / no submit', () => {
    const root = join(process.cwd(), 'lib/rewards/providerConfirmationAutomation');
    const main = readFileSync(join(root, 'processConfirmablePayoutIntent.ts'), 'utf8');
    expect(main).toMatch(/applyProviderConfirmation/);
    expect(main).not.toMatch(/\.from\(['"]creator_rewards['"]\)\s*\.update/);
    expect(main).not.toMatch(/submitPayoutIntent\s*\(/);
    expect(main).not.toMatch(/executeProviderSubmit/);
    for (const f of [
      'processConfirmablePayoutIntent.ts',
      'reconcileConfirmable.ts',
      'classify.ts',
      'index.ts',
    ]) {
      const src = readFileSync(join(root, f), 'utf8');
      expect(src).not.toMatch(/createRealPayoutProvider/);
      expect(src).not.toMatch(/submitPayoutIntent\s*\(/);
    }
  });
});
