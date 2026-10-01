import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { confirmPayoutIntentSuccess } from '@/lib/rewards/payoutIntent/engine';

const REWARD = '11111111-1111-4111-8111-111111111111';
const INTENT = '22222222-2222-4222-8222-222222222222';

type IntentRow = {
  id: string;
  reward_id: string;
  creator_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  idempotency_key: string;
  provider: string;
  meta: Record<string, unknown>;
  reserved_at: string;
  submitted_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

type RewardRow = { id: string; status: string; meta: Record<string, unknown> };

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue;
      out.push(...filesUnder(full));
    } else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

function makeClient(input: {
  reward: RewardRow | null;
  intent: IntentRow | null;
  failAuditWrites?: number;
  failAuditReads?: boolean;
}) {
  const audits: Array<Record<string, unknown>> = [];
  let paidTransitions = 0;
  let failAuditWrites = input.failAuditWrites ?? 0;
  const state = {
    reward: input.reward ? { ...input.reward, meta: { ...input.reward.meta } } : null,
    intent: input.intent ? { ...input.intent, meta: { ...input.intent.meta } } : null,
  };

  const from = (table: string) => {
    if (table === 'reward_audit_log') {
      const filters: Record<string, unknown> = {};
      const api = {
        insert: (payload: Record<string, unknown>) => {
          if (failAuditWrites > 0) {
            failAuditWrites -= 1;
            return Promise.resolve({ error: { message: 'audit down' } });
          }
          audits.push(payload);
          return Promise.resolve({ error: null });
        },
        select: () => api,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return api;
        },
        limit: () => api,
        maybeSingle: async () => {
          if (input.failAuditReads) return { data: null, error: { message: 'audit read down' } };
          const found = audits.find(
            (row) =>
              row.entity_type === filters.entity_type &&
              row.entity_id === filters.entity_id &&
              row.event_type === filters.event_type,
          );
          return { data: found ? { id: 'audit-row' } : null, error: null };
        },
      };
      return api;
    }

    const filters = {
      eq: {} as Record<string, unknown>,
      in: {} as Record<string, unknown[]>,
      op: 'select' as 'select' | 'update',
      updatePayload: null as Record<string, unknown> | null,
    };
    const resolve = async () => {
      if (table === 'creator_rewards') {
        if (!state.reward || filters.eq.id !== state.reward.id) return { data: null, error: null };
        if (filters.op === 'update' && filters.updatePayload) {
          if (filters.eq.status && state.reward.status !== filters.eq.status) {
            return { data: null, error: null };
          }
          if (filters.updatePayload.status === 'PAID' && state.reward.status !== 'PAID') {
            paidTransitions += 1;
          }
          state.reward = { ...state.reward, ...filters.updatePayload, id: state.reward.id };
          return { data: { id: state.reward.id, status: state.reward.status }, error: null };
        }
        return { data: state.reward, error: null };
      }
      if (table === 'payout_intents') {
        if (!state.intent || filters.eq.id !== state.intent.id) return { data: null, error: null };
        if (filters.op === 'update' && filters.updatePayload) {
          const allowed = filters.in.status;
          if (allowed && !allowed.includes(state.intent.status)) return { data: null, error: null };
          state.intent = { ...state.intent, ...filters.updatePayload };
          return { data: state.intent, error: null };
        }
        return { data: state.intent, error: null };
      }
      return { data: null, error: { message: `unexpected ${table}` } };
    };
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    for (const method of ['select', 'limit']) builder[method] = chain;
    builder.update = (payload: Record<string, unknown>) => {
      filters.op = 'update';
      filters.updatePayload = payload;
      return builder;
    };
    builder.eq = (column: string, value: unknown) => {
      filters.eq[column] = value;
      return builder;
    };
    builder.in = (column: string, value: unknown[]) => {
      filters.in[column] = value;
      return builder;
    };
    builder.maybeSingle = () => resolve();
    return builder;
  };

  return {
    client: { from: vi.fn(from), rpc: vi.fn() } as unknown as SupabaseClient,
    audits,
    state,
    paidTransitions: () => paidTransitions,
  };
}

function submittedIntent(status = 'SUBMITTED'): IntentRow {
  return {
    id: INTENT,
    reward_id: REWARD,
    creator_id: 'creator-1',
    amount_cents: 20000,
    currency: 'MXN',
    status,
    idempotency_key: `payout_intent:${REWARD}:v1`,
    provider: 'stub',
    meta: {},
    reserved_at: '2026-09-01T00:00:00.000Z',
    submitted_at: '2026-09-01T00:00:00.000Z',
    resolved_at: null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
  };
}

describe('payout authority closure', () => {
  const prevFreeze = process.env.MONEY_PATH_FROZEN;

  beforeEach(() => {
    process.env.MONEY_PATH_FROZEN = 'false';
  });

  afterEach(() => {
    if (prevFreeze === undefined) delete process.env.MONEY_PATH_FROZEN;
    else process.env.MONEY_PATH_FROZEN = prevFreeze;
  });

  it('un solo payout deja el reward PAID, el intent SUCCEEDED y las dos auditorías', async () => {
    const harness = makeClient({
      reward: { id: REWARD, status: 'AVAILABLE', meta: {} },
      intent: submittedIntent(),
    });
    const result = await confirmPayoutIntentSuccess(harness.client, { intentId: INTENT });
    expect(result.ok).toBe(true);
    expect(harness.state.reward?.status).toBe('PAID');
    expect(harness.state.intent?.status).toBe('SUCCEEDED');
    expect(harness.paidTransitions()).toBe(1);
    expect(harness.audits.map((row) => row.event_type)).toEqual([
      'payout_intent_succeeded',
      'reward_paid',
    ]);
    expect(harness.client.rpc).not.toHaveBeenCalled();
  });

  it('el reintento certifica el mismo movimiento y no crea otro PAID', async () => {
    const harness = makeClient({
      reward: { id: REWARD, status: 'AVAILABLE', meta: {} },
      intent: submittedIntent(),
    });
    const first = await confirmPayoutIntentSuccess(harness.client, { intentId: INTENT });
    const second = await confirmPayoutIntentSuccess(harness.client, { intentId: INTENT });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.reused).toBe(true);
    expect(harness.paidTransitions()).toBe(1);
    expect(harness.audits).toHaveLength(2);
  });

  it('confirmaciones concurrentes convergen en un PAID', async () => {
    const harness = makeClient({
      reward: { id: REWARD, status: 'AVAILABLE', meta: {} },
      intent: submittedIntent(),
    });
    const results = await Promise.all([
      confirmPayoutIntentSuccess(harness.client, { intentId: INTENT, externalRef: 'a' }),
      confirmPayoutIntentSuccess(harness.client, { intentId: INTENT, externalRef: 'b' }),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(harness.paidTransitions()).toBe(1);
    expect(harness.state.intent?.status).toBe('SUCCEEDED');
  });

  it('si el CAS del reward pierde y sigue sin estar PAID, no reintenta a ciegas', async () => {
    const harness = makeClient({
      reward: { id: REWARD, status: 'VALIDATING', meta: {} },
      intent: submittedIntent(),
    });
    const result = await confirmPayoutIntentSuccess(harness.client, { intentId: INTENT });
    expect(result).toMatchObject({ ok: false, reason: 'reward_not_available' });
    expect(harness.paidTransitions()).toBe(0);
    expect(harness.state.intent?.status).toBe('SUBMITTED');
    expect(harness.audits).toHaveLength(0);
  });

  it('si la auditoría falla después de PAID, conserva el estado y el reintento solo certifica', async () => {
    const harness = makeClient({
      reward: { id: REWARD, status: 'AVAILABLE', meta: {} },
      intent: submittedIntent(),
      failAuditWrites: 1,
    });
    const failed = await confirmPayoutIntentSuccess(harness.client, { intentId: INTENT });
    expect(failed).toMatchObject({ ok: false, reason: 'audit_append_failed' });
    expect(harness.state.reward?.status).toBe('PAID');
    expect(harness.state.intent?.status).toBe('SUCCEEDED');
    expect(harness.paidTransitions()).toBe(1);
    expect(harness.audits).toHaveLength(0);

    const recovered = await confirmPayoutIntentSuccess(harness.client, { intentId: INTENT });
    expect(recovered.ok).toBe(true);
    expect(harness.paidTransitions()).toBe(1);
    expect(harness.audits.map((row) => row.event_type)).toEqual([
      'payout_intent_succeeded',
      'reward_paid',
    ]);
  });

  it('MONEY_PATH_FROZEN bloquea un PAID nuevo y permite certificar uno ya escrito', async () => {
    process.env.MONEY_PATH_FROZEN = 'true';
    const blocked = makeClient({
      reward: { id: REWARD, status: 'AVAILABLE', meta: {} },
      intent: submittedIntent(),
    });
    const frozen = await confirmPayoutIntentSuccess(blocked.client, { intentId: INTENT });
    expect(frozen).toMatchObject({ ok: false, reason: 'money_path_frozen' });
    expect(blocked.paidTransitions()).toBe(0);
    expect(blocked.state.reward?.status).toBe('AVAILABLE');

    const recovering = makeClient({
      reward: { id: REWARD, status: 'PAID', meta: {} },
      intent: submittedIntent('SUCCEEDED'),
    });
    const certified = await confirmPayoutIntentSuccess(recovering.client, { intentId: INTENT });
    expect(certified.ok).toBe(true);
    expect(recovering.paidTransitions()).toBe(0);
    expect(recovering.audits.map((row) => row.event_type)).toEqual([
      'payout_intent_succeeded',
      'reward_paid',
    ]);
  });

  it('CANCELLED y REVERSED no pasan a PAID', async () => {
    for (const status of ['CANCELLED', 'REVERSED']) {
      const harness = makeClient({
        reward: { id: REWARD, status, meta: {} },
        intent: submittedIntent(),
      });
      const result = await confirmPayoutIntentSuccess(harness.client, { intentId: INTENT });
      expect(result).toMatchObject({ ok: false, reason: 'reward_terminal' });
      expect(harness.state.reward?.status).toBe(status);
      expect(harness.state.intent?.status).toBe('SUBMITTED');
    }
  });

  it('un intent ya SUCCEEDED no marca PAID un reward que sigue AVAILABLE', async () => {
    const harness = makeClient({
      reward: { id: REWARD, status: 'AVAILABLE', meta: {} },
      intent: submittedIntent('SUCCEEDED'),
    });
    const result = await confirmPayoutIntentSuccess(harness.client, { intentId: INTENT });
    expect(result).toMatchObject({ ok: false, reason: 'update_failed' });
    expect(harness.paidTransitions()).toBe(0);
    expect(harness.state.reward?.status).toBe('AVAILABLE');
  });

  it('después de PAID y antes de cerrar el intent, el reintento cierra el mismo movimiento', async () => {
    const harness = makeClient({
      reward: { id: REWARD, status: 'PAID', meta: {} },
      intent: submittedIntent('SUBMITTED'),
    });
    const result = await confirmPayoutIntentSuccess(harness.client, { intentId: INTENT });
    expect(result.ok).toBe(true);
    expect(harness.paidTransitions()).toBe(0);
    expect(harness.state.intent?.status).toBe('SUCCEEDED');
    expect(harness.audits).toHaveLength(2);
  });

  it('reward ausente no crea payout', async () => {
    const harness = makeClient({ reward: null, intent: submittedIntent() });
    const result = await confirmPayoutIntentSuccess(harness.client, { intentId: INTENT });
    expect(result).toMatchObject({ ok: false, reason: 'reward_not_found' });
    expect(harness.audits).toHaveLength(0);
  });

  it('la app no tiene otro escritor de PAID ni llama al RPC legado', () => {
    const root = process.cwd();
    const paidWriters: string[] = [];
    const rpcCallers: string[] = [];
    for (const file of [...filesUnder(join(root, 'app')), ...filesUnder(join(root, 'lib'))]) {
      const text = readFileSync(file, 'utf8');
      const rel = relative(root, file).replaceAll('\\', '/');
      if (text.includes("status: 'PAID'") || text.includes('status: "PAID"')) paidWriters.push(rel);
      if (text.includes(".rpc('execute_reward_payout'") || text.includes('.rpc("execute_reward_payout"')) {
        rpcCallers.push(rel);
      }
    }
    expect(paidWriters).toEqual(['lib/rewards/payoutIntent/engine.ts']);
    expect(rpcCallers).toEqual([]);
    const payout = readFileSync(join(root, 'lib/rewards/payout.ts'), 'utf8');
    expect(payout).toContain('writeHistoricalPayoutRow === true');
    expect(payout).not.toContain("status: 'PAID'");
  });
});
