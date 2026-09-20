/**
 * M4.3 — SPEI confirmation boundary contract tests.
 * No real money. Evidence-backed SUCCESS only.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { REWARDS_MIN_PAYOUT_CENTS } from '@/lib/rewards/config';
import {
  reservePayoutIntent,
  submitPayoutIntent,
  reconcilePayoutIntent,
  applyProviderConfirmation,
  loadPayoutIntentByReward,
  createManualSpeiProvider,
  createStubPayoutProvider,
  readConfirmationMeta,
  PAYOUT_INTENT_LEGACY_RPC_FORBIDDEN,
} from '@/lib/rewards/payoutIntent';
import type { PayoutIntentRow } from '@/lib/rewards/payoutIntent';

const CREATOR = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const REWARD = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const LEDGER = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const PROVIDER_REF = 'SPEI-M43-STABLE-REF-001';

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

async function reserveAndSubmit(
  sb: SupabaseClient,
  provider: ReturnType<typeof createManualSpeiProvider> | ReturnType<typeof createStubPayoutProvider>,
) {
  const reserved = await reservePayoutIntent(sb, { rewardId: REWARD });
  if (!reserved.ok) throw new Error(`reserve: ${reserved.reason}`);
  const submitted = await submitPayoutIntent(sb, {
    intentId: reserved.intent.id,
    provider,
  });
  return { reserved, submitted };
}

function evidenceFrom(
  intent: PayoutIntentRow,
  overrides: Partial<{
    rewardId: string;
    amountCents: number;
    currency: string;
    idempotencyKey: string;
    providerReference: string;
    outcome: 'confirmed_success' | 'confirmed_failure';
  }> = {},
) {
  return {
    intentId: intent.id,
    rewardId: overrides.rewardId ?? intent.reward_id,
    amountCents: overrides.amountCents ?? intent.amount_cents,
    currency: overrides.currency ?? intent.currency,
    idempotencyKey: overrides.idempotencyKey ?? intent.idempotency_key,
    provider: intent.provider,
    providerReference: overrides.providerReference ?? PROVIDER_REF,
    outcome: overrides.outcome ?? ('confirmed_success' as const),
  };
}

describe('M4.3 SPEI confirmation boundary', () => {
  const prevFreeze = process.env.MONEY_PATH_FROZEN;

  beforeEach(() => {
    process.env.MONEY_PATH_FROZEN = 'false';
  });

  afterEach(() => {
    if (prevFreeze !== undefined) process.env.MONEY_PATH_FROZEN = prevFreeze;
    else delete process.env.MONEY_PATH_FROZEN;
  });

  it('1. success inmediato', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const { submitted } = await reserveAndSubmit(
      sb,
      createManualSpeiProvider({ submit: 'success', providerReference: PROVIDER_REF }),
    );
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    expect(submitted.intent.status).toBe('SUCCEEDED');
    expect(store.rewards.get(REWARD)?.status).toBe('PAID');
    expect(readConfirmationMeta(submitted.intent.meta).confirmationStatus).toBe(
      'confirmed_success',
    );
  });

  it('2. initiated → SUBMITTED awaiting confirmation (no PAID)', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const { submitted } = await reserveAndSubmit(
      sb,
      createManualSpeiProvider({ submit: 'initiated', providerReference: PROVIDER_REF }),
    );
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    expect(submitted.intent.status).toBe('SUBMITTED');
    expect(store.rewards.get(REWARD)?.status).toBe('AVAILABLE');
    const meta = readConfirmationMeta(submitted.intent.meta);
    expect(meta.confirmationStatus).toBe('initiated');
    expect(meta.providerReference).toBe(PROVIDER_REF);
    expect(meta.awaitingConfirmation).toBe(true);
  });

  it('3. timeout → UNKNOWN (never SUCCESS)', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const { submitted } = await reserveAndSubmit(
      sb,
      createStubPayoutProvider({ submit: 'timeout' }),
    );
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    expect(submitted.intent.status).toBe('UNKNOWN');
    expect(store.rewards.get(REWARD)?.status).toBe('AVAILABLE');
  });

  it('4. UNKNOWN → reconcile SUCCESS → PAID', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const { reserved } = await reserveAndSubmit(
      sb,
      createManualSpeiProvider({
        submit: 'unknown',
        reconcile: 'success',
        providerReference: PROVIDER_REF,
      }),
    );
    const rec = await reconcilePayoutIntent(sb, {
      intentId: reserved.intent.id,
      provider: createManualSpeiProvider({
        submit: 'unknown',
        reconcile: 'success',
        providerReference: PROVIDER_REF,
      }),
    });
    expect(rec.ok).toBe(true);
    if (!rec.ok) return;
    expect(rec.intent.status).toBe('SUCCEEDED');
    expect(store.rewards.get(REWARD)?.status).toBe('PAID');
  });

  it('5. UNKNOWN → reconcile FAILURE', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const { reserved } = await reserveAndSubmit(
      sb,
      createManualSpeiProvider({
        submit: 'unknown',
        reconcile: 'failure',
        providerReference: PROVIDER_REF,
      }),
    );
    const rec = await reconcilePayoutIntent(sb, {
      intentId: reserved.intent.id,
      provider: createManualSpeiProvider({
        submit: 'unknown',
        reconcile: 'failure',
        providerReference: PROVIDER_REF,
      }),
    });
    expect(rec.ok).toBe(true);
    if (!rec.ok) return;
    expect(rec.intent.status).toBe('FAILED');
    expect(store.rewards.get(REWARD)?.status).toBe('AVAILABLE');
  });

  it('A. same callback ×2 → un solo efecto', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const { submitted } = await reserveAndSubmit(
      sb,
      createManualSpeiProvider({ submit: 'initiated', providerReference: PROVIDER_REF }),
    );
    if (!submitted.ok) throw new Error('init');
    const ev = evidenceFrom(submitted.intent);
    const a = await applyProviderConfirmation(sb, ev);
    const b = await applyProviderConfirmation(sb, ev);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(b.reused).toBe(true);
    expect(store.intents.size).toBe(1);
    expect([...store.rewards.values()].filter((r) => r.status === 'PAID')).toHaveLength(1);
  });

  it('B. same provider reference ×N → un pago', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const { submitted } = await reserveAndSubmit(
      sb,
      createManualSpeiProvider({ submit: 'initiated', providerReference: PROVIDER_REF }),
    );
    if (!submitted.ok) throw new Error('init');
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        applyProviderConfirmation(sb, evidenceFrom(submitted.intent)),
      ),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    expect(store.intents.size).toBe(1);
    expect(store.rewards.get(REWARD)?.status).toBe('PAID');
  });

  it('C. concurrent confirmation ×N → un PAID', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const { submitted } = await reserveAndSubmit(
      sb,
      createManualSpeiProvider({ submit: 'initiated', providerReference: PROVIDER_REF }),
    );
    if (!submitted.ok) throw new Error('init');
    await Promise.all([
      applyProviderConfirmation(sb, evidenceFrom(submitted.intent)),
      applyProviderConfirmation(sb, evidenceFrom(submitted.intent)),
      applyProviderConfirmation(sb, evidenceFrom(submitted.intent)),
    ]);
    expect(store.rewards.get(REWARD)?.status).toBe('PAID');
    expect(store.intents.size).toBe(1);
  });

  it('D. UNKNOWN × concurrent reconciliation → un final', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const { reserved, submitted } = await reserveAndSubmit(
      sb,
      createManualSpeiProvider({
        submit: 'unknown',
        reconcile: 'success',
        providerReference: PROVIDER_REF,
      }),
    );
    expect(submitted.ok && submitted.intent.status === 'UNKNOWN').toBe(true);
    const provider = createManualSpeiProvider({
      submit: 'unknown',
      reconcile: 'success',
      providerReference: PROVIDER_REF,
    });
    const results = await Promise.all([
      reconcilePayoutIntent(sb, { intentId: reserved.intent.id, provider }),
      reconcilePayoutIntent(sb, { intentId: reserved.intent.id, provider }),
      reconcilePayoutIntent(sb, { intentId: reserved.intent.id, provider }),
    ]);
    expect(results.filter((r) => r.ok && r.intent.status === 'SUCCEEDED').length).toBeGreaterThanOrEqual(1);
    expect(store.rewards.get(REWARD)?.status).toBe('PAID');
    expect(store.intents.size).toBe(1);
  });

  it('E. success después de failure terminal → reject', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const { submitted } = await reserveAndSubmit(
      sb,
      createManualSpeiProvider({ submit: 'failure', providerReference: PROVIDER_REF }),
    );
    expect(submitted.ok && submitted.intent.status === 'FAILED').toBe(true);
    if (!submitted.ok) return;
    const again = await applyProviderConfirmation(sb, evidenceFrom(submitted.intent));
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('already_resolved');
    expect(store.rewards.get(REWARD)?.status).toBe('AVAILABLE');
  });

  it('F. confirmation reward incorrecto → reject', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const { submitted } = await reserveAndSubmit(
      sb,
      createManualSpeiProvider({ submit: 'initiated', providerReference: PROVIDER_REF }),
    );
    if (!submitted.ok) throw new Error('init');
    const bad = await applyProviderConfirmation(
      sb,
      evidenceFrom(submitted.intent, { rewardId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }),
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe('reward_mismatch');
    expect(store.rewards.get(REWARD)?.status).toBe('AVAILABLE');
  });

  it('G. amount incorrecto → reject', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const { submitted } = await reserveAndSubmit(
      sb,
      createManualSpeiProvider({ submit: 'initiated', providerReference: PROVIDER_REF }),
    );
    if (!submitted.ok) throw new Error('init');
    const bad = await applyProviderConfirmation(
      sb,
      evidenceFrom(submitted.intent, { amountCents: REWARDS_MIN_PAYOUT_CENTS + 1 }),
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe('amount_mismatch');
  });

  it('H. currency incorrecta → reject', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const { submitted } = await reserveAndSubmit(
      sb,
      createManualSpeiProvider({ submit: 'initiated', providerReference: PROVIDER_REF }),
    );
    if (!submitted.ok) throw new Error('init');
    const bad = await applyProviderConfirmation(
      sb,
      evidenceFrom(submitted.intent, { currency: 'USD' }),
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe('currency_mismatch');
  });

  it('provider reference mismatch → reject', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const { submitted } = await reserveAndSubmit(
      sb,
      createManualSpeiProvider({ submit: 'initiated', providerReference: PROVIDER_REF }),
    );
    if (!submitted.ok) throw new Error('init');
    const bad = await applyProviderConfirmation(
      sb,
      evidenceFrom(submitted.intent, { providerReference: 'OTHER-REF' }),
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe('provider_reference_mismatch');
  });

  it('idempotency key mismatch → reject', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const { submitted } = await reserveAndSubmit(
      sb,
      createManualSpeiProvider({ submit: 'initiated', providerReference: PROVIDER_REF }),
    );
    if (!submitted.ok) throw new Error('init');
    const bad = await applyProviderConfirmation(
      sb,
      evidenceFrom(submitted.intent, { idempotencyKey: 'payout_intent:wrong:v1' }),
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe('idempotency_key_mismatch');
  });

  it('initiated → confirm SUCCESS path', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const { submitted } = await reserveAndSubmit(
      sb,
      createManualSpeiProvider({ submit: 'initiated', providerReference: PROVIDER_REF }),
    );
    if (!submitted.ok) throw new Error('init');
    const conf = await applyProviderConfirmation(sb, evidenceFrom(submitted.intent));
    expect(conf.ok).toBe(true);
    if (!conf.ok) return;
    expect(conf.intent.status).toBe('SUCCEEDED');
    expect(readConfirmationMeta(conf.intent.meta).confirmedAt).toBeTruthy();
    expect(store.rewards.get(REWARD)?.status).toBe('PAID');
  });

  it('legacy RPC + reward_payouts untouched', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    await reserveAndSubmit(
      sb,
      createManualSpeiProvider({ submit: 'success', providerReference: PROVIDER_REF }),
    );
    expect(store.rpcCalls).not.toContain(PAYOUT_INTENT_LEGACY_RPC_FORBIDDEN);
    expect(store.rewardPayouts.length).toBe(0);
    expect(store.moneyMoves).toBe(0);
    expect(await loadPayoutIntentByReward(sb, REWARD)).toBeTruthy();
  });
});
