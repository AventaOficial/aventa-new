/**
 * M5.4 — AVAILABLE → payout_intent processor tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/rewards/payoutIntent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rewards/payoutIntent')>();
  return {
    ...actual,
    reservePayoutIntent: vi.fn(),
  };
});

import { reservePayoutIntent, PAYOUT_INTENT_PROVIDER_STUB } from '@/lib/rewards/payoutIntent';
import {
  processAvailableRewardPayoutIntent,
  reconcileAvailablePayoutIntents,
  classifyReserveReject,
} from '@/lib/rewards/availablePayoutIntent';

const reserve = vi.mocked(reservePayoutIntent);
const REWARD = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const INTENT = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function intentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INTENT,
    reward_id: REWARD,
    creator_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    amount_cents: 20_000,
    currency: 'MXN',
    status: 'RESERVED',
    idempotency_key: `payout_intent:${REWARD}:v1`,
    provider: PAYOUT_INTENT_PROVIDER_STUB,
    meta: {},
    reserved_at: '2026-09-19T00:00:00.000Z',
    submitted_at: null,
    resolved_at: null,
    created_at: '2026-09-19T00:00:00.000Z',
    updated_at: '2026-09-19T00:00:00.000Z',
    ...overrides,
  };
}

function makeSb(opts?: {
  availableIds?: string[];
  claimedIds?: string[];
}) {
  const availableIds = opts?.availableIds ?? [REWARD];
  const claimed = new Set(opts?.claimedIds ?? []);
  const audits: unknown[] = [];

  const from = vi.fn((table: string) => {
    if (table === 'reward_audit_log') {
      return {
        insert: vi.fn(async (p: unknown) => {
          audits.push(p);
          return { error: null };
        }),
      };
    }
    if (table === 'payout_intents' || table === 'reward_payouts') {
      if (table === 'reward_payouts') {
        throw new Error('reward_payouts must not be touched');
      }
    }

    const filters: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = vi.fn(self);
    chain.eq = vi.fn((c: string, v: unknown) => {
      filters[c] = v;
      return chain;
    });
    chain.gte = vi.fn((c: string, v: unknown) => {
      filters[`gte_${c}`] = v;
      return chain;
    });
    chain.in = vi.fn((c: string, v: unknown) => {
      filters[c] = v;
      return chain;
    });
    chain.order = vi.fn(self);
    chain.limit = vi.fn(self);
    chain.then = (onFulfilled: (v: unknown) => unknown) => {
      if (table === 'creator_rewards') {
        const data = availableIds.map((id) => ({
          id,
          status: 'AVAILABLE',
          available_at: '2026-09-19T00:00:00.000Z',
          created_at: '2026-09-19T00:00:00.000Z',
        }));
        return Promise.resolve({ data, error: null }).then(onFulfilled);
      }
      if (table === 'payout_intents') {
        const wanted = (filters.reward_id as string[] | undefined) ?? [];
        const data = wanted
          .filter((id) => claimed.has(id))
          .map((reward_id) => ({ reward_id }));
        return Promise.resolve({ data, error: null }).then(onFulfilled);
      }
      return Promise.resolve({ data: null, error: null }).then(onFulfilled);
    };
    return chain;
  });

  return {
    supabase: { from } as unknown as SupabaseClient,
    audits,
  };
}

describe('M5.4 classify', () => {
  it('maps below_minimum and freeze to deferred; terminal statuses to rejected', () => {
    expect(classifyReserveReject('below_minimum_available')).toEqual({
      class: 'deferred',
      terminal: false,
    });
    expect(classifyReserveReject('money_path_frozen')).toEqual({
      class: 'deferred',
      terminal: false,
    });
    expect(classifyReserveReject('reward_terminal')).toEqual({
      class: 'rejected',
      terminal: true,
    });
    expect(classifyReserveReject('reward_not_available')).toEqual({
      class: 'rejected',
      terminal: true,
    });
  });
});

describe('M5.4 processAvailableRewardPayoutIntent', () => {
  const prevFreeze = process.env.MONEY_PATH_FROZEN;
  const prevRewards = process.env.REWARDS_PROGRAM_ACTIVE;

  beforeEach(() => {
    process.env.MONEY_PATH_FROZEN = 'false';
    process.env.REWARDS_PROGRAM_ACTIVE = 'true';
    process.env.NODE_ENV = 'test';
    delete process.env.VERCEL_ENV;
    reserve.mockReset();
  });

  afterEach(() => {
    if (prevFreeze !== undefined) process.env.MONEY_PATH_FROZEN = prevFreeze;
    else delete process.env.MONEY_PATH_FROZEN;
    if (prevRewards !== undefined) process.env.REWARDS_PROGRAM_ACTIVE = prevRewards;
    else delete process.env.REWARDS_PROGRAM_ACTIVE;
  });

  it('A — AVAILABLE elegible → reserved once via reservePayoutIntent', async () => {
    const { supabase } = makeSb();
    reserve.mockResolvedValue({ ok: true, intent: intentRow(), reused: false });
    const r = await processAvailableRewardPayoutIntent(supabase, REWARD);
    expect(r.outcome).toBe('reserved');
    expect(r.intentId).toBe(INTENT);
    expect(r.intentStatus).toBe('RESERVED');
    expect(reserve).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        rewardId: REWARD,
        provider: PAYOUT_INTENT_PROVIDER_STUB,
      }),
    );
  });

  it('B — replay → reused', async () => {
    const { supabase } = makeSb();
    reserve.mockResolvedValue({ ok: true, intent: intentRow(), reused: true });
    const r = await processAvailableRewardPayoutIntent(supabase, REWARD);
    expect(r.outcome).toBe('reused');
    expect(r.reused).toBe(true);
    expect(r.idempotencyKey).toBe(`payout_intent:${REWARD}:v1`);
  });

  it('C — concurrent ×10 → single reserve authority (mock CAS via reused)', async () => {
    const { supabase } = makeSb();
    let n = 0;
    reserve.mockImplementation(async () => {
      n += 1;
      return {
        ok: true as const,
        intent: intentRow(),
        reused: n > 1,
      };
    });
    const results = await Promise.all(
      Array.from({ length: 10 }, () => processAvailableRewardPayoutIntent(supabase, REWARD)),
    );
    expect(results.every((r) => r.intentId === INTENT)).toBe(true);
    expect(results.filter((r) => r.outcome === 'reserved').length).toBe(1);
    expect(results.filter((r) => r.outcome === 'reused').length).toBe(9);
  });

  it('D/E — reward_not_available → rejected', async () => {
    const { supabase } = makeSb();
    reserve.mockResolvedValue({ ok: false, reason: 'reward_not_available' });
    const r = await processAvailableRewardPayoutIntent(supabase, REWARD);
    expect(r.outcome).toBe('rejected');
    expect(r.terminal).toBe(true);
  });

  it('F — below_minimum → deferred', async () => {
    const { supabase } = makeSb();
    reserve.mockResolvedValue({ ok: false, reason: 'below_minimum_available' });
    const r = await processAvailableRewardPayoutIntent(supabase, REWARD);
    expect(r.outcome).toBe('deferred');
    expect(r.terminal).toBe(false);
  });

  it('G/H/I — reward_terminal → rejected', async () => {
    const { supabase } = makeSb();
    reserve.mockResolvedValue({ ok: false, reason: 'reward_terminal' });
    const r = await processAvailableRewardPayoutIntent(supabase, REWARD);
    expect(r.outcome).toBe('rejected');
  });

  it('J — money_path_frozen → deferred', async () => {
    const { supabase } = makeSb();
    reserve.mockResolvedValue({ ok: false, reason: 'money_path_frozen' });
    const r = await processAvailableRewardPayoutIntent(supabase, REWARD);
    expect(r.outcome).toBe('deferred');
    expect(r.reason).toBe('money_path_frozen');
  });

  it('K — REWARDS_PROGRAM_ACTIVE=false → deferred, no reserve call', async () => {
    process.env.REWARDS_PROGRAM_ACTIVE = 'false';
    const { supabase } = makeSb();
    const r = await processAvailableRewardPayoutIntent(supabase, REWARD);
    expect(r.outcome).toBe('deferred');
    expect(r.reason).toBe('program_inactive');
    expect(reserve).not.toHaveBeenCalled();
  });

  it('L — empty reward id → rejected', async () => {
    const { supabase } = makeSb();
    const r = await processAvailableRewardPayoutIntent(supabase, '  ');
    expect(r.outcome).toBe('rejected');
    expect(r.reason).toBe('reward_not_found');
    expect(reserve).not.toHaveBeenCalled();
  });

  it('O — never calls submit/provider (source guard)', () => {
    const root = join(process.cwd(), 'lib/rewards/availablePayoutIntent');
    for (const f of [
      'processAvailableRewardPayoutIntent.ts',
      'reconcile.ts',
      'classify.ts',
      'index.ts',
    ]) {
      const src = readFileSync(join(root, f), 'utf8');
      expect(src).not.toMatch(/submitPayoutIntent\s*\(/);
      expect(src).not.toMatch(/executeProviderSubmit|executeProviderReconcile/);
      expect(src).not.toMatch(/confirmPayoutIntentSuccess|applyProviderConfirmation/);
      expect(src).not.toMatch(/createRealPayoutProvider/);
    }
  });

  it('reconcile skips claimed and attempts unclaimed', async () => {
    const a = '11111111-1111-4111-8111-111111111111';
    const b = '22222222-2222-4222-8222-222222222222';
    const { supabase } = makeSb({ availableIds: [a, b], claimedIds: [a] });
    reserve.mockResolvedValue({
      ok: true,
      intent: intentRow({ id: 'new', reward_id: b, idempotency_key: `payout_intent:${b}:v1` }),
      reused: false,
    });
    const recon = await reconcileAvailablePayoutIntents(supabase, {
      limit: 10,
      lookbackHours: 24,
    });
    expect(recon.skipped).toBe(1);
    expect(recon.attempted).toBe(1);
    expect(recon.reserved).toBe(1);
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(reserve.mock.calls[0][1]).toMatchObject({ rewardId: b });
  });
});
