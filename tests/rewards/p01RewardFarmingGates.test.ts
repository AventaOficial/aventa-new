/**
 * P0-1 — Reward farming / eligibility hard gates (fail-closed).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeRewardsProgress } from '../../lib/rewards/eligibility';
import {
  evaluateQualityGates,
  isEligibleForRewardUnlock,
  countDistinctPositiveVoters,
  type HunterQualitySignals,
} from '../../lib/rewards/qualitySignals';
import { isRewardsProgramActive } from '../../lib/rewards/programStatus';
import { maybeUnlockRewardsProgram } from '../../lib/rewards/unlock';
import {
  REWARDS_MIN_ACCOUNT_AGE_DAYS,
  REWARDS_MIN_APPROVAL_DECISIONS,
  REWARDS_MIN_APPROVAL_RATE,
  REWARDS_REQUIRED_APPROVED_OFFERS,
  REWARDS_REQUIRED_POSITIVE_VOTES,
} from '../../lib/rewards/config';
import { basicFraudFlags } from '../../lib/rewards/rewardsEngine';
import { isMoneyPathFrozen, MONEY_PATH_FROZEN_CODE } from '../../lib/server/moneyPathFreeze';
import type { SupabaseClient } from '@supabase/supabase-js';

function qualifyingSignals(over: Partial<HunterQualitySignals> = {}): HunterQualitySignals {
  return {
    approvedCount: 15,
    rejectedCount: 0,
    submittedDecisionCount: 15,
    approvalRate: 1,
    distinctPositiveVoters: 15,
    distinctVotersReliable: true,
    accountAgeDays: 7,
    isBanned: false,
    ...over,
  };
}

describe('P0-1 — isRewardsProgramActive (sin legacy OR)', () => {
  const prevR = process.env.REWARDS_PROGRAM_ACTIVE;
  const prevC = process.env.COMMISSION_PROGRAM_ACTIVE;

  afterEach(() => {
    if (prevR !== undefined) process.env.REWARDS_PROGRAM_ACTIVE = prevR;
    else delete process.env.REWARDS_PROGRAM_ACTIVE;
    if (prevC !== undefined) process.env.COMMISSION_PROGRAM_ACTIVE = prevC;
    else delete process.env.COMMISSION_PROGRAM_ACTIVE;
  });

  it('1 — REWARDS_PROGRAM_ACTIVE=true → active', () => {
    process.env.REWARDS_PROGRAM_ACTIVE = 'true';
    delete process.env.COMMISSION_PROGRAM_ACTIVE;
    expect(isRewardsProgramActive()).toBe(true);
  });

  it('2 — REWARDS_PROGRAM_ACTIVE=false → inactive', () => {
    process.env.REWARDS_PROGRAM_ACTIVE = 'false';
    expect(isRewardsProgramActive()).toBe(false);
  });

  it('3 — env ausente → fail-closed', () => {
    delete process.env.REWARDS_PROGRAM_ACTIVE;
    expect(isRewardsProgramActive()).toBe(false);
  });

  it('4 — env inválida → fail-closed', () => {
    process.env.REWARDS_PROGRAM_ACTIVE = 'maybe';
    expect(isRewardsProgramActive()).toBe(false);
  });

  it('5 — COMMISSION ON + Rewards OFF → Rewards inactive', () => {
    delete process.env.REWARDS_PROGRAM_ACTIVE;
    process.env.COMMISSION_PROGRAM_ACTIVE = 'true';
    expect(isRewardsProgramActive()).toBe(false);
  });
});

describe('P0-1 — approved offers gate', () => {
  it('6 — 14 approved → fail', () => {
    const p = computeRewardsProgress(14, 15);
    expect(p.offersProgressMet).toBe(false);
    expect(p.unlockEligible).toBe(false);
  });

  it('7 — 15 approved → pasa gate de ofertas', () => {
    const p = computeRewardsProgress(15, 15);
    expect(p.offersProgressMet).toBe(true);
    expect(p.requiredOffers).toBe(REWARDS_REQUIRED_APPROVED_OFFERS);
  });
});

describe('P0-1 — distinct voters (no suma upvotes)', () => {
  it('8 — 15 upvotes del mismo usuario = 1 distinct → fail', () => {
    const p = computeRewardsProgress(15, 1);
    expect(p.votesProgressMet).toBe(false);
  });

  it('9 — 14 distinct → fail', () => {
    expect(computeRewardsProgress(15, 14).votesProgressMet).toBe(false);
  });

  it('10 — 15 distinct → pasa', () => {
    expect(computeRewardsProgress(15, 15).votesProgressMet).toBe(true);
    expect(computeRewardsProgress(15, 15).requiredVotes).toBe(REWARDS_REQUIRED_POSITIVE_VOTES);
  });

  it('11 — duplicate votes no incrementan (Set semantics en countDistinct)', async () => {
    const votes = [
      { user_id: 'v1' },
      { user_id: 'v1' }, // mismo usuario en otra oferta — Set → 1
      { user_id: 'v2' },
    ];
    const supabase = {
      from: (table: string) => {
        if (table === 'offers') {
          return {
            select: () => ({
              eq: () => ({
                in: async () => ({ data: [{ id: 'o1' }, { id: 'o2' }], error: null }),
              }),
            }),
          };
        }
        if (table === 'offer_votes') {
          return {
            select: () => ({
              in: () => ({
                gt: async () => ({ data: votes, error: null }),
              }),
            }),
          };
        }
        if (table === 'user_bans') {
          return {
            select: () => ({
              in: async () => ({ data: [], error: null }),
            }),
          };
        }
        throw new Error(table);
      },
    } as unknown as SupabaseClient;

    const r = await countDistinctPositiveVoters(supabase, 'creator');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.count).toBe(2);
  });

  it('12 — negative votes no cuentan (.gt value 0)', async () => {
    const supabase = {
      from: (table: string) => {
        if (table === 'offers') {
          return {
            select: () => ({
              eq: () => ({
                in: async () => ({ data: [{ id: 'o1' }], error: null }),
              }),
            }),
          };
        }
        if (table === 'offer_votes') {
          return {
            select: () => ({
              in: () => ({
                gt: async () => ({ data: [], error: null }), // filtro value>0 → vacío
              }),
            }),
          };
        }
        if (table === 'user_bans') {
          return {
            select: () => ({
              in: async () => ({ data: [], error: null }),
            }),
          };
        }
        throw new Error(table);
      },
    } as unknown as SupabaseClient;
    const r = await countDistinctPositiveVoters(supabase, 'c');
    expect(r.ok && r.count === 0).toBe(true);
  });

  it('13 — banned voters excluidos del distinct count', async () => {
    const supabase = {
      from: (table: string) => {
        if (table === 'offers') {
          return {
            select: () => ({
              eq: () => ({
                in: async () => ({ data: [{ id: 'o1' }], error: null }),
              }),
            }),
          };
        }
        if (table === 'offer_votes') {
          return {
            select: () => ({
              in: () => ({
                gt: async () => ({
                  data: [{ user_id: 'good' }, { user_id: 'banned-u' }],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'user_bans') {
          return {
            select: () => ({
              in: async () => ({
                data: [{ user_id: 'banned-u', expires_at: null }],
                error: null,
              }),
            }),
          };
        }
        throw new Error(table);
      },
    } as unknown as SupabaseClient;
    const r = await countDistinctPositiveVoters(supabase, 'c');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.count).toBe(1);
  });
});

describe('P0-1 — account age', () => {
  it('14 — 6 días → fail', () => {
    const q = evaluateQualityGates(qualifyingSignals({ accountAgeDays: 6 }));
    expect(q.ok).toBe(false);
    expect(q.reasonCode).toBe('account_age');
  });

  it('15 — exactamente 7 días → pasa age', () => {
    const q = evaluateQualityGates(qualifyingSignals({ accountAgeDays: 7 }));
    expect(q.ok).toBe(true);
    expect(REWARDS_MIN_ACCOUNT_AGE_DAYS).toBe(7);
  });

  it('16 — fecha ausente → fail-closed', () => {
    const q = evaluateQualityGates(qualifyingSignals({ accountAgeDays: null }));
    expect(q.ok).toBe(false);
    expect(q.reasonCode).toBe('account_age');
  });
});

describe('P0-1 — approval rate fail-closed', () => {
  it('17 — 4 decisiones → fail (insuficiente)', () => {
    const q = evaluateQualityGates(
      qualifyingSignals({
        approvedCount: 3,
        rejectedCount: 1,
        submittedDecisionCount: 4,
        approvalRate: 0.75,
      }),
    );
    expect(q.ok).toBe(false);
    expect(q.reasonCode).toBe('insufficient_decisions');
    expect(REWARDS_MIN_APPROVAL_DECISIONS).toBe(5);
  });

  it('18 — 5 dec, 2/3 → fail rate', () => {
    const q = evaluateQualityGates(
      qualifyingSignals({
        approvedCount: 2,
        rejectedCount: 3,
        submittedDecisionCount: 5,
        approvalRate: 2 / 5,
      }),
    );
    expect(q.ok).toBe(false);
    expect(q.reasonCode).toBe('approval_rate');
  });

  it('19 — 5 dec, 3/2 → pass', () => {
    const q = evaluateQualityGates(
      qualifyingSignals({
        approvedCount: 3,
        rejectedCount: 2,
        submittedDecisionCount: 5,
        approvalRate: 3 / 5,
      }),
    );
    expect(q.ok).toBe(true);
    expect(REWARDS_MIN_APPROVAL_RATE).toBe(0.5);
  });

  it('20 — 10 dec, 5/5 → pass (50%)', () => {
    const q = evaluateQualityGates(
      qualifyingSignals({
        approvedCount: 5,
        rejectedCount: 5,
        submittedDecisionCount: 10,
        approvalRate: 0.5,
      }),
    );
    expect(q.ok).toBe(true);
  });

  it('21 — 10 dec, 4/6 → fail', () => {
    const q = evaluateQualityGates(
      qualifyingSignals({
        approvedCount: 4,
        rejectedCount: 6,
        submittedDecisionCount: 10,
        approvalRate: 0.4,
      }),
    );
    expect(q.ok).toBe(false);
  });
});

describe('P0-1 — combined eligibility', () => {
  it('22 — todos los gates → unlock eligible', () => {
    const progress = computeRewardsProgress(15, 15);
    const quality = evaluateQualityGates(qualifyingSignals());
    expect(isEligibleForRewardUnlock(progress, quality).eligible).toBe(true);
  });

  it('23 — cualquier gate fail → no unlock', () => {
    const progress = computeRewardsProgress(15, 15);
    expect(
      isEligibleForRewardUnlock(progress, evaluateQualityGates(qualifyingSignals({ isBanned: true })))
        .eligible,
    ).toBe(false);
    expect(
      isEligibleForRewardUnlock(
        progress,
        evaluateQualityGates(qualifyingSignals({ accountAgeDays: 1 })),
      ).eligible,
    ).toBe(false);
    expect(isEligibleForRewardUnlock(computeRewardsProgress(14, 15), evaluateQualityGates(qualifyingSignals())).eligible).toBe(
      false,
    );
  });
});

describe('P0-1 — maybeUnlockRewardsProgram', () => {
  const prevR = process.env.REWARDS_PROGRAM_ACTIVE;
  const prevC = process.env.COMMISSION_PROGRAM_ACTIVE;
  const prevF = process.env.MONEY_PATH_FROZEN;

  beforeEach(() => {
    process.env.REWARDS_PROGRAM_ACTIVE = 'true';
    delete process.env.COMMISSION_PROGRAM_ACTIVE;
    process.env.MONEY_PATH_FROZEN = 'false';
  });

  afterEach(() => {
    if (prevR !== undefined) process.env.REWARDS_PROGRAM_ACTIVE = prevR;
    else delete process.env.REWARDS_PROGRAM_ACTIVE;
    if (prevC !== undefined) process.env.COMMISSION_PROGRAM_ACTIVE = prevC;
    else delete process.env.COMMISSION_PROGRAM_ACTIVE;
    if (prevF !== undefined) process.env.MONEY_PATH_FROZEN = prevF;
    else delete process.env.MONEY_PATH_FROZEN;
  });

  function makeUnlockStore(opts: {
    existingUnlockedAt?: string | null;
    updateCalls?: { count: number };
  }) {
    let unlockedAt: string | null = opts.existingUnlockedAt ?? null;
    const updateCalls = opts.updateCalls ?? { count: 0 };
    const voterIds = Array.from({ length: 15 }, (_, i) => ({ user_id: `v${i}` }));
    const offerIds = Array.from({ length: 15 }, (_, i) => ({ id: `o${i}` }));

    const supabase = {
      from: (table: string) => {
        if (table === 'profiles') {
          return {
            select: (cols: string) => ({
              eq: () => ({
                maybeSingle: async () => {
                  if (cols.includes('created_at') && !cols.includes('reward_program')) {
                    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
                    return { data: { created_at: sevenDaysAgo }, error: null };
                  }
                  return {
                    data: { reward_program_unlocked_at: unlockedAt },
                    error: null,
                  };
                },
              }),
            }),
            update: (payload: { reward_program_unlocked_at?: string }) => ({
              eq: () => ({
                is: async (_col: string, val: null) => {
                  updateCalls.count += 1;
                  if (unlockedAt !== null || val !== null) {
                    return { data: null, error: null };
                  }
                  unlockedAt = payload.reward_program_unlocked_at ?? new Date().toISOString();
                  return { data: null, error: null };
                },
              }),
            }),
          };
        }
        if (table === 'offers') {
          return {
            select: (_cols: string, opts?: { count?: string; head?: boolean }) => ({
              eq: () => ({
                in: async () => {
                  if (opts?.head) {
                    return { count: 15, data: null, error: null };
                  }
                  return { data: offerIds, error: null };
                },
                eq: async () => ({ count: 0, data: null, error: null }), // rejected
              }),
            }),
          };
        }
        if (table === 'offer_votes') {
          return {
            select: () => ({
              in: () => ({
                gt: async () => ({ data: voterIds, error: null }),
              }),
            }),
          };
        }
        if (table === 'user_bans') {
          return {
            select: () => ({
              eq: () => ({
                or: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
              in: async () => ({ data: [], error: null }),
            }),
          };
        }
        if (table === 'reward_audit_logs' || table === 'reward_audit_log') {
          return {
            insert: async () => ({ error: null }),
          };
        }
        // audit may use a helper that hits another table
        return {
          insert: async () => ({ error: null }),
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
              or: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
              in: async () => ({ data: [], error: null }),
            }),
          }),
        };
      },
    } as unknown as SupabaseClient;

    return { supabase, getUnlocked: () => unlockedAt, updateCalls };
  }

  it('2b — program OFF → no unlock nuevo', async () => {
    process.env.REWARDS_PROGRAM_ACTIVE = 'false';
    const store = makeUnlockStore({});
    const r = await maybeUnlockRewardsProgram(store.supabase, 'u1');
    expect(r.unlocked).toBe(false);
    expect(r.blockedReason).toBe('program_inactive');
  });

  it('5b — COMMISSION ON no desbloquea Rewards', async () => {
    delete process.env.REWARDS_PROGRAM_ACTIVE;
    process.env.COMMISSION_PROGRAM_ACTIVE = 'true';
    const store = makeUnlockStore({});
    const r = await maybeUnlockRewardsProgram(store.supabase, 'u1');
    expect(r.unlocked).toBe(false);
    expect(r.blockedReason).toBe('program_inactive');
  });

  it('22b — todos gates + program ON → unlock', async () => {
    const store = makeUnlockStore({});
    const r = await maybeUnlockRewardsProgram(store.supabase, 'u1', 'u1');
    expect(r.unlocked).toBe(true);
    expect(r.unlockedAt).toBeTruthy();
  });

  it('24 — concurrent unlock → un solo write efectivo (CAS .is null)', async () => {
    const updateCalls = { count: 0 };
    const store = makeUnlockStore({ updateCalls });
    const [a, b] = await Promise.all([
      maybeUnlockRewardsProgram(store.supabase, 'u1'),
      maybeUnlockRewardsProgram(store.supabase, 'u1'),
    ]);
    expect(a.unlocked || b.unlocked).toBe(true);
    // Segundo intento ve unlocked existente o CAS no-op
    const again = await maybeUnlockRewardsProgram(store.supabase, 'u1');
    expect(again.unlocked).toBe(true);
    expect(store.getUnlocked()).toBeTruthy();
  });

  it('25 — retry idempotente', async () => {
    const store = makeUnlockStore({});
    const first = await maybeUnlockRewardsProgram(store.supabase, 'u1');
    const second = await maybeUnlockRewardsProgram(store.supabase, 'u1');
    expect(first.unlocked).toBe(true);
    expect(second.unlocked).toBe(true);
    expect(second.unlockedAt).toBe(first.unlockedAt);
  });

  it('26 — existing unlocked → no downgrade', async () => {
    const store = makeUnlockStore({ existingUnlockedAt: '2026-01-01T00:00:00.000Z' });
    const r = await maybeUnlockRewardsProgram(store.supabase, 'u1');
    expect(r.unlocked).toBe(true);
    expect(r.unlockedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('27 — program OFF con unlock histórico → conserva unlocked_at', async () => {
    process.env.REWARDS_PROGRAM_ACTIVE = 'false';
    const store = makeUnlockStore({ existingUnlockedAt: '2026-01-01T00:00:00.000Z' });
    const r = await maybeUnlockRewardsProgram(store.supabase, 'u1');
    expect(r.unlocked).toBe(true);
    expect(r.unlockedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('28 — unlock no crea rewards (solo marca perfil)', async () => {
    const store = makeUnlockStore({});
    const fromSpy = vi.spyOn(store.supabase, 'from');
    await maybeUnlockRewardsProgram(store.supabase, 'u1');
    const tables = fromSpy.mock.calls.map((c) => c[0]);
    expect(tables).not.toContain('creator_rewards');
    expect(tables).not.toContain('ledger_settlements');
  });
});

describe('P0-1 — invariants P0-2/freeze preserved', () => {
  it('29 — P0-2 self_click flag', () => {
    expect(basicFraudFlags({ creatorId: 'a', offerId: 'o', clickerUserId: 'a' })).toContain(
      'self_click',
    );
  });

  it('29b — P0-2 anonymous_click flag', () => {
    expect(
      basicFraudFlags({ creatorId: 'a', offerId: 'o', clickId: 'c1', clickerUserId: null }),
    ).toContain('anonymous_click');
  });

  it('33 — money freeze still readable as frozen when true', () => {
    const prev = process.env.MONEY_PATH_FROZEN;
    process.env.MONEY_PATH_FROZEN = 'true';
    expect(isMoneyPathFrozen()).toBe(true);
    expect(MONEY_PATH_FROZEN_CODE).toBe('money_path_frozen');
    if (prev !== undefined) process.env.MONEY_PATH_FROZEN = prev;
    else delete process.env.MONEY_PATH_FROZEN;
  });
});
