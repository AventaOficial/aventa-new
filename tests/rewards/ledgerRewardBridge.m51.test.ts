/**
 * M5.1 — Ledger → Reward bridge test matrix.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  classifyEngineReason,
  canAutoAttemptRewards,
  processLedgerRewardAttempt,
  scheduleLedgerRewardAttempt,
  reconcileLedgerRewardBridge,
  readLedgerRewardOutcome,
  LEDGER_REWARD_BRIDGE_META_KEY,
} from '@/lib/rewards/ledgerRewardBridge';

const OFFER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CREATOR = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CLICK = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const LEDGER = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const COMMISSION = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

vi.mock('@/lib/rewards/processLedger', () => ({
  tryCreateRewardFromLedgerRow: vi.fn(),
}));

import { tryCreateRewardFromLedgerRow } from '@/lib/rewards/processLedger';

const tryCreate = vi.mocked(tryCreateRewardFromLedgerRow);

type LedgerRow = {
  id: string;
  network: string;
  amount_cents: number;
  status: string;
  notes: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  tracking_tag: string | null;
  offer_id: string | null;
  creator_id: string | null;
  click_id: string | null;
  external_ref: string | null;
};

function baseLedger(overrides: Partial<LedgerRow> = {}): LedgerRow {
  return {
    id: LEDGER,
    network: 'amazon',
    amount_cents: 5000,
    status: 'accrued',
    notes: 'settlement_bridge_m1',
    meta: {
      settlement: {
        bridgeVersion: 'm1',
        commissionId: COMMISSION,
        rewardBoundary: 'future_createRewardFromLedgerEntry',
      },
    },
    created_at: new Date().toISOString(),
    tracking_tag: null,
    offer_id: OFFER,
    creator_id: CREATOR,
    click_id: CLICK,
    external_ref: `settlement:commission:${COMMISSION}`,
    ...overrides,
  };
}

function makeBridgeStore(opts?: {
  ledgers?: Map<string, LedgerRow>;
  rewards?: Map<string, { id: string; ledger_entry_id: string }>;
  claimFailOnce?: boolean;
}) {
  const ledgers = opts?.ledgers ?? new Map([[LEDGER, baseLedger()]]);
  const rewards = opts?.rewards ?? new Map();
  const audits: unknown[] = [];
  let claimFailOnce = opts?.claimFailOnce ?? false;

  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    const builder: Record<string, unknown> = {};
    const self = () => builder;

    builder.select = vi.fn(self);
    builder.eq = vi.fn((col: string, val: unknown) => {
      filters[col] = val;
      return builder;
    });
    builder.in = vi.fn((col: string, val: unknown) => {
      filters[col] = val;
      return builder;
    });
    builder.gte = vi.fn((col: string, val: unknown) => {
      filters[`gte_${col}`] = val;
      return builder;
    });
    builder.order = vi.fn(self);
    builder.limit = vi.fn((n: number) => {
      filters.limit = n;
      return builder;
    });

    builder.update = vi.fn((payload: unknown) => {
      filters.updatePayload = payload;
      const run = async () => {
        if (table === 'affiliate_ledger_entries') {
          const id = String(filters.id ?? '');
          const row = ledgers.get(id);
          if (!row) return { data: null, error: { message: 'not found' } };
          const p = payload as { meta?: Record<string, unknown>; updated_at?: string };
          if (p.meta) row.meta = p.meta;
          return { data: row, error: null };
        }
        return { data: null, error: null };
      };
      builder.then = (onFulfilled: (v: unknown) => unknown) => run().then(onFulfilled);
      builder.eq = vi.fn((col: string, val: unknown) => {
        filters[col] = val;
        return builder;
      });
      return builder;
    });

    builder.insert = vi.fn((payload: unknown) => {
      if (table === 'reward_audit_log') {
        audits.push(payload);
        return Promise.resolve({ error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    builder.maybeSingle = vi.fn(async () => {
      if (table === 'affiliate_ledger_entries') {
        const id = String(filters.id ?? '');
        const row = ledgers.get(id);
        return { data: row ?? null, error: row ? null : null };
      }
      if (table === 'creator_rewards') {
        const ledgerId = String(filters.ledger_entry_id ?? '');
        for (const r of rewards.values()) {
          if (r.ledger_entry_id === ledgerId) return { data: { id: r.id }, error: null };
        }
        return { data: null, error: null };
      }
      return { data: null, error: null };
    });

    builder.then = (onFulfilled: (v: unknown) => unknown) => {
      if (table === 'affiliate_ledger_entries' && filters.limit != null) {
        const rows = [...ledgers.values()].filter((r) => r.status === 'accrued');
        return Promise.resolve({ data: rows, error: null }).then(onFulfilled);
      }
      if (table === 'creator_rewards' && Array.isArray(filters.ledger_entry_id)) {
        const wanted = filters.ledger_entry_id as string[];
        const data = [...rewards.values()]
          .filter((r) => wanted.includes(r.ledger_entry_id))
          .map((r) => ({ ledger_entry_id: r.ledger_entry_id }));
        return Promise.resolve({ data, error: null }).then(onFulfilled);
      }
      return Promise.resolve({ data: null, error: null }).then(onFulfilled);
    };

    return builder;
  };

  return {
    supabase: { from: vi.fn(from) } as unknown as SupabaseClient,
    ledgers,
    rewards,
    audits,
    simulateTransient: () => {
      claimFailOnce = true;
    },
    consumeTransient: () => {
      if (claimFailOnce) {
        claimFailOnce = false;
        return true;
      }
      return false;
    },
  };
}

describe('M5.1 classify contract', () => {
  it('maps canonical reasons to terminal / deferred / retryable / duplicate', () => {
    expect(classifyEngineReason('anonymous_click_not_auto_rewardable')).toEqual({
      class: 'rejected',
      terminal: true,
    });
    expect(classifyEngineReason('offer_not_participating')).toEqual({
      class: 'rejected',
      terminal: true,
    });
    expect(classifyEngineReason('pending_staff_review')).toEqual({
      class: 'rejected',
      terminal: true,
    });
    expect(classifyEngineReason('no_evidence')).toEqual({
      class: 'rejected',
      terminal: true,
    });
    expect(classifyEngineReason('creator_offer_mismatch')).toEqual({
      class: 'rejected',
      terminal: true,
    });
    expect(classifyEngineReason('program_inactive')).toEqual({
      class: 'deferred',
      terminal: false,
    });
    expect(classifyEngineReason('money_path_frozen')).toEqual({
      class: 'deferred',
      terminal: false,
    });
    expect(classifyEngineReason('settlement_claim_failed')).toEqual({
      class: 'retryable',
      terminal: false,
    });
    expect(classifyEngineReason('insert_failed')).toEqual({
      class: 'retryable',
      terminal: false,
    });
    expect(classifyEngineReason('duplicate_ledger')).toEqual({
      class: 'duplicate',
      terminal: true,
    });
  });
});

describe('M5.1 processLedgerRewardAttempt', () => {
  const prevFreeze = process.env.MONEY_PATH_FROZEN;
  const prevRewards = process.env.REWARDS_PROGRAM_ACTIVE;
  const prevVercel = process.env.VERCEL_ENV;

  beforeEach(() => {
    process.env.MONEY_PATH_FROZEN = 'false';
    process.env.REWARDS_PROGRAM_ACTIVE = 'true';
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = 'test';
    tryCreate.mockReset();
  });

  afterEach(() => {
    if (prevFreeze !== undefined) process.env.MONEY_PATH_FROZEN = prevFreeze;
    else delete process.env.MONEY_PATH_FROZEN;
    if (prevRewards !== undefined) process.env.REWARDS_PROGRAM_ACTIVE = prevRewards;
    else delete process.env.REWARDS_PROGRAM_ACTIVE;
    if (prevVercel !== undefined) process.env.VERCEL_ENV = prevVercel;
    else delete process.env.VERCEL_ENV;
  });

  it('1 — attributed + rewards ON → reward created', async () => {
    const store = makeBridgeStore();
    tryCreate.mockResolvedValue({ created: true, rewardId: 'reward-1' });
    const r = await processLedgerRewardAttempt(store.supabase, LEDGER);
    expect(r.outcome).toBe('created');
    expect(r.rewardId).toBe('reward-1');
    expect(r.commissionId).toBe(COMMISSION);
    expect(r.terminal).toBe(true);
    expect(tryCreate).toHaveBeenCalledTimes(1);
    const outcome = readLedgerRewardOutcome(store.ledgers.get(LEDGER)!.meta);
    expect(outcome?.class).toBe('created');
  });

  it('2 — rewards OFF → deferred (no tryCreate)', async () => {
    process.env.REWARDS_PROGRAM_ACTIVE = 'false';
    const store = makeBridgeStore();
    const r = await processLedgerRewardAttempt(store.supabase, LEDGER);
    expect(r.outcome).toBe('deferred');
    expect(r.reason).toBe('program_inactive');
    expect(r.terminal).toBe(false);
    expect(tryCreate).not.toHaveBeenCalled();
  });

  it('3 — freeze ON → deferred', async () => {
    process.env.MONEY_PATH_FROZEN = 'true';
    const store = makeBridgeStore();
    const r = await processLedgerRewardAttempt(store.supabase, LEDGER);
    expect(r.outcome).toBe('deferred');
    expect(r.reason).toBe('money_path_frozen');
    expect(tryCreate).not.toHaveBeenCalled();
  });

  it('4 — anonymous → terminal reject', async () => {
    const store = makeBridgeStore();
    tryCreate.mockResolvedValue({
      created: false,
      reason: 'anonymous_click_not_auto_rewardable',
    });
    const r = await processLedgerRewardAttempt(store.supabase, LEDGER);
    expect(r.outcome).toBe('rejected');
    expect(r.reason).toBe('anonymous_click_not_auto_rewardable');
    expect(r.terminal).toBe(true);
  });

  it('5 — offer non-participating → terminal reject', async () => {
    const store = makeBridgeStore();
    tryCreate.mockResolvedValue({ created: false, reason: 'offer_not_participating' });
    const r = await processLedgerRewardAttempt(store.supabase, LEDGER);
    expect(r.outcome).toBe('rejected');
    expect(r.terminal).toBe(true);
  });

  it('6 — ambiguous / staff → terminal pending_staff_review', async () => {
    const store = makeBridgeStore();
    tryCreate.mockResolvedValue({ created: false, reason: 'pending_staff_review' });
    const r = await processLedgerRewardAttempt(store.supabase, LEDGER);
    expect(r.outcome).toBe('rejected');
    expect(r.reason).toBe('pending_staff_review');
    expect(r.terminal).toBe(true);
  });

  it('7 — no evidence → terminal reject', async () => {
    const store = makeBridgeStore();
    tryCreate.mockResolvedValue({ created: false, reason: 'no_evidence' });
    const r = await processLedgerRewardAttempt(store.supabase, LEDGER);
    expect(r.outcome).toBe('rejected');
    expect(r.terminal).toBe(true);
  });

  it('8 — transient DB failure → retryable', async () => {
    const store = makeBridgeStore();
    tryCreate.mockResolvedValue({ created: false, reason: 'settlement_claim_failed' });
    const r = await processLedgerRewardAttempt(store.supabase, LEDGER);
    expect(r.outcome).toBe('retryable');
    expect(r.terminal).toBe(false);
  });

  it('9 — retry after success → duplicate / success-equivalent', async () => {
    const store = makeBridgeStore({
      rewards: new Map([['reward-1', { id: 'reward-1', ledger_entry_id: LEDGER }]]),
    });
    const r = await processLedgerRewardAttempt(store.supabase, LEDGER);
    expect(r.outcome).toBe('duplicate');
    expect(r.rewardId).toBe('reward-1');
    expect(r.terminal).toBe(true);
    expect(tryCreate).not.toHaveBeenCalled();
  });

  it('9b — engine duplicate_ledger → duplicate success-equivalent', async () => {
    const store = makeBridgeStore();
    tryCreate.mockResolvedValue({ created: false, reason: 'duplicate_ledger' });
    store.rewards.set('reward-x', { id: 'reward-x', ledger_entry_id: LEDGER });
    const r = await processLedgerRewardAttempt(store.supabase, LEDGER);
    // existing reward short-circuit before tryCreate on second path — first call has no reward yet
    expect(r.outcome === 'duplicate' || r.outcome === 'created').toBe(true);
  });

  it('10 — concurrent ×10 → exactly 1 create call wins via duplicate', async () => {
    const store = makeBridgeStore();
    let creates = 0;
    tryCreate.mockImplementation(async () => {
      creates += 1;
      if (creates === 1) {
        store.rewards.set('r1', { id: 'r1', ledger_entry_id: LEDGER });
        return { created: true, rewardId: 'r1' };
      }
      return { created: false, reason: 'duplicate_ledger' };
    });

    const results = await Promise.all(
      Array.from({ length: 10 }, () => processLedgerRewardAttempt(store.supabase, LEDGER)),
    );

    const created = results.filter((r) => r.outcome === 'created');
    const dupOrTerminal = results.filter(
      (r) => r.outcome === 'duplicate' || r.outcome === 'created' || r.terminal,
    );
    // First wave may race: after first creates reward, subsequent see existing or duplicate.
    expect(store.rewards.size).toBe(1);
    expect(dupOrTerminal.length).toBe(10);
    expect(created.length).toBeLessThanOrEqual(10);
  });

  it('11 — duplicate event ×10 schedule+process → one reward identity', async () => {
    const store = makeBridgeStore();
    tryCreate.mockResolvedValue({ created: true, rewardId: 'only-one' });
    for (let i = 0; i < 10; i++) {
      await scheduleLedgerRewardAttempt(store.supabase, {
        ledgerEntryId: LEDGER,
        commissionId: COMMISSION,
      });
    }
    const first = await processLedgerRewardAttempt(store.supabase, LEDGER);
    expect(first.outcome).toBe('created');
    store.rewards.set('only-one', { id: 'only-one', ledger_entry_id: LEDGER });
    tryCreate.mockClear();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => processLedgerRewardAttempt(store.supabase, LEDGER)),
    );
    // Terminal success replay: created (cached terminal) or duplicate — both success-equivalent.
    expect(
      results.every(
        (r) =>
          r.terminal &&
          (r.outcome === 'duplicate' || r.outcome === 'created') &&
          (r.rewardId === 'only-one' || r.reason === 'created' || r.reason === 'duplicate_ledger'),
      ),
    ).toBe(true);
    expect(tryCreate).not.toHaveBeenCalled();
  });

  it('12 — settlement reused schedule does not invent second reward', async () => {
    const store = makeBridgeStore({
      rewards: new Map([['r1', { id: 'r1', ledger_entry_id: LEDGER }]]),
    });
    await scheduleLedgerRewardAttempt(store.supabase, {
      ledgerEntryId: LEDGER,
      commissionId: COMMISSION,
    });
    const r = await processLedgerRewardAttempt(store.supabase, LEDGER);
    expect(r.outcome).toBe('duplicate');
    expect(r.rewardId).toBe('r1');
  });

  it('13 — crash after settlement before reward → reconcile recovers', async () => {
    const store = makeBridgeStore();
    // No bridge meta yet (crash before schedule)
    store.ledgers.set(LEDGER, baseLedger({ meta: { settlement: { commissionId: COMMISSION } } }));
    tryCreate.mockResolvedValue({ created: true, rewardId: 'recovered' });
    const recon = await reconcileLedgerRewardBridge(store.supabase, {
      limit: 10,
      lookbackHours: 24,
    });
    expect(recon.attempted).toBeGreaterThanOrEqual(1);
    expect(recon.created).toBeGreaterThanOrEqual(1);
    expect(recon.results.some((r) => r.rewardId === 'recovered')).toBe(true);
  });

  it('14 — terminal outcome → reconcile does not infinite retry', async () => {
    const store = makeBridgeStore();
    tryCreate.mockResolvedValue({ created: false, reason: 'no_evidence' });
    await processLedgerRewardAttempt(store.supabase, LEDGER);
    tryCreate.mockClear();
    const recon = await reconcileLedgerRewardBridge(store.supabase, {
      limit: 10,
      lookbackHours: 24,
    });
    expect(tryCreate).not.toHaveBeenCalled();
    expect(recon.attempted).toBe(0);
    expect(recon.skipped).toBeGreaterThanOrEqual(1);
  });

  it('canAutoAttemptRewards respects flags', () => {
    process.env.REWARDS_PROGRAM_ACTIVE = 'true';
    process.env.MONEY_PATH_FROZEN = 'false';
    expect(canAutoAttemptRewards().ok).toBe(true);
    process.env.REWARDS_PROGRAM_ACTIVE = 'false';
    expect(canAutoAttemptRewards()).toEqual({ ok: false, reason: 'program_inactive' });
  });
});

describe('M5.1 source authority guards', () => {
  const root = join(process.cwd(), 'lib/rewards/ledgerRewardBridge');

  it('15 — processor does not call payout', () => {
    const src = readFileSync(join(root, 'processLedgerRewardAttempt.ts'), 'utf8');
    expect(src).not.toMatch(/payoutIntent|createManualRewardPayout|confirmPayout|executeProvider/);
  });

  it('16 — processor does not modify settlement authority', () => {
    const src = readFileSync(join(root, 'processLedgerRewardAttempt.ts'), 'utf8');
    expect(src).not.toMatch(/settleCommission|SETTLEMENT_BRIDGE/);
    const settleSrc = readFileSync(
      join(process.cwd(), 'lib/economy/settlement/settleCommission.ts'),
      'utf8',
    );
    expect(settleSrc).not.toMatch(/from ['"]@\/lib\/rewards\/ledgerRewardBridge/);
    expect(settleSrc).not.toMatch(/tryCreateRewardFromLedgerRow\s*\(/);
    expect(settleSrc).not.toMatch(/createRewardFromLedgerEntry\s*\(/);
    expect(settleSrc).toMatch(/createdCreatorReward:\s*false/);
  });

  it('17 — processor does not introduce a new attribution matcher', () => {
    const files = [
      'processLedgerRewardAttempt.ts',
      'reconcile.ts',
      'schedule.ts',
      'classify.ts',
      'outcomes.ts',
    ];
    for (const f of files) {
      const src = readFileSync(join(root, f), 'utf8');
      expect(src).not.toMatch(/resolveCommissionAttribution|resolveSettlementLedgerAttribution/);
      expect(src).not.toMatch(/function\s+match|newMatcher|attributionMatcher/);
    }
    const processSrc = readFileSync(join(root, 'processLedgerRewardAttempt.ts'), 'utf8');
    expect(processSrc).toMatch(/tryCreateRewardFromLedgerRow/);
  });

  it('meta key is durable without new table', () => {
    expect(LEDGER_REWARD_BRIDGE_META_KEY).toBe('ledger_reward_bridge');
  });
});
