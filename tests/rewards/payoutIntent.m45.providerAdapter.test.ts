/**
 * M4.5 — Provider adapter boundary contract tests.
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
  executeProviderSubmit,
  executeProviderReconcile,
  normalizeSubmitResult,
  normalizedToConfirmationEvidence,
  PROVIDER_ADAPTER_MUST_NOT_MUTATE_DB,
  PAYOUT_INTENT_LEGACY_RPC_FORBIDDEN,
} from '@/lib/rewards/payoutIntent';
import type { PayoutIntentRow } from '@/lib/rewards/payoutIntent';

const CREATOR = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const REWARD = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const LEDGER = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const REF = 'sandbox:M45-STABLE-REF';

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
  ledgerWrites: number;
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
    ledgerWrites: 0,
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
    if (table === 'affiliate_ledger_entries') {
      return {
        insert: () => {
          store.ledgerWrites += 1;
          return { select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) };
        },
        update: () => {
          store.ledgerWrites += 1;
          return { eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) };
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

async function reserve(sb: SupabaseClient) {
  const r = await reservePayoutIntent(sb, { rewardId: REWARD });
  if (!r.ok) throw new Error(r.reason);
  return r.intent;
}

describe('M4.5 resolvePayoutProvider fail-closed', () => {
  it('18. credentials missing for real → fail closed', () => {
    const r = resolvePayoutProvider({
      PAYOUT_PROVIDER: 'real',
      NODE_ENV: 'test',
      VERCEL_ENV: 'preview',
    });
    expect(r.ok).toBe(false);
    // M4.6: missing URL and/or API key both fail closed (never sandbox fallback).
    if (!r.ok) {
      expect(['credentials_missing', 'api_url_missing', 'invalid_config']).toContain(
        r.reason,
      );
    }
  });

  it('23. production configuration fails closed', () => {
    const r = resolvePayoutProvider({
      PAYOUT_PROVIDER: 'sandbox',
      NODE_ENV: 'production',
      VERCEL_ENV: 'production',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('provider_forbidden_in_production');
  });

  it('provider unset → fail closed', () => {
    const r = resolvePayoutProvider({
      NODE_ENV: 'test',
      VERCEL_ENV: 'preview',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('provider_not_configured');
  });

  it('stub|sandbox resolve ok', () => {
    const a = resolvePayoutProvider(
      { PAYOUT_PROVIDER: 'sandbox', NODE_ENV: 'test' },
      { submit: 'initiated', providerReference: REF },
    );
    expect(a.ok).toBe(true);
    const b = resolvePayoutProvider(
      { PAYOUT_PROVIDER: 'stub', NODE_ENV: 'test' },
      { submit: 'immediate_success', providerReference: REF },
    );
    expect(b.ok).toBe(true);
  });
});

describe('M4.5 sandbox provider + execute', () => {
  const prevFreeze = process.env.MONEY_PATH_FROZEN;
  const prevProvider = process.env.PAYOUT_PROVIDER;

  beforeEach(() => {
    process.env.MONEY_PATH_FROZEN = 'false';
    process.env.PAYOUT_PROVIDER = 'sandbox';
  });

  afterEach(() => {
    if (prevFreeze !== undefined) process.env.MONEY_PATH_FROZEN = prevFreeze;
    else delete process.env.MONEY_PATH_FROZEN;
    if (prevProvider !== undefined) process.env.PAYOUT_PROVIDER = prevProvider;
    else delete process.env.PAYOUT_PROVIDER;
  });

  it('1. submit success', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const intent = await reserve(sb);
    const r = await executeProviderSubmit(sb, {
      intentId: intent.id,
      provider: createSandboxPayoutProvider({
        submit: 'immediate_success',
        providerReference: REF,
      }),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.intentResult.intent.status).toBe('SUCCEEDED');
    expect(store.rewards.get(REWARD)?.status).toBe('PAID');
  });

  it('2. submit initiated — not PAID', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const intent = await reserve(sb);
    const r = await executeProviderSubmit(sb, {
      intentId: intent.id,
      provider: createSandboxPayoutProvider({ submit: 'initiated', providerReference: REF }),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.intentResult.intent.status).toBe('SUBMITTED');
    expect(r.normalized.status).toBe('initiated');
    expect(store.rewards.get(REWARD)?.status).toBe('AVAILABLE');
  });

  it('3. submit failure', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const intent = await reserve(sb);
    const r = await executeProviderSubmit(sb, {
      intentId: intent.id,
      provider: createSandboxPayoutProvider({ submit: 'failure', providerReference: REF }),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.intentResult.intent.status).toBe('FAILED');
    expect(store.rewards.get(REWARD)?.status).toBe('AVAILABLE');
  });

  it('4-5. submit timeout/unknown → UNKNOWN', async () => {
    for (const submit of ['timeout', 'unknown'] as const) {
      const store = createStore(
        eligibleReward({
          id: submit === 'timeout' ? REWARD : 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          ledger_entry_id:
            submit === 'timeout' ? LEDGER : 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        }),
      );
      const sb = makeClient(store);
      const rewardId =
        submit === 'timeout' ? REWARD : 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
      const reserved = await reservePayoutIntent(sb, { rewardId });
      if (!reserved.ok) throw new Error(reserved.reason);
      const r = await executeProviderSubmit(sb, {
        intentId: reserved.intent.id,
        provider: createSandboxPayoutProvider({ submit, providerReference: REF }),
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.intentResult.intent.status).toBe('UNKNOWN');
      expect(store.rewards.get(rewardId)?.status).toBe('AVAILABLE');
    }
  });

  it('6. UNKNOWN reconciliation success → PAID', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const intent = await reserve(sb);
    await executeProviderSubmit(sb, {
      intentId: intent.id,
      provider: createSandboxPayoutProvider({
        submit: 'timeout',
        reconcile: 'success',
        providerReference: REF,
      }),
    });
    const rec = await executeProviderReconcile(sb, {
      intentId: intent.id,
      provider: createSandboxPayoutProvider({
        submit: 'timeout',
        reconcile: 'success',
        providerReference: REF,
      }),
    });
    expect(rec.ok).toBe(true);
    if (!rec.ok) return;
    expect(rec.intentResult.intent.status).toBe('SUCCEEDED');
    expect(store.rewards.get(REWARD)?.status).toBe('PAID');
  });

  it('7. UNKNOWN reconciliation failure', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const intent = await reserve(sb);
    await executeProviderSubmit(sb, {
      intentId: intent.id,
      provider: createSandboxPayoutProvider({
        submit: 'timeout',
        reconcile: 'failure',
        providerReference: REF,
      }),
    });
    const rec = await executeProviderReconcile(sb, {
      intentId: intent.id,
      provider: createSandboxPayoutProvider({
        submit: 'timeout',
        reconcile: 'failure',
        providerReference: REF,
      }),
    });
    expect(rec.ok).toBe(true);
    if (!rec.ok) return;
    expect(rec.intentResult.intent.status).toBe('FAILED');
  });

  it('8. UNKNOWN reconciliation still UNKNOWN', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const intent = await reserve(sb);
    await executeProviderSubmit(sb, {
      intentId: intent.id,
      provider: createSandboxPayoutProvider({
        submit: 'timeout',
        reconcile: 'unknown',
        providerReference: REF,
      }),
    });
    const rec = await executeProviderReconcile(sb, {
      intentId: intent.id,
      provider: createSandboxPayoutProvider({
        submit: 'timeout',
        reconcile: 'unknown',
        providerReference: REF,
      }),
    });
    expect(rec.ok).toBe(true);
    if (!rec.ok) return;
    expect(rec.intentResult.intent.status).toBe('UNKNOWN');
    expect(store.rewards.get(REWARD)?.status).toBe('AVAILABLE');
  });

  it('9. same idempotency key replay', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const a = await reservePayoutIntent(sb, { rewardId: REWARD });
    const b = await reservePayoutIntent(sb, { rewardId: REWARD });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.intent.idempotency_key).toBe(b.intent.idempotency_key);
    expect(store.intents.size).toBe(1);
  });

  it('10. concurrent submit → one economic effect', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const intent = await reserve(sb);
    const provider = createSandboxPayoutProvider({
      submit: 'immediate_success',
      providerReference: REF,
    });
    await Promise.all([
      executeProviderSubmit(sb, { intentId: intent.id, provider }),
      executeProviderSubmit(sb, { intentId: intent.id, provider }),
      executeProviderSubmit(sb, { intentId: intent.id, provider }),
    ]);
    expect(store.intents.size).toBe(1);
    expect(store.rewards.get(REWARD)?.status).toBe('PAID');
  });

  it('11. duplicate provider callback', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const intent = await reserve(sb);
    await executeProviderSubmit(sb, {
      intentId: intent.id,
      provider: createSandboxPayoutProvider({ submit: 'initiated', providerReference: REF }),
    });
    const ev = {
      intentId: intent.id,
      rewardId: REWARD,
      amountCents: REWARDS_MIN_PAYOUT_CENTS,
      currency: 'MXN',
      idempotencyKey: intent.idempotency_key,
      provider: 'sandbox',
      providerReference: REF,
      outcome: 'confirmed_success' as const,
    };
    const a = await applyProviderConfirmation(sb, ev);
    const b = await applyProviderConfirmation(sb, ev);
    expect(a.ok && b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.reused).toBe(true);
  });

  it('12-15. mismatches rejected via confirmation evidence', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const intent = await reserve(sb);
    await executeProviderSubmit(sb, {
      intentId: intent.id,
      provider: createSandboxPayoutProvider({ submit: 'initiated', providerReference: REF }),
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
    expect((await applyProviderConfirmation(sb, { ...base, providerReference: 'OTHER' })).ok).toBe(
      false,
    );
    expect(
      (await applyProviderConfirmation(sb, { ...base, amountCents: REWARDS_MIN_PAYOUT_CENTS + 1 }))
        .ok,
    ).toBe(false);
    expect((await applyProviderConfirmation(sb, { ...base, currency: 'USD' })).ok).toBe(false);
    expect(
      (await applyProviderConfirmation(sb, { ...base, idempotencyKey: 'payout_intent:x:v1' })).ok,
    ).toBe(false);
  });

  it('16-17. provider unavailable/malformed → UNKNOWN not PAID', async () => {
    for (const submit of ['unavailable', 'malformed'] as const) {
      const store = createStore(
        eligibleReward({
          id: submit === 'unavailable' ? REWARD : 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          ledger_entry_id:
            submit === 'unavailable' ? LEDGER : 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        }),
      );
      const sb = makeClient(store);
      const rewardId =
        submit === 'unavailable' ? REWARD : 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
      const reserved = await reservePayoutIntent(sb, { rewardId });
      if (!reserved.ok) throw new Error(reserved.reason);
      const r = await executeProviderSubmit(sb, {
        intentId: reserved.intent.id,
        provider: createSandboxPayoutProvider({ submit, providerReference: REF }),
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.intentResult.intent.status).toBe('UNKNOWN');
      expect(store.rewards.get(rewardId)?.status).toBe('AVAILABLE');
    }
  });

  it('19-21. provider source cannot mutate DB; only confirmation pays', async () => {
    expect(PROVIDER_ADAPTER_MUST_NOT_MUTATE_DB).toBe(true);
    const sandboxSrc = readFileSync(
      join(process.cwd(), 'lib/rewards/payoutIntent/sandboxProvider.ts'),
      'utf8',
    );
    expect(sandboxSrc).not.toMatch(/from\(['"]creator_rewards['"]\)/);
    expect(sandboxSrc).not.toMatch(/from\(['"]payout_intents['"]\)/);
    expect(sandboxSrc).not.toMatch(/from\(['"]affiliate_ledger/);
    expect(sandboxSrc).not.toMatch(/SupabaseClient/);

    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const intent = await reserve(sb);
    // Provider alone (direct call) does not pay
    const provider = createSandboxPayoutProvider({
      submit: 'immediate_success',
      providerReference: REF,
    });
    const raw = await provider.submit(intent);
    expect(raw.outcome).toBe('success');
    expect(store.rewards.get(REWARD)?.status).toBe('AVAILABLE');

    // Engine path pays via applyProviderConfirmation
    await executeProviderSubmit(sb, { intentId: intent.id, provider });
    expect(store.rewards.get(REWARD)?.status).toBe('PAID');
    expect(store.ledgerWrites).toBe(0);
  });

  it('22. reward_payouts untouched', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const intent = await reserve(sb);
    await executeProviderSubmit(sb, {
      intentId: intent.id,
      provider: createSandboxPayoutProvider({
        submit: 'immediate_success',
        providerReference: REF,
      }),
    });
    expect(store.rewardPayouts.length).toBe(0);
  });

  it('normalize: initiated never yields confirmation evidence', () => {
    const intent = {
      id: 'a',
      reward_id: REWARD,
      creator_id: CREATOR,
      amount_cents: 20000,
      currency: 'MXN',
      status: 'SUBMITTED' as const,
      idempotency_key: 'payout_intent:x:v1',
      provider: 'sandbox',
      meta: {},
      reserved_at: '',
      submitted_at: null,
      resolved_at: null,
      created_at: '',
      updated_at: '',
    };
    const n = normalizeSubmitResult(intent, 'sandbox', {
      outcome: 'initiated',
      externalRef: REF,
    });
    expect(n.status).toBe('initiated');
    expect(normalizedToConfirmationEvidence(n, intent)).toBeNull();
  });
});
