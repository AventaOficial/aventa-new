/**
 * M4.6 — Real provider adapter boundary tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { REWARDS_MIN_PAYOUT_CENTS } from '@/lib/rewards/config';
import {
  reservePayoutIntent,
  applyProviderConfirmation,
  reconcilePayoutIntent,
  submitPayoutIntent,
  createSandboxPayoutProvider,
  resolvePayoutProvider,
  createRealPayoutProvider,
  loadRealProviderConfig,
  processProviderWebhook,
  signProviderWebhookPayload,
  PROVIDER_WEBHOOK_SIGNATURE_HEADER,
  PROVIDER_ADAPTER_MUST_NOT_MUTATE_DB,
  PAYOUT_INTENT_PROVIDER_REAL,
  PAYOUT_INTENT_LEGACY_RPC_FORBIDDEN,
  type RealProviderTransport,
  type PayoutIntentRow,
} from '@/lib/rewards/payoutIntent';

const CREATOR = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const REWARD = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const LEDGER = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const REF = 'real:M46-STABLE-REF';
const WEBHOOK_SECRET = 'test-webhook-secret-m46-not-real';

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
  submitCalls: number;
  reconcileCalls: number;
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
    submitCalls: 0,
    reconcileCalls: 0,
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
    for (const m of ['select', 'gte', 'order', 'limit']) {
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

function stagingEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    VERCEL_ENV: 'preview',
    ...extra,
  };
}

function realCredEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return stagingEnv({
    PAYOUT_PROVIDER: 'real',
    PAYOUT_PROVIDER_API_URL: 'https://provider.example.test',
    PAYOUT_PROVIDER_API_KEY: 'test-api-key-not-production',
    PAYOUT_PROVIDER_WEBHOOK_SECRET: WEBHOOK_SECRET,
    ...extra,
  });
}

function transportEmulator(opts: {
  submitStatus?: number;
  submitBody?: unknown;
  submitUncertain?: boolean;
  reconcileStatus?: number;
  reconcileBody?: unknown;
  reconcileUncertain?: boolean;
  store?: Store;
}): RealProviderTransport {
  return {
    async submit() {
      if (opts.store) opts.store.submitCalls += 1;
      return {
        ok: (opts.submitStatus ?? 200) < 400,
        status: opts.submitStatus ?? 200,
        body: opts.submitBody ?? { status: 'initiated', provider_reference: REF },
        uncertain: opts.submitUncertain,
      };
    },
    async reconcile() {
      if (opts.store) opts.store.reconcileCalls += 1;
      return {
        ok: (opts.reconcileStatus ?? 200) < 400,
        status: opts.reconcileStatus ?? 200,
        body: opts.reconcileBody ?? { status: 'success', provider_reference: REF },
        uncertain: opts.reconcileUncertain,
      };
    },
  };
}

describe('M4.6 resolvePayoutProvider real boundary', () => {
  it('1. real provider missing credentials → fail closed', () => {
    const r = resolvePayoutProvider(
      stagingEnv({ PAYOUT_PROVIDER: 'real', PAYOUT_PROVIDER_API_URL: 'https://x.test' }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('credentials_missing');
  });

  it('2. real never silently falls back to sandbox/stub', () => {
    const missing = resolvePayoutProvider(stagingEnv({ PAYOUT_PROVIDER: 'real' }));
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(['credentials_missing', 'api_url_missing']).toContain(missing.reason);
    }
    const partial = resolvePayoutProvider(
      stagingEnv({
        PAYOUT_PROVIDER: 'real',
        PAYOUT_PROVIDER_API_KEY: 'k',
      }),
    );
    expect(partial.ok).toBe(false);
  });

  it('19. production provider selection remains blocked', () => {
    const r = resolvePayoutProvider({
      ...realCredEnv(),
      NODE_ENV: 'production',
      VERCEL_ENV: 'production',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('provider_forbidden_in_production');
  });

  it('20. sandbox/stub behavior remains intact', () => {
    const s = resolvePayoutProvider(stagingEnv({ PAYOUT_PROVIDER: 'sandbox' }), {
      submit: 'initiated',
      providerReference: REF,
    });
    expect(s.ok).toBe(true);
    if (s.ok) expect(s.providerId).toBe('sandbox');
    const t = resolvePayoutProvider(stagingEnv({ PAYOUT_PROVIDER: 'stub' }));
    expect(t.ok).toBe(true);
  });
});

describe('M4.6 real adapter submit/reconcile', () => {
  const prevFreeze = process.env.MONEY_PATH_FROZEN;
  beforeEach(() => {
    process.env.MONEY_PATH_FROZEN = 'false';
  });
  afterEach(() => {
    if (prevFreeze !== undefined) process.env.MONEY_PATH_FROZEN = prevFreeze;
    else delete process.env.MONEY_PATH_FROZEN;
  });

  it('3. submit success', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const reserved = await reservePayoutIntent(sb, { rewardId: REWARD });
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const cfg = loadRealProviderConfig(realCredEnv());
    expect(cfg.ok).toBe(true);
    if (!cfg.ok) return;
    const provider = createRealPayoutProvider(
      cfg.config,
      transportEmulator({
        submitBody: { status: 'success', provider_reference: REF },
        store,
      }),
    );
    const r = await submitPayoutIntent(sb, { intentId: reserved.intent.id, provider });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.intent.status).toBe('SUCCEEDED');
    expect(store.rewards.get(REWARD)?.status).toBe('PAID');
  });

  it('4. submit timeout → UNKNOWN', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const reserved = await reservePayoutIntent(sb, { rewardId: REWARD });
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const cfg = loadRealProviderConfig(realCredEnv());
    if (!cfg.ok) throw new Error('cfg');
    const provider = createRealPayoutProvider(
      cfg.config,
      transportEmulator({ submitUncertain: true, store }),
    );
    const r = await submitPayoutIntent(sb, { intentId: reserved.intent.id, provider });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.intent.status).toBe('UNKNOWN');
    expect(store.rewards.get(REWARD)?.status).toBe('AVAILABLE');
  });

  it('5. submit network uncertainty → UNKNOWN', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const reserved = await reservePayoutIntent(sb, { rewardId: REWARD });
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const cfg = loadRealProviderConfig(realCredEnv());
    if (!cfg.ok) throw new Error('cfg');
    const provider = createRealPayoutProvider(
      cfg.config,
      transportEmulator({ submitStatus: 503, submitUncertain: true, store }),
    );
    const r = await submitPayoutIntent(sb, { intentId: reserved.intent.id, provider });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.intent.status).toBe('UNKNOWN');
  });

  it('6/7/8. reconcile SUCCESS / FAILURE / UNKNOWN', async () => {
    for (const [body, expected] of [
      [{ status: 'success', provider_reference: REF }, 'SUCCEEDED'],
      [{ status: 'failure', provider_reference: REF }, 'FAILED'],
      [{ status: 'pending', provider_reference: REF }, 'UNKNOWN'],
    ] as const) {
      const rewardId = uuid();
      const store = createStore(eligibleReward({ id: rewardId }));
      const sb = makeClient(store);
      const reserved = await reservePayoutIntent(sb, { rewardId });
      expect(reserved.ok).toBe(true);
      if (!reserved.ok) continue;
      const cfg = loadRealProviderConfig(realCredEnv());
      if (!cfg.ok) throw new Error('cfg');
      const provider = createRealPayoutProvider(
        cfg.config,
        transportEmulator({
          submitUncertain: true,
          reconcileBody: body,
          store,
        }),
      );
      await submitPayoutIntent(sb, { intentId: reserved.intent.id, provider });
      const rec = await reconcilePayoutIntent(sb, {
        intentId: reserved.intent.id,
        provider,
      });
      expect(rec.ok).toBe(true);
      if (rec.ok) expect(rec.intent.status).toBe(expected);
    }
  });

  it('16. UNKNOWN reconciliation does not submit again', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const reserved = await reservePayoutIntent(sb, { rewardId: REWARD });
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const cfg = loadRealProviderConfig(realCredEnv());
    if (!cfg.ok) throw new Error('cfg');
    const provider = createRealPayoutProvider(
      cfg.config,
      transportEmulator({
        submitUncertain: true,
        reconcileBody: { status: 'pending' },
        store,
      }),
    );
    await submitPayoutIntent(sb, { intentId: reserved.intent.id, provider });
    const submitsAfterUnknown = store.submitCalls;
    await reconcilePayoutIntent(sb, { intentId: reserved.intent.id, provider });
    expect(store.submitCalls).toBe(submitsAfterUnknown);
    expect(store.reconcileCalls).toBeGreaterThan(0);
  });

  it('17. stable idempotency key across retry/reconcile', async () => {
    const store = createStore(eligibleReward());
    const sb = makeClient(store);
    const reserved = await reservePayoutIntent(sb, { rewardId: REWARD });
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const key = reserved.intent.idempotency_key;
    let seenKey: string | null = null;
    const cfg = loadRealProviderConfig(realCredEnv());
    if (!cfg.ok) throw new Error('cfg');
    const provider = createRealPayoutProvider(cfg.config, {
      async submit(req) {
        store.submitCalls += 1;
        seenKey = req.headers['Idempotency-Key'] ?? null;
        expect(req.body.idempotency_key).toBe(key);
        return { ok: false, status: 0, body: null, uncertain: true };
      },
      async reconcile(req) {
        store.reconcileCalls += 1;
        expect(req.query.idempotency_key).toBe(key);
        expect(req.headers['Idempotency-Key']).toBe(key);
        return {
          ok: true,
          status: 200,
          body: { status: 'success', provider_reference: REF },
        };
      },
    });
    await submitPayoutIntent(sb, { intentId: reserved.intent.id, provider });
    expect(seenKey).toBe(key);
    const rec = await reconcilePayoutIntent(sb, {
      intentId: reserved.intent.id,
      provider,
    });
    expect(rec.ok).toBe(true);
    if (rec.ok) expect(rec.intent.idempotency_key).toBe(key);
  });
});

describe('M4.6 webhook boundary', () => {
  const prevFreeze = process.env.MONEY_PATH_FROZEN;
  beforeEach(() => {
    process.env.MONEY_PATH_FROZEN = 'false';
  });
  afterEach(() => {
    if (prevFreeze !== undefined) process.env.MONEY_PATH_FROZEN = prevFreeze;
    else delete process.env.MONEY_PATH_FROZEN;
  });

  async function seedSubmitted(store: Store, rewardId = REWARD): Promise<PayoutIntentRow> {
    const sb = makeClient(store);
    const reserved = await reservePayoutIntent(sb, { rewardId });
    if (!reserved.ok) throw new Error(reserved.reason);
    const sub = await submitPayoutIntent(sb, {
      intentId: reserved.intent.id,
      provider: {
        ...createSandboxPayoutProvider({ submit: 'initiated', providerReference: REF }),
        id: PAYOUT_INTENT_PROVIDER_REAL,
      },
    });
    if (!sub.ok) throw new Error(sub.reason);
    return sub.intent;
  }

  function bodyFor(intent: PayoutIntentRow, overrides: Record<string, unknown> = {}) {
    return JSON.stringify({
      intent_id: intent.id,
      reward_id: intent.reward_id,
      amount_cents: intent.amount_cents,
      currency: intent.currency,
      idempotency_key: intent.idempotency_key,
      provider_reference: REF,
      provider: PAYOUT_INTENT_PROVIDER_REAL,
      status: 'success',
      ...overrides,
    });
  }

  it('9. duplicate webhook → ALREADY_APPLIED', async () => {
    const store = createStore(eligibleReward());
    const intent = await seedSubmitted(store);
    const sb = makeClient(store);
    const raw = bodyFor(intent);
    const headers = {
      [PROVIDER_WEBHOOK_SIGNATURE_HEADER]: signProviderWebhookPayload(raw, WEBHOOK_SECRET),
    };
    const env = realCredEnv();
    const first = await processProviderWebhook(sb, { rawBody: raw, headers, env });
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.code).toBe('SUCCESS');
    const second = await processProviderWebhook(sb, { rawBody: raw, headers, env });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.code).toBe('ALREADY_APPLIED');
    expect(store.rewardPayouts.length).toBe(0);
    expect(store.intents.size).toBe(1);
  });

  it('10. invalid webhook signature → reject', async () => {
    const store = createStore(eligibleReward());
    const intent = await seedSubmitted(store);
    const sb = makeClient(store);
    const raw = bodyFor(intent);
    const r = await processProviderWebhook(sb, {
      rawBody: raw,
      headers: { [PROVIDER_WEBHOOK_SIGNATURE_HEADER]: 'deadbeef' },
      env: realCredEnv(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('UNAUTHORIZED');
      expect(r.reason).toBe('invalid_signature');
    }
    expect(store.rewards.get(REWARD)?.status).toBe('AVAILABLE');
  });

  it('11/12/13/14. mismatches reject', async () => {
    const cases = [
      { amount_cents: REWARDS_MIN_PAYOUT_CENTS + 1, reason: 'amount_mismatch' },
      { currency: 'USD', reason: 'currency_mismatch' },
      { provider_reference: 'WRONG-REF', reason: 'provider_reference_mismatch' },
      { idempotency_key: 'wrong-key', reason: 'idempotency_key_mismatch' },
    ] as const;
    for (const c of cases) {
      const rewardId = uuid();
      const store = createStore(eligibleReward({ id: rewardId }));
      const intent = await seedSubmitted(store, rewardId);
      const sb = makeClient(store);
      const raw = bodyFor(intent, c);
      const r = await processProviderWebhook(sb, {
        rawBody: raw,
        headers: {
          [PROVIDER_WEBHOOK_SIGNATURE_HEADER]: signProviderWebhookPayload(raw, WEBHOOK_SECRET),
        },
        env: realCredEnv(),
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe(c.reason);
    }
  });

  it('15. concurrent confirmation', async () => {
    const store = createStore(eligibleReward());
    const intent = await seedSubmitted(store);
    const sb = makeClient(store);
    const raw = bodyFor(intent);
    const headers = {
      [PROVIDER_WEBHOOK_SIGNATURE_HEADER]: signProviderWebhookPayload(raw, WEBHOOK_SECRET),
    };
    const env = realCredEnv();
    const results = await Promise.all([
      processProviderWebhook(sb, { rawBody: raw, headers, env }),
      processProviderWebhook(sb, { rawBody: raw, headers, env }),
      applyProviderConfirmation(sb, {
        intentId: intent.id,
        rewardId: intent.reward_id,
        amountCents: intent.amount_cents,
        currency: intent.currency,
        idempotencyKey: intent.idempotency_key,
        provider: PAYOUT_INTENT_PROVIDER_REAL,
        providerReference: REF,
        outcome: 'confirmed_success',
      }),
    ]);
    const ok = results.filter((r) => r.ok);
    expect(ok.length).toBe(3);
    expect(store.rewards.get(REWARD)?.status).toBe('PAID');
    expect(store.intents.size).toBe(1);
  });
});

describe('M4.6 security boundary', () => {
  it('18. provider credentials never exposed to client code', () => {
    expect(PROVIDER_ADAPTER_MUST_NOT_MUTATE_DB).toBe(true);
    const cfg = loadRealProviderConfig(realCredEnv());
    expect(cfg.ok).toBe(true);
    if (!cfg.ok) return;
    const provider = createRealPayoutProvider(cfg.config, transportEmulator({}));
    const json = JSON.stringify(provider.config);
    expect(json).not.toContain('test-api-key');
    expect(json).not.toContain(WEBHOOK_SECRET);
    expect(provider.config).not.toHaveProperty('apiKey');
    expect(provider.config).not.toHaveProperty('webhookSecret');

    const route = readFileSync(
      join(process.cwd(), 'app/api/webhooks/payouts/provider/route.ts'),
      'utf8',
    );
    expect(route).toContain("runtime = 'nodejs'");
    expect(route).not.toContain('PAYOUT_PROVIDER_API_KEY');
    expect(route).toContain('processProviderWebhook');
  });
});
