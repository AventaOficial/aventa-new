import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  evaluateQualityGates,
  isEligibleForRewardUnlock,
  type HunterQualitySignals,
} from '../../lib/rewards/qualitySignals';
import { computeRewardsProgress } from '../../lib/rewards/eligibility';

function baseSignals(over: Partial<HunterQualitySignals> = {}): HunterQualitySignals {
  return {
    approvedCount: 15,
    rejectedCount: 0,
    submittedDecisionCount: 15,
    approvalRate: 1,
    distinctPositiveVoters: 20,
    accountAgeDays: 30,
    isBanned: false,
    ...over,
  };
}

describe('qualitySignals / isEligibleForRewardUnlock', () => {
  const prev = { ...process.env };

  beforeEach(() => {
    delete process.env.REWARDS_MIN_APPROVAL_RATE;
    delete process.env.REWARDS_MIN_ACCOUNT_AGE_DAYS;
    delete process.env.REWARDS_MIN_DISTINCT_VOTERS;
  });

  afterEach(() => {
    process.env = { ...prev };
  });

  it('con progreso insuficiente sugiere seguir cazando', () => {
    const progress = computeRewardsProgress(6, 0);
    const q = evaluateQualityGates(baseSignals());
    const r = isEligibleForRewardUnlock(progress, q);
    expect(r.eligible).toBe(false);
    expect(r.userMessage).toMatch(/calidad|cerca/i);
  });

  it('cerca del umbral muestra mensaje de cercanía', () => {
    const progress = computeRewardsProgress(13, 14);
    const q = evaluateQualityGates(baseSignals());
    const r = isEligibleForRewardUnlock(progress, q);
    expect(r.eligible).toBe(false);
    expect(r.userMessage).toContain('cerca');
  });

  it('15+15 sin gates env = elegible', () => {
    const progress = computeRewardsProgress(15, 15);
    const q = evaluateQualityGates(baseSignals());
    const r = isEligibleForRewardUnlock(progress, q);
    expect(r.eligible).toBe(true);
  });

  it('baneado no es elegible', () => {
    const progress = computeRewardsProgress(15, 15);
    const q = evaluateQualityGates(baseSignals({ isBanned: true }));
    expect(q.ok).toBe(false);
    const r = isEligibleForRewardUnlock(progress, q);
    expect(r.eligible).toBe(false);
    expect(r.userMessage).toMatch(/todavía/i);
  });

  it('gate de tasa de aprobación (env) bloquea con historial suficiente', () => {
    process.env.REWARDS_MIN_APPROVAL_RATE = '0.8';
    const progress = computeRewardsProgress(15, 15);
    const q = evaluateQualityGates(
      baseSignals({
        approvedCount: 6,
        rejectedCount: 6,
        submittedDecisionCount: 12,
        approvalRate: 0.5,
      }),
    );
    expect(q.ok).toBe(false);
    expect(isEligibleForRewardUnlock(progress, q).eligible).toBe(false);
  });
});
