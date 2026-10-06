import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { REWARD_STATUSES, REWARDS_CREATOR_SHARE_BPS } from '@/lib/rewards/config';
import {
  activeRewardsRule,
  betaOnboardingSteps,
  isRewardsBetaEnabled,
  isRewardsPayoutEnabled,
  nextBetaStatus,
  resolveRewardsAccess,
  type RewardsBetaMembership,
} from '@/lib/rewards/betaCohort';

function member(status: RewardsBetaMembership['status'], ruleVersion = '2026-10-05'): RewardsBetaMembership {
  return {
    userId: '00000000-0000-4000-8000-000000000001',
    status,
    ruleVersion,
    reason: 'prueba',
    at: '2026-10-05T00:00:00.000Z',
  };
}

describe('cohorte Rewards beta', () => {
  it('un usuario fuera de la beta no ve ni genera economía', () => {
    const access = resolveRewardsAccess({
      programActive: false,
      betaEnabled: true,
      payoutEnabled: false,
      membership: null,
    });
    expect(access.audience).toBe('closed');
    expect(access.canSeeEconomics).toBe(false);
    expect(access.canAccrue).toBe(false);
    expect(access.payoutEnabled).toBe(false);
  });

  it('invitado entra al onboarding y no acumula hasta activar', () => {
    const invited = resolveRewardsAccess({
      programActive: false,
      betaEnabled: true,
      payoutEnabled: true,
      membership: member('invited'),
    });
    expect(invited.needsOnboarding).toBe(true);
    expect(invited.canAccrue).toBe(false);
    const enrolled = resolveRewardsAccess({
      programActive: false,
      betaEnabled: true,
      payoutEnabled: false,
      membership: member('enrolled'),
    });
    expect(enrolled.canAccrue).toBe(true);
    expect(enrolled.canSeeEconomics).toBe(true);
    expect(enrolled.payoutEnabled).toBe(false);
    expect(enrolled.shareBps).toBe(4000);
    expect(enrolled.shareBps).toBe(REWARDS_CREATOR_SHARE_BPS);
  });

  it('suspender, quitar y reingresar no borra el recorrido de estados', () => {
    expect(nextBetaStatus(null, 'invite')).toBe('invited');
    expect(nextBetaStatus('invited', 'enroll')).toBe('enrolled');
    expect(nextBetaStatus('enrolled', 'enroll')).toBe('enrolled');
    expect(nextBetaStatus('enrolled', 'suspend')).toBe('suspended');
    expect(nextBetaStatus('suspended', 'reenroll')).toBe('invited');
    expect(nextBetaStatus('enrolled', 'remove')).toBe('removed');
    expect(nextBetaStatus('removed', 'reenroll')).toBe('invited');
    expect(nextBetaStatus('removed', 'remove')).toBeNull();
  });

  it('el 40% sale de una sola regla y una versión vieja no hereda el porcentaje nuevo', () => {
    expect(activeRewardsRule()).toEqual({ version: '2026-10-05', creatorShareBps: 4000 });
    const current = resolveRewardsAccess({
      programActive: false,
      betaEnabled: true,
      payoutEnabled: false,
      membership: member('enrolled', '2026-10-05'),
    });
    const stale = resolveRewardsAccess({
      programActive: false,
      betaEnabled: true,
      payoutEnabled: false,
      membership: member('enrolled', '2026-01-01'),
    });
    expect(current.shareBps).toBe(4000);
    expect(stale.shareBps).toBeNull();
    expect(stale.ruleVersion).toBe('2026-01-01');
  });

  it('los estados de recompensa no cambian y un pago beta apagado no se habilita dos veces', () => {
    expect(REWARD_STATUSES).toEqual(['PENDING', 'VALIDATING', 'AVAILABLE', 'PAID', 'CANCELLED', 'REVERSED']);
    const first = resolveRewardsAccess({
      programActive: false,
      betaEnabled: true,
      payoutEnabled: false,
      membership: member('enrolled'),
    });
    const second = resolveRewardsAccess({
      programActive: false,
      betaEnabled: true,
      payoutEnabled: false,
      membership: member('enrolled'),
    });
    expect(first.payoutEnabled).toBe(false);
    expect(second.payoutEnabled).toBe(false);
  });

  it('el onboarding muestra el 40% y separa el pago', () => {
    const steps = betaOnboardingSteps(4000);
    expect(steps.map((step) => step.title)).toEqual([
      'Cómo funciona',
      'Cómo generas recompensas',
      'Cómo se calcula tu participación',
      'Cuándo puedes recibirla',
      'Condiciones y validaciones',
      'Activar Rewards',
    ]);
    expect(steps[2]?.body.join(' ')).toContain('Tu participación actual: 40%');
    expect(steps[3]?.body.join(' ')).toContain('Esto todavía no puede pagarse');
    expect(steps[4]?.body.join(' ')).toContain('no calcula');
  });

  it('activar la beta solo cambia la membresía', () => {
    const route = readFileSync('app/api/me/rewards/beta/route.ts', 'utf8');
    expect(route).toContain("action: 'enroll'");
    expect(route).not.toMatch(/createReward|affiliate_ledger|payoutIntent|commission/i);
  });

  it('las banderas de beta y pago nacen apagadas', () => {
    const prevBeta = process.env.REWARDS_BETA_ENABLED;
    const prevPay = process.env.REWARDS_PAYOUT_ENABLED;
    delete process.env.REWARDS_BETA_ENABLED;
    delete process.env.REWARDS_PAYOUT_ENABLED;
    expect(isRewardsBetaEnabled()).toBe(false);
    expect(isRewardsPayoutEnabled()).toBe(false);
    if (prevBeta !== undefined) process.env.REWARDS_BETA_ENABLED = prevBeta;
    if (prevPay !== undefined) process.env.REWARDS_PAYOUT_ENABLED = prevPay;
  });
});
