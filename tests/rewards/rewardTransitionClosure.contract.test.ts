/**
 * Cierre de transiciones de reward: mutar, auditar, y solo entonces éxito.
 * meta del ledger no es autoridad.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  cancelReward,
  processExpiredRewardHolds,
  reverseReward,
} from '@/lib/rewards/rewardsEngine';
import { processLedgerRewardAttempt } from '@/lib/rewards/ledgerRewardBridge';

const REWARD = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const LEDGER = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const ACTOR = '11111111-1111-4111-8111-111111111111';

type RewardRow = {
  id: string;
  status: string;
  hold_until: string;
  ledger_entry_id?: string;
  gross_commission_cents?: number;
  currency?: string;
};

function transitionStore(initial: RewardRow, opts?: { failAudits?: boolean }) {
  const reward: RewardRow = { ...initial };
  const audits: Array<Record<string, unknown>> = [];
  let updates = 0;
  let failAudits = opts?.failAudits ?? false;

  const from = (table: string) => {
    if (table === 'reward_audit_log') {
      const filters: Record<string, string> = {};
      const api: Record<string, unknown> = {};
      const self = () => api;
      api.select = vi.fn(self);
      api.eq = vi.fn((col: string, val: string) => {
        filters[col] = val;
        return api;
      });
      api.limit = vi.fn(self);
      api.maybeSingle = vi.fn(async () => {
        const found = audits.find(
          (row) => row.entity_id === filters.entity_id && row.event_type === filters.event_type,
        );
        return { data: found ? { id: 'audit-row' } : null, error: null };
      });
      api.insert = vi.fn(async (payload: Record<string, unknown>) => {
        if (failAudits) return { error: { message: 'audit_down' } };
        audits.push(payload);
        return { error: null };
      });
      return api;
    }

    const filters: Record<string, string> = {};
    let updatePayload: Record<string, unknown> | null = null;
    const api: Record<string, unknown> = {};
    const self = () => api;
    api.select = vi.fn(self);
    api.eq = vi.fn((col: string, val: string) => {
      filters[col] = val;
      return api;
    });
    api.in = vi.fn((col: string, val: string[]) => {
      filters[`${col}__in`] = val.join(',');
      return api;
    });
    api.lte = vi.fn(self);
    api.order = vi.fn(self);
    api.limit = vi.fn(self);
    api.update = vi.fn((payload: Record<string, unknown>) => {
      updatePayload = payload;
      return api;
    });
    api.maybeSingle = vi.fn(async () => {
      if (updatePayload) {
        const allowed = filters.status__in?.split(',') ?? [];
        const statusOk = filters.status
          ? reward.status === filters.status
          : allowed.includes(reward.status);
        if (!statusOk) return { data: null, error: null };
        updates += 1;
        reward.status = String(updatePayload.status ?? reward.status);
        updatePayload = null;
        return { data: { id: reward.id }, error: null };
      }
      if (filters.status && reward.status !== filters.status) return { data: null, error: null };
      return {
        data: {
          id: reward.id,
          status: reward.status,
          hold_until: reward.hold_until,
          gross_commission_cents: reward.gross_commission_cents,
          currency: reward.currency,
          ledger_entry_id: reward.ledger_entry_id,
        },
        error: null,
      };
    });
    api.then = (onFulfilled: (value: unknown) => unknown) => {
      if (updatePayload) {
        const statusOk = !filters.status || reward.status === filters.status;
        if (!statusOk) {
          updatePayload = null;
          return Promise.resolve({ data: null, error: { message: 'cas_lost' } }).then(onFulfilled);
        }
        updates += 1;
        reward.status = String(updatePayload.status ?? reward.status);
        updatePayload = null;
        return Promise.resolve({ data: { id: reward.id }, error: null }).then(onFulfilled);
      }
      if (filters.status && reward.status !== filters.status) {
        return Promise.resolve({ data: [], error: null }).then(onFulfilled);
      }
      return Promise.resolve({
        data: [{ id: reward.id, status: reward.status, hold_until: reward.hold_until }],
        error: null,
      }).then(onFulfilled);
    };
    return api;
  };

  return {
    supabase: { from: vi.fn(from) } as unknown as SupabaseClient,
    reward,
    audits,
    updates: () => updates,
    setFailAudits(next: boolean) {
      failAudits = next;
    },
  };
}

const prev = { ...process.env };

describe('reward state transitions are fail-closed on audit', () => {
  beforeEach(() => {
    process.env = { ...prev, NODE_ENV: 'test', MONEY_PATH_FROZEN: 'false' };
    delete process.env.VERCEL_ENV;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
  });

  afterEach(() => {
    process.env = { ...prev };
    vi.useRealTimers();
  });

  it('cancel succeeds only after the audit is stored', async () => {
    const store = transitionStore({ id: REWARD, status: 'VALIDATING', hold_until: '2026-01-01T00:00:00.000Z' });
    const ok = await cancelReward(store.supabase, REWARD, ACTOR, 'staff');
    expect(ok).toEqual({ ok: true, rewardId: REWARD });
    expect(store.reward.status).toBe('CANCELLED');
    expect(store.audits).toHaveLength(1);
    expect(store.updates()).toBe(1);
  });

  it('cancel keeps the row and refuses success when the audit fails', async () => {
    const store = transitionStore(
      { id: REWARD, status: 'VALIDATING', hold_until: '2026-01-01T00:00:00.000Z' },
      { failAudits: true },
    );
    const failed = await cancelReward(store.supabase, REWARD, ACTOR, 'staff');
    expect(failed).toEqual({ ok: false, reason: 'audit_append_failed', rewardId: REWARD });
    expect(store.reward.status).toBe('CANCELLED');
    expect(store.audits).toHaveLength(0);
    expect(store.updates()).toBe(1);

    store.setFailAudits(false);
    const recovered = await cancelReward(store.supabase, REWARD, ACTOR, 'staff');
    expect(recovered).toEqual({ ok: true, rewardId: REWARD });
    expect(store.updates()).toBe(1);
    expect(store.audits).toHaveLength(1);
  });

  it('reverse succeeds only after the audit is stored', async () => {
    const store = transitionStore({ id: REWARD, status: 'AVAILABLE', hold_until: '2026-01-01T00:00:00.000Z' });
    const ok = await reverseReward(store.supabase, REWARD, ACTOR, 'staff');
    expect(ok).toEqual({ ok: true, rewardId: REWARD });
    expect(store.reward.status).toBe('REVERSED');
    expect(store.audits.map((row) => row.event_type)).toEqual(['reward_reversed']);
  });

  it('reverse keeps the row and certifies it on retry', async () => {
    const store = transitionStore(
      { id: REWARD, status: 'AVAILABLE', hold_until: '2026-01-01T00:00:00.000Z' },
      { failAudits: true },
    );
    const failed = await reverseReward(store.supabase, REWARD, ACTOR, 'staff');
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.reason).toBe('audit_append_failed');
    expect(store.reward.status).toBe('REVERSED');
    expect(store.updates()).toBe(1);

    store.setFailAudits(false);
    const recovered = await reverseReward(store.supabase, REWARD, ACTOR, 'staff');
    expect(recovered.ok).toBe(true);
    expect(store.updates()).toBe(1);
    expect(store.audits).toHaveLength(1);
  });

  it('expiry does not report a release when the audit fails, then certifies the same row', async () => {
    const store = transitionStore(
      { id: REWARD, status: 'VALIDATING', hold_until: '2026-08-01T00:00:00.000Z' },
      { failAudits: true },
    );
    const failed = await processExpiredRewardHolds(store.supabase);
    expect(failed.processed).toBe(0);
    expect(failed.auditFailedIds).toContain(REWARD);
    expect(store.reward.status).toBe('AVAILABLE');
    expect(store.updates()).toBe(1);

    store.setFailAudits(false);
    const recovered = await processExpiredRewardHolds(store.supabase);
    expect(recovered.processed).toBe(0);
    expect(recovered.certifiedIds).toEqual([REWARD]);
    expect(recovered.auditFailedIds).toEqual([]);
    expect(store.updates()).toBe(1);
    expect(store.audits).toHaveLength(1);
  });

  it('two concurrent cancels produce one status change', async () => {
    const store = transitionStore({ id: REWARD, status: 'AVAILABLE', hold_until: '2026-01-01T00:00:00.000Z' });
    const [a, b] = await Promise.all([
      cancelReward(store.supabase, REWARD, ACTOR, 'a'),
      cancelReward(store.supabase, REWARD, ACTOR, 'b'),
    ]);
    expect([a, b].filter((result) => result.ok)).toHaveLength(1);
    expect(store.reward.status).toBe('CANCELLED');
    expect(store.updates()).toBe(1);
  });

  it('frozen money path does not release a hold', async () => {
    process.env.MONEY_PATH_FROZEN = 'true';
    const store = transitionStore({
      id: REWARD,
      status: 'VALIDATING',
      hold_until: '2026-08-01T00:00:00.000Z',
    });
    const result = await processExpiredRewardHolds(store.supabase);
    expect(result.frozen).toBe(true);
    expect(result.processed).toBe(0);
    expect(store.reward.status).toBe('VALIDATING');
    expect(store.updates()).toBe(0);
  });
});

describe('ledger reward meta is not an economic authority', () => {
  beforeEach(() => {
    process.env = {
      ...prev,
      NODE_ENV: 'test',
      MONEY_PATH_FROZEN: 'false',
      REWARDS_PROGRAM_ACTIVE: 'true',
    };
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    process.env = { ...prev };
  });

  function ledgerClient(input: {
    gross?: number;
    currency?: string;
    reward?: boolean;
    terminal?: boolean;
  }) {
    const rewards = input.reward
      ? [
          {
            id: REWARD,
            ledger_entry_id: LEDGER,
            gross_commission_cents: input.gross ?? 1000,
            currency: input.currency ?? 'MXN',
          },
        ]
      : [];
    const audits: unknown[] = [];
    let rewardInserts = 0;
    const from = (table: string) => {
      const filters: Record<string, string> = {};
      const api: Record<string, unknown> = {};
      const self = () => api;
      api.select = vi.fn(self);
      api.eq = vi.fn((col: string, val: string) => {
        filters[col] = val;
        return api;
      });
      api.update = vi.fn(() => ({ eq: async () => ({ error: null }) }));
      api.insert = vi.fn(async () => {
        if (table === 'creator_rewards') rewardInserts += 1;
        if (table === 'reward_audit_log') audits.push(1);
        return { error: null };
      });
      api.maybeSingle = vi.fn(async () => {
        if (table === 'affiliate_ledger_entries') {
          return {
            data: {
              id: LEDGER,
              network: 'amazon',
              amount_cents: 1000,
              status: 'accrued',
              external_ref: null,
              notes: 'settlement_bridge_m1',
              created_at: '2026-08-01T00:00:00.000Z',
              tracking_tag: null,
              offer_id: null,
              creator_id: null,
              click_id: null,
              meta: {
                settlement: { commissionId: 'comm-1' },
                ledger_reward_bridge: input.terminal
                  ? {
                      version: 'm51',
                      class: 'created',
                      reason: 'created',
                      attempt: 1,
                      at: '2026-08-01T00:00:00.000Z',
                      commissionId: 'comm-1',
                      rewardId: input.reward ? REWARD : null,
                      terminal: true,
                    }
                  : undefined,
              },
            },
            error: null,
          };
        }
        if (table === 'creator_rewards') {
          const row = rewards.find((item) => item.ledger_entry_id === filters.ledger_entry_id);
          return { data: row ?? null, error: null };
        }
        return { data: null, error: null };
      });
      return api;
    };
    return {
      supabase: { from: vi.fn(from) } as unknown as SupabaseClient,
      audits,
      inserts: () => rewardInserts,
    };
  }

  it('reuses an existing reward even when meta says the attempt is terminal', async () => {
    const store = ledgerClient({ reward: true, gross: 1000, terminal: true });
    const result = await processLedgerRewardAttempt(store.supabase, LEDGER);
    expect(result.outcome).toBe('duplicate');
    expect(result.rewardId).toBe(REWARD);
    expect(store.inserts()).toBe(0);
    expect(store.audits.length).toBeGreaterThan(0);
  });

  it('does not trust terminal meta when the reward amount disagrees', async () => {
    const store = ledgerClient({ reward: true, gross: 50, terminal: true });
    const result = await processLedgerRewardAttempt(store.supabase, LEDGER);
    expect(result.outcome).toBe('rejected');
    expect(result.reason).toBe('reward_ledger_mismatch');
    expect(store.inserts()).toBe(0);
  });

  it('does not create a reward from terminal meta while the money path is frozen', async () => {
    process.env.MONEY_PATH_FROZEN = 'true';
    const store = ledgerClient({ reward: false, terminal: true });
    const result = await processLedgerRewardAttempt(store.supabase, LEDGER);
    expect(result.outcome).toBe('deferred');
    expect(result.reason).toBe('money_path_frozen');
    expect(store.inserts()).toBe(0);
  });
});
