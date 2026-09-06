import { describe, it, expect } from 'vitest';
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
    distinctVotersReliable: true,
    accountAgeDays: 30,
    isBanned: false,
    ...over,
  };
}

describe('qualitySignals / isEligibleForRewardUnlock (P0-1 hard gates)', () => {
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

  it('15+15 + quality V1 = elegible', () => {
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

  it('tasa de aprobación baja bloquea (hard gate 50%)', () => {
    const progress = computeRewardsProgress(15, 15);
    const q = evaluateQualityGates(
      baseSignals({
        approvedCount: 6,
        rejectedCount: 6,
        submittedDecisionCount: 12,
        approvalRate: 0.5,
        // 0.5 exact passes; force fail:
      }),
    );
    // 50% exact is OK — use below threshold
    const qFail = evaluateQualityGates(
      baseSignals({
        approvedCount: 5,
        rejectedCount: 7,
        submittedDecisionCount: 12,
        approvalRate: 5 / 12,
      }),
    );
    expect(q.ok).toBe(true);
    expect(qFail.ok).toBe(false);
    expect(isEligibleForRewardUnlock(progress, qFail).eligible).toBe(false);
  });

  it('menos de 5 decisiones = fail-closed', () => {
    const q = evaluateQualityGates(
      baseSignals({
        approvedCount: 3,
        rejectedCount: 1,
        submittedDecisionCount: 4,
        approvalRate: 0.75,
      }),
    );
    expect(q.ok).toBe(false);
    expect(q.reasonCode).toBe('insufficient_decisions');
  });

  it('distinct unreliable = fail-closed', () => {
    const q = evaluateQualityGates(baseSignals({ distinctVotersReliable: false }));
    expect(q.ok).toBe(false);
    expect(q.reasonCode).toBe('distinct_voters_unreliable');
  });
});
