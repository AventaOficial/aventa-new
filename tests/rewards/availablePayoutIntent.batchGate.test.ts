import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/rewards/availablePayoutIntent/processAvailableRewardPayoutIntent', () => ({
  processAvailableRewardPayoutIntent: vi.fn(async (_s: unknown, rewardId: string) => ({
    rewardId,
    outcome: 'reserved',
    reason: 'intent_reserved',
    intentId: `i-${rewardId}`,
    intentStatus: 'RESERVED',
    idempotencyKey: `k-${rewardId}`,
    reused: false,
    terminal: true,
  })),
}));

import {
  isPayoutBatchGateEnabled,
  reconcileAvailablePayoutIntents,
} from '@/lib/rewards/availablePayoutIntent/reconcile';

type Row = Record<string, unknown>;

function fakeSupabase(tables: Record<string, Row[]>) {
  const builder = (name: string) => {
    let rows = tables[name] ?? [];
    const api: Record<string, unknown> = {};
    const chain = () => api;
    api.select = chain;
    api.order = chain;
    api.limit = chain;
    api.gte = chain;
    api.eq = (col: string, val: unknown) => {
      rows = rows.filter((r) => r[col] === val);
      return api;
    };
    api.in = (col: string, vals: unknown[]) => {
      rows = rows.filter((r) => vals.includes(r[col]));
      return api;
    };
    api.then = (resolve: (v: { data: Row[]; error: null }) => void) => resolve({ data: rows, error: null });
    return api;
  };
  return { from: builder } as never;
}

const rewards = [
  { id: 'r1', status: 'AVAILABLE', available_at: new Date().toISOString(), created_at: '' },
  { id: 'r2', status: 'AVAILABLE', available_at: new Date().toISOString(), created_at: '' },
  { id: 'r3', status: 'AVAILABLE', available_at: new Date().toISOString(), created_at: '' },
];

describe('reconcile — gate de lotes aprobados (V3/V5)', () => {
  afterEach(() => {
    delete process.env.PAYOUT_BATCH_GATE_ENABLED;
  });

  it('flag apagado por default → comportamiento legacy (procesa todo lo AVAILABLE)', async () => {
    expect(isPayoutBatchGateEnabled({})).toBe(false);
    const sb = fakeSupabase({ creator_rewards: rewards, payout_intents: [] });
    const res = await reconcileAvailablePayoutIntents(sb, { limit: 10 });
    expect(res.attempted).toBe(3);
    expect(res.reserved).toBe(3);
  });

  it('flag ON → solo rewards en líneas pass de lotes approved; resto skipped', async () => {
    process.env.PAYOUT_BATCH_GATE_ENABLED = 'true';
    const sb = fakeSupabase({
      creator_rewards: rewards,
      payout_intents: [],
      payout_batches: [{ id: 'b1', status: 'approved' }, { id: 'b2', status: 'draft' }],
      payout_batch_lines: [
        { batch_id: 'b1', decision: 'pass', reward_ids: ['r1'] },
        { batch_id: 'b1', decision: 'review', reward_ids: ['r2'] },
        { batch_id: 'b2', decision: 'pass', reward_ids: ['r3'] },
      ],
    });
    const res = await reconcileAvailablePayoutIntents(sb, { limit: 10 });
    expect(res.attempted).toBe(1);
    expect(res.results[0].rewardId).toBe('r1');
    expect(res.skipped).toBe(2);
  });

  it('flag ON sin lotes → fail-closed (nada se reserva)', async () => {
    process.env.PAYOUT_BATCH_GATE_ENABLED = '1';
    const sb = fakeSupabase({ creator_rewards: rewards, payout_intents: [] });
    const res = await reconcileAvailablePayoutIntents(sb, { limit: 10 });
    expect(res.attempted).toBe(0);
    expect(res.skipped).toBe(3);
  });
});
