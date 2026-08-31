import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { processExpiredRewardHolds } from '../../lib/rewards/rewardsEngine';

type RewardState = {
  id: string;
  status: string;
  hold_until: string;
};

function createHoldTestSupabase(initial: RewardState[]) {
  const store = initial.map((r) => ({ ...r }));
  let auditInsertCount = 0;

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'creator_rewards') {
        const ctx: { mode?: 'select' | 'update'; id?: string; statusEq?: string; holdLte?: string } = {};

        const chain = {
          select: vi.fn((_cols?: string) => {
            ctx.mode = 'select';
            return chain;
          }),
          eq: vi.fn((col: string, val: string) => {
            if (col === 'status') ctx.statusEq = val;
            if (col === 'id') ctx.id = val;
            return chain;
          }),
          lte: vi.fn((col: string, val: string) => {
            if (col === 'hold_until') ctx.holdLte = val;
            const data = store
              .filter((r) => (ctx.statusEq ? r.status === ctx.statusEq : true))
              .filter((r) => (ctx.holdLte ? r.hold_until <= ctx.holdLte : true))
              .map((r) => ({ id: r.id, status: r.status }));
            return Promise.resolve({ data, error: null });
          }),
          update: vi.fn((payload: { status?: string }) => {
            ctx.mode = 'update';
            const updatePayload = payload;
            const updateChain = {
              eq: vi.fn((col: string, val: string) => {
                if (col === 'id') ctx.id = val;
                if (col === 'status') ctx.statusEq = val;
                return updateChain;
              }),
              select: vi.fn(() => ({
                maybeSingle: vi.fn(async () => {
                  const row = store.find((r) => r.id === ctx.id && r.status === ctx.statusEq);
                  if (!row) return { data: null, error: null };
                  row.status = updatePayload.status ?? row.status;
                  return { data: { id: row.id }, error: null };
                }),
              })),
            };
            return updateChain;
          }),
        };
        return chain;
      }

      if (table === 'reward_audit_log') {
        return {
          insert: vi.fn(async () => {
            auditInsertCount += 1;
            return { error: null };
          }),
        };
      }

      return {};
    }),
  } as unknown as SupabaseClient;

  return {
    supabase,
    store,
    auditInsertCount: () => auditInsertCount,
  };
}

describe('processExpiredRewardHolds', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hold vencido → AVAILABLE', async () => {
    const { supabase, store, auditInsertCount } = createHoldTestSupabase([
      { id: 'r1', status: 'VALIDATING', hold_until: '2026-08-01T00:00:00.000Z' },
    ]);

    const result = await processExpiredRewardHolds(supabase);
    expect(result.processed).toBe(1);
    expect(store[0].status).toBe('AVAILABLE');
    expect(auditInsertCount()).toBe(1);
  });

  it('hold no vencido → permanece VALIDATING', async () => {
    const { supabase, store, auditInsertCount } = createHoldTestSupabase([
      { id: 'r2', status: 'VALIDATING', hold_until: '2026-12-01T00:00:00.000Z' },
    ]);

    const result = await processExpiredRewardHolds(supabase);
    expect(result.processed).toBe(0);
    expect(store[0].status).toBe('VALIDATING');
    expect(auditInsertCount()).toBe(0);
  });

  it('ejecutar el proceso dos veces → no duplica transición ni auditoría', async () => {
    const { supabase, store, auditInsertCount } = createHoldTestSupabase([
      { id: 'r3', status: 'VALIDATING', hold_until: '2026-08-01T00:00:00.000Z' },
    ]);

    const first = await processExpiredRewardHolds(supabase);
    const second = await processExpiredRewardHolds(supabase);
    expect(first.processed).toBe(1);
    expect(second.processed).toBe(0);
    expect(store[0].status).toBe('AVAILABLE');
    expect(auditInsertCount()).toBe(1);
  });

  it('reward PAID → no cambia', async () => {
    const { supabase, store, auditInsertCount } = createHoldTestSupabase([
      { id: 'r4', status: 'PAID', hold_until: '2026-01-01T00:00:00.000Z' },
    ]);

    const result = await processExpiredRewardHolds(supabase);
    expect(result.processed).toBe(0);
    expect(store[0].status).toBe('PAID');
    expect(auditInsertCount()).toBe(0);
  });

  it('reward CANCELLED → no cambia', async () => {
    const { supabase, store, auditInsertCount } = createHoldTestSupabase([
      { id: 'r5', status: 'CANCELLED', hold_until: '2026-01-01T00:00:00.000Z' },
    ]);

    const result = await processExpiredRewardHolds(supabase);
    expect(result.processed).toBe(0);
    expect(store[0].status).toBe('CANCELLED');
    expect(auditInsertCount()).toBe(0);
  });

  it('reward REVERSED → no cambia', async () => {
    const { supabase, store, auditInsertCount } = createHoldTestSupabase([
      { id: 'r6', status: 'REVERSED', hold_until: '2026-01-01T00:00:00.000Z' },
    ]);

    const result = await processExpiredRewardHolds(supabase);
    expect(result.processed).toBe(0);
    expect(store[0].status).toBe('REVERSED');
    expect(auditInsertCount()).toBe(0);
  });
});
