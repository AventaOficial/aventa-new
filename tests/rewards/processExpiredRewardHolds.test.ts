/**
 * M5.3 — processExpiredRewardHolds contract matrix.
 * Authority: VALIDATING → AVAILABLE only via CAS (status + hold_until).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { processExpiredRewardHolds } from '../../lib/rewards/rewardsEngine';

type RewardState = {
  id: string;
  status: string;
  hold_until: string;
  available_at?: string | null;
};

function createHoldTestSupabase(initial: RewardState[]) {
  const store = initial.map((r) => ({ ...r }));
  const audits: Array<Record<string, unknown>> = [];

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'reward_audit_log') {
        return {
          insert: vi.fn(async (payload: Record<string, unknown>) => {
            audits.push(payload);
            return { error: null };
          }),
        };
      }
      if (table === 'payout_intents' || table === 'reward_payouts') {
        throw new Error(`${table} must not be touched by hold engine`);
      }
      if (table !== 'creator_rewards') return {};

      const ctx: {
        mode: 'select' | 'update';
        id?: string;
        statusFilters: string[];
        holdLte?: string;
        updatePayload?: Record<string, unknown>;
        limitN?: number;
      } = { mode: 'select', statusFilters: [] };

      const resolveSelect = () => {
        let data = store
          .filter((r) =>
            ctx.statusFilters.length ? ctx.statusFilters.every((s) => r.status === s) : true,
          )
          .filter((r) => (ctx.holdLte ? r.hold_until <= ctx.holdLte : true))
          .sort((a, b) => a.hold_until.localeCompare(b.hold_until))
          .map((r) => ({ id: r.id, status: r.status, hold_until: r.hold_until }));
        if (typeof ctx.limitN === 'number') data = data.slice(0, ctx.limitN);
        return { data, error: null };
      };

      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = vi.fn(() => {
        if (ctx.mode === 'update') {
          return {
            maybeSingle: async () => {
              if (!ctx.id || !ctx.updatePayload) return { data: null, error: null };
              const row = store.find((r) => r.id === ctx.id);
              if (!row) return { data: null, error: null };
              const expectedStatus = ctx.statusFilters[ctx.statusFilters.length - 1];
              if (expectedStatus && row.status !== expectedStatus) {
                return { data: null, error: null };
              }
              if (ctx.holdLte && !(row.hold_until <= ctx.holdLte)) {
                return { data: null, error: null };
              }
              // Sync CAS — concurrent workers: only first wins.
              row.status = String(ctx.updatePayload.status ?? row.status);
              if (ctx.updatePayload.available_at) {
                row.available_at = String(ctx.updatePayload.available_at);
              }
              return { data: { id: row.id }, error: null };
            },
          };
        }
        ctx.mode = 'select';
        return chain;
      });
      chain.eq = vi.fn((col: string, val: string) => {
        if (col === 'status') ctx.statusFilters.push(val);
        if (col === 'id') ctx.id = val;
        return chain;
      });
      chain.lte = vi.fn((col: string, val: string) => {
        if (col === 'hold_until') ctx.holdLte = val;
        return chain;
      });
      chain.order = vi.fn(self);
      chain.limit = vi.fn((n: number) => {
        ctx.limitN = n;
        return chain;
      });
      chain.update = vi.fn((payload: Record<string, unknown>) => {
        ctx.mode = 'update';
        ctx.updatePayload = payload;
        ctx.statusFilters = [];
        ctx.holdLte = undefined;
        ctx.id = undefined;
        return chain;
      });
      chain.then = (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(resolveSelect()).then(onFulfilled);

      return chain;
    }),
  } as unknown as SupabaseClient;

  return { supabase, store, audits };
}

describe('M5.3 processExpiredRewardHolds', () => {
  const prevFreeze = process.env.MONEY_PATH_FROZEN;
  const prevVercel = process.env.VERCEL_ENV;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    process.env.MONEY_PATH_FROZEN = 'false';
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    vi.useRealTimers();
    if (prevFreeze !== undefined) process.env.MONEY_PATH_FROZEN = prevFreeze;
    else delete process.env.MONEY_PATH_FROZEN;
    if (prevVercel !== undefined) process.env.VERCEL_ENV = prevVercel;
    else delete process.env.VERCEL_ENV;
  });

  it('1 — hold futuro → permanece VALIDATING', async () => {
    const { supabase, store, audits } = createHoldTestSupabase([
      { id: 'r-future', status: 'VALIDATING', hold_until: '2026-12-01T00:00:00.000Z' },
    ]);
    const result = await processExpiredRewardHolds(supabase);
    expect(result.processed).toBe(0);
    expect(store[0].status).toBe('VALIDATING');
    expect(audits).toHaveLength(0);
  });

  it('2 — hold expirado → AVAILABLE + audit', async () => {
    const { supabase, store, audits } = createHoldTestSupabase([
      { id: 'r-exp', status: 'VALIDATING', hold_until: '2026-08-01T00:00:00.000Z' },
    ]);
    const result = await processExpiredRewardHolds(supabase);
    expect(result.processed).toBe(1);
    expect(result.releasedIds).toEqual(['r-exp']);
    expect(store[0].status).toBe('AVAILABLE');
    expect(audits).toHaveLength(1);
    expect(audits[0].event_type).toBe('reward_available');
    expect(audits[0].previous_state).toBe('VALIDATING');
    expect(audits[0].new_state).toBe('AVAILABLE');
  });

  it('3 — already AVAILABLE → no-op', async () => {
    const { supabase, store, audits } = createHoldTestSupabase([
      { id: 'r-av', status: 'AVAILABLE', hold_until: '2026-01-01T00:00:00.000Z' },
    ]);
    const result = await processExpiredRewardHolds(supabase);
    expect(result.processed).toBe(0);
    expect(store[0].status).toBe('AVAILABLE');
    expect(audits).toHaveLength(0);
  });

  it('4 — CANCELLED → no AVAILABLE', async () => {
    const { supabase, store } = createHoldTestSupabase([
      { id: 'r-c', status: 'CANCELLED', hold_until: '2026-01-01T00:00:00.000Z' },
    ]);
    const result = await processExpiredRewardHolds(supabase);
    expect(result.processed).toBe(0);
    expect(store[0].status).toBe('CANCELLED');
  });

  it('5 — REVERSED → no AVAILABLE', async () => {
    const { supabase, store } = createHoldTestSupabase([
      { id: 'r-r', status: 'REVERSED', hold_until: '2026-01-01T00:00:00.000Z' },
    ]);
    const result = await processExpiredRewardHolds(supabase);
    expect(result.processed).toBe(0);
    expect(store[0].status).toBe('REVERSED');
  });

  it('6 — missing / empty set → processed 0', async () => {
    const { supabase } = createHoldTestSupabase([]);
    const result = await processExpiredRewardHolds(supabase);
    expect(result).toEqual({ processed: 0, scanned: 0, releasedIds: [] });
  });

  it('7 — concurrent ×10 → exactly one transition', async () => {
    const { supabase, store, audits } = createHoldTestSupabase([
      { id: 'r-race', status: 'VALIDATING', hold_until: '2026-08-01T00:00:00.000Z' },
    ]);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => processExpiredRewardHolds(supabase)),
    );
    const totalProcessed = results.reduce((s, r) => s + r.processed, 0);
    expect(totalProcessed).toBe(1);
    expect(store[0].status).toBe('AVAILABLE');
    expect(audits).toHaveLength(1);
  });

  it('8 — replay after success → idempotent', async () => {
    const { supabase, store, audits } = createHoldTestSupabase([
      { id: 'r-rep', status: 'VALIDATING', hold_until: '2026-08-01T00:00:00.000Z' },
    ]);
    const first = await processExpiredRewardHolds(supabase);
    const second = await processExpiredRewardHolds(supabase);
    expect(first.processed).toBe(1);
    expect(second.processed).toBe(0);
    expect(store[0].status).toBe('AVAILABLE');
    expect(audits).toHaveLength(1);
  });

  it('9 — expired batch respects limit', async () => {
    const { supabase, store } = createHoldTestSupabase([
      { id: 'b1', status: 'VALIDATING', hold_until: '2026-08-01T00:00:00.000Z' },
      { id: 'b2', status: 'VALIDATING', hold_until: '2026-08-02T00:00:00.000Z' },
      { id: 'b3', status: 'VALIDATING', hold_until: '2026-08-03T00:00:00.000Z' },
    ]);
    const result = await processExpiredRewardHolds(supabase, { limit: 2 });
    expect(result.scanned).toBe(2);
    expect(result.processed).toBe(2);
    expect(store.filter((r) => r.status === 'AVAILABLE')).toHaveLength(2);
    expect(store.filter((r) => r.status === 'VALIDATING')).toHaveLength(1);
  });

  it('10 — payout isolation (source + runtime)', async () => {
    const src = readFileSync(join(process.cwd(), 'lib/rewards/rewardsEngine.ts'), 'utf8');
    const holdFn = src.slice(
      src.indexOf('export async function processExpiredRewardHolds'),
      src.indexOf('export async function cancelReward'),
    );
    expect(holdFn).not.toMatch(/payout_intent|createManualRewardPayout|confirmPayout|reservePayout/);
    const { supabase } = createHoldTestSupabase([
      { id: 'r-pay', status: 'VALIDATING', hold_until: '2026-08-01T00:00:00.000Z' },
    ]);
    await expect(processExpiredRewardHolds(supabase)).resolves.toMatchObject({ processed: 1 });
  });

  it('11 — audit event reward_available', async () => {
    const { supabase, audits } = createHoldTestSupabase([
      { id: 'r-aud', status: 'VALIDATING', hold_until: '2026-08-01T00:00:00.000Z' },
    ]);
    await processExpiredRewardHolds(supabase);
    expect(audits[0]).toMatchObject({
      event_type: 'reward_available',
      entity_type: 'creator_reward',
      entity_id: 'r-aud',
      previous_state: 'VALIDATING',
      new_state: 'AVAILABLE',
    });
  });

  it('12 — no transition before hold (exact boundary)', async () => {
    const { supabase, store } = createHoldTestSupabase([
      { id: 'r-edge', status: 'VALIDATING', hold_until: '2026-08-30T12:00:00.001Z' },
    ]);
    const result = await processExpiredRewardHolds(supabase);
    expect(result.processed).toBe(0);
    expect(store[0].status).toBe('VALIDATING');
  });

  it('13 — exact transition when hold_until == now', async () => {
    const { supabase, store } = createHoldTestSupabase([
      { id: 'r-eq', status: 'VALIDATING', hold_until: '2026-08-30T12:00:00.000Z' },
    ]);
    const result = await processExpiredRewardHolds(supabase);
    expect(result.processed).toBe(1);
    expect(store[0].status).toBe('AVAILABLE');
  });

  it('14 — retry after successful transition', async () => {
    const { supabase, store, audits } = createHoldTestSupabase([
      { id: 'r-rt', status: 'VALIDATING', hold_until: '2026-08-01T00:00:00.000Z' },
    ]);
    await processExpiredRewardHolds(supabase);
    for (let i = 0; i < 5; i++) {
      const r = await processExpiredRewardHolds(supabase);
      expect(r.processed).toBe(0);
    }
    expect(store[0].status).toBe('AVAILABLE');
    expect(audits).toHaveLength(1);
  });

  it('freeze → no unlock', async () => {
    process.env.MONEY_PATH_FROZEN = 'true';
    const { supabase, store } = createHoldTestSupabase([
      { id: 'r-fr', status: 'VALIDATING', hold_until: '2026-08-01T00:00:00.000Z' },
    ]);
    const result = await processExpiredRewardHolds(supabase);
    expect(result).toEqual({ processed: 0, scanned: 0, frozen: true, releasedIds: [] });
    expect(store[0].status).toBe('VALIDATING');
  });

  it('PAID → no cambia', async () => {
    const { supabase, store } = createHoldTestSupabase([
      { id: 'r-paid', status: 'PAID', hold_until: '2026-01-01T00:00:00.000Z' },
    ]);
    const result = await processExpiredRewardHolds(supabase);
    expect(result.processed).toBe(0);
    expect(store[0].status).toBe('PAID');
  });
});
