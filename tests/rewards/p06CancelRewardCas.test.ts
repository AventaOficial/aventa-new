import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cancelReward } from '../../lib/rewards/rewardsEngine';

const REWARD = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const ACTOR = '11111111-1111-1111-1111-111111111111';
const CANCELABLE = new Set(['PENDING', 'VALIDATING', 'AVAILABLE']);

type RewardRow = {
  id: string;
  status: string;
  cancelled_at?: string | null;
  updated_at?: string | null;
  payout_id?: string | null;
};

function makeCasStore(initial: RewardRow) {
  const reward: RewardRow = { ...initial };
  const audits: unknown[] = [];
  const settlementTouches: string[] = [];

  const from = (table: string) => {
    if (table === 'reward_audit_log') {
      return {
        insert: vi.fn((payload: unknown) => {
          audits.push(payload);
          return Promise.resolve({ error: null });
        }),
      };
    }

    if (table === 'ledger_settlements') {
      const deny = () => {
        settlementTouches.push('touched');
        throw new Error('ledger_settlements no debe tocarsi en cancelReward');
      };
      return {
        select: deny,
        insert: deny,
        update: deny,
        delete: deny,
      };
    }

    const filters: Record<string, unknown> = {};
    let op = 'select';
    let updatePayload: Record<string, unknown> | null = null;

    const builder: Record<string, unknown> = {};
    const self = () => builder;

    builder.select = vi.fn((cols?: string) => {
      filters.selectCols = cols;
      return builder;
    });
    builder.eq = vi.fn((col: string, val: unknown) => {
      filters[col] = val;
      return builder;
    });
    builder.in = vi.fn((col: string, val: unknown) => {
      filters[`${col}__in`] = val;
      return builder;
    });
    builder.update = vi.fn((payload: Record<string, unknown>) => {
      op = 'update';
      updatePayload = payload;
      return builder;
    });

    const run = async () => {
      if (table !== 'creator_rewards') {
        return { data: null, error: null };
      }

      if (op === 'select') {
        if (filters.id === reward.id) {
          return { data: { status: reward.status }, error: null };
        }
        return { data: null, error: null };
      }

      if (op === 'update') {
        const idOk = filters.id === reward.id;
        const statusIn = filters.status__in as string[] | undefined;
        const statusOk =
          Array.isArray(statusIn) && statusIn.includes(reward.status) && CANCELABLE.has(reward.status);

        if (!idOk || !statusOk || !updatePayload) {
          return { data: null, error: null };
        }

        const prevStatus = reward.status;
        reward.status = String(updatePayload.status);
        reward.cancelled_at = (updatePayload.cancelled_at as string) ?? null;
        reward.updated_at = (updatePayload.updated_at as string) ?? null;
        return { data: { id: reward.id, previous_for_test: prevStatus }, error: null };
      }

      return { data: null, error: null };
    };

    builder.maybeSingle = vi.fn(() => run());
    builder.single = vi.fn(() => run());
    builder.then = (onFulfilled: (v: unknown) => unknown) => run().then(onFulfilled);

    return builder;
  };

  return {
    supabase: { from: vi.fn(from) } as unknown as SupabaseClient,
    reward,
    audits,
    settlementTouches,
    /** Simula payout concurrente: AVAILABLE → PAID sin pasar por cancel. */
    markPaid: () => {
      reward.status = 'PAID';
      reward.payout_id = 'payout-concurrent';
    },
  };
}

describe('P0-6 — cancelReward CAS', () => {
  it('Test 1 — VALIDATING → CANCELLED', async () => {
    const store = makeCasStore({ id: REWARD, status: 'VALIDATING' });
    const ok = await cancelReward(store.supabase, REWARD, ACTOR, 'staff_cancel');
    expect(ok).toBe(true);
    expect(store.reward.status).toBe('CANCELLED');
    expect(store.audits).toHaveLength(1);
    expect((store.audits[0] as { event_type: string }).event_type).toBe('reward_cancelled');
    expect((store.audits[0] as { previous_state: string }).previous_state).toBe('VALIDATING');
  });

  it('Test 2 — AVAILABLE → CANCELLED', async () => {
    const store = makeCasStore({ id: REWARD, status: 'AVAILABLE' });
    const ok = await cancelReward(store.supabase, REWARD, ACTOR, 'staff_cancel');
    expect(ok).toBe(true);
    expect(store.reward.status).toBe('CANCELLED');
    expect(store.audits).toHaveLength(1);
  });

  it('Test 3 — PENDING → CANCELLED', async () => {
    const store = makeCasStore({ id: REWARD, status: 'PENDING' });
    const ok = await cancelReward(store.supabase, REWARD, ACTOR, 'staff_cancel');
    expect(ok).toBe(true);
    expect(store.reward.status).toBe('CANCELLED');
    expect(store.audits).toHaveLength(1);
  });

  it('Test 4 — PAID → CANCELLED no-op', async () => {
    const store = makeCasStore({ id: REWARD, status: 'PAID', payout_id: 'p1' });
    const ok = await cancelReward(store.supabase, REWARD, ACTOR, 'staff_cancel');
    expect(ok).toBe(false);
    expect(store.reward.status).toBe('PAID');
    expect(store.audits).toHaveLength(0);
  });

  it('Test 5 — REVERSED → CANCELLED no-op', async () => {
    const store = makeCasStore({ id: REWARD, status: 'REVERSED' });
    const ok = await cancelReward(store.supabase, REWARD, ACTOR, 'staff_cancel');
    expect(ok).toBe(false);
    expect(store.reward.status).toBe('REVERSED');
    expect(store.audits).toHaveLength(0);
  });

  it('Test 6 — CANCELLED → CANCELLED mantiene false', async () => {
    const store = makeCasStore({ id: REWARD, status: 'CANCELLED' });
    const ok = await cancelReward(store.supabase, REWARD, ACTOR, 'staff_cancel');
    expect(ok).toBe(false);
    expect(store.reward.status).toBe('CANCELLED');
    expect(store.audits).toHaveLength(0);
  });

  it('Test 7 — CAS perdido tras AVAILABLE→PAID entre SELECT y UPDATE', async () => {
    const race = makeCasStore({ id: REWARD, status: 'AVAILABLE' });
    let sawSelect = false;
    const fromRace = vi.fn((table: string) => {
      if (table === 'reward_audit_log') {
        return {
          insert: vi.fn((payload: unknown) => {
            race.audits.push(payload);
            return Promise.resolve({ error: null });
          }),
        };
      }
      const filters: Record<string, unknown> = {};
      let op = 'select';
      let updatePayload: Record<string, unknown> | null = null;
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.eq = vi.fn((c: string, v: unknown) => {
        filters[c] = v;
        return builder;
      });
      builder.in = vi.fn((c: string, v: unknown) => {
        filters[`${c}__in`] = v;
        return builder;
      });
      builder.update = vi.fn((p: Record<string, unknown>) => {
        op = 'update';
        updatePayload = p;
        return builder;
      });
      const run = async () => {
        if (op === 'select') {
          sawSelect = true;
          return { data: { status: race.reward.status }, error: null };
        }
        if (op === 'update') {
          expect(sawSelect).toBe(true);
          // Payout gana entre SELECT y CAS.
          race.markPaid();
          const statusIn = filters.status__in as string[];
          const statusOk = Array.isArray(statusIn) && statusIn.includes(race.reward.status);
          if (!statusOk || !updatePayload) return { data: null, error: null };
          race.reward.status = String(updatePayload.status);
          return { data: { id: REWARD }, error: null };
        }
        return { data: null, error: null };
      };
      builder.maybeSingle = vi.fn(() => run());
      return builder;
    });

    const ok = await cancelReward(
      { from: fromRace } as unknown as SupabaseClient,
      REWARD,
      ACTOR,
      'race_cancel',
    );
    expect(ok).toBe(false);
    expect(race.reward.status).toBe('PAID');
    expect(race.reward.payout_id).toBe('payout-concurrent');
    expect(race.audits).toHaveLength(0);
  });

  it('Test 8 — doble cancel: máximo 1 transición y 1 audit', async () => {
    const store = makeCasStore({ id: REWARD, status: 'AVAILABLE' });
    const [a, b] = await Promise.all([
      cancelReward(store.supabase, REWARD, ACTOR, 'c1'),
      cancelReward(store.supabase, REWARD, ACTOR, 'c2'),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(store.reward.status).toBe('CANCELLED');
    expect(store.audits).toHaveLength(1);
  });

  it('Test 9 — cancel vs payout: payout gana primero', async () => {
    const store = makeCasStore({ id: REWARD, status: 'AVAILABLE' });
    store.markPaid();
    const ok = await cancelReward(store.supabase, REWARD, ACTOR, 'late_cancel');
    expect(ok).toBe(false);
    expect(store.reward.status).toBe('PAID');
    expect(store.reward.payout_id).toBe('payout-concurrent');
    expect(store.audits).toHaveLength(0);
  });

  it('Test 10 — cancel no toca ledger_settlements', async () => {
    const store = makeCasStore({ id: REWARD, status: 'VALIDATING' });
    const ok = await cancelReward(store.supabase, REWARD, ACTOR, 'staff_cancel');
    expect(ok).toBe(true);
    expect(store.settlementTouches).toHaveLength(0);
    // cancelReward never calls from('ledger_settlements')
    const tables = (store.supabase.from as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(tables).not.toContain('ledger_settlements');
  });
});
