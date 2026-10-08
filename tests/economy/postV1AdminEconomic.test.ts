import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateEconomicActivationGate } from '@/lib/economy/activation/economicActivationGate';
import { commissionMayFundReward, economicIdempotencyKey, projectCommissionLifecycle } from '@/lib/economy/commission/confirmedCommissionGate';
import { executeFiscalPolicy, compareFiscalScenarios } from '@/lib/economy/fiscal/fiscalEngine';
import { CURRENT_FISCAL_POLICY, FISCAL_SCENARIOS, selectFiscalPolicy } from '@/lib/economy/fiscal/fiscalPolicy';
import { canTransitionPaymentIdentity, identityAllowsPayout, paymentDataMayBeCollected } from '@/lib/economy/identity/paymentIdentity';
import { creatorRewardActorDecision, evaluateEconomicRisk } from '@/lib/economy/risk/economicRisk';
import { projectRewardHold } from '@/lib/economy/rewards/rewardHoldLifecycle';
import { claimEconomicTransition } from '@/lib/economy/rewards/claimTransition';
import { readEconomicState } from '@/lib/economy/economicState';
import { OWNER_NAV_SECTIONS } from '@/lib/owner/navigation';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('post-v1 economía', () => {
  it('solo la comisión confirmada financia recompensa y la clave no se duplica', () => {
    expect(projectCommissionLifecycle('approved')).toBe('COMMISSION_CONFIRMED');
    expect(projectCommissionLifecycle('pending')).toBe('COMMISSION_PENDING');
    expect(projectCommissionLifecycle('reversed')).toBe('COMMISSION_REVERSED');
    expect(commissionMayFundReward('approved')).toBe(true);
    expect(commissionMayFundReward('pending')).toBe(false);
    const key = economicIdempotencyKey({ source: 'amazon', sourceEventId: 'ord-1', kind: 'commission' });
    expect(key).toBe(economicIdempotencyKey({ source: 'amazon', sourceEventId: 'ord-1', kind: 'commission' }));
    expect(key).not.toBe(economicIdempotencyKey({ source: 'ml', sourceEventId: 'ord-1', kind: 'commission' }));
  });

  it('la política sin confirmar no inventa tasa y los escenarios siguen simulados', () => {
    const open = executeFiscalPolicy(10_000);
    expect(open.reason).toBe('policy_unconfirmed');
    expect(open.netPayableCents).toBeNull();
    expect(open.withholdingCents).toBeNull();
    const active = executeFiscalPolicy(10_000, {
      ...CURRENT_FISCAL_POLICY,
      id: 'mx-active-test',
      status: 'ACTIVE',
      effectiveFrom: '2026-01-01',
      withholdingBps: 100,
      adjustmentBps: 0,
    });
    expect(active.reason).toBe('calculated');
    expect(active.withholdingCents).toBe(100);
    expect(active.netPayableCents).toBe(9_900);
    for (const row of compareFiscalScenarios(5_000)) {
      expect(row.scenario.presentation).toBe('SIMULATED');
      expect(row.scenario.legalStatus).toBe('NOT_A_LEGAL_OPINION');
      expect(row.withholdingCents).toBeNull();
    }
    expect(FISCAL_SCENARIOS.map((item) => item.label)).toEqual(['PF_RESICO', 'PF_ACTIVIDAD_EMPRESARIAL', 'PM_RESICO']);
    expect(selectFiscalPolicy([CURRENT_FISCAL_POLICY], new Date()).id).toBe('mx-unconfirmed');
  });

  it('la identidad de pago no pide datos con la compuerta cerrada', () => {
    expect(canTransitionPaymentIdentity('NOT_STARTED', 'PROFILE_REQUIRED')).toBe(true);
    expect(canTransitionPaymentIdentity('NOT_STARTED', 'VERIFIED')).toBe(false);
    expect(identityAllowsPayout('VERIFIED')).toBe(true);
    expect(identityAllowsPayout('BLOCKED')).toBe(false);
    expect(paymentDataMayBeCollected('PAYMENT_DATA_REQUIRED', false)).toBe(false);
    expect(paymentDataMayBeCollected('PAYMENT_DATA_REQUIRED', true)).toBe(true);
    expect(canTransitionPaymentIdentity('VERIFICATION_PENDING', 'EXPIRED')).toBe(true);
  });

  it('máquina, sistema y desconocido no cobran, y una señal manda a revisión', () => {
    expect(creatorRewardActorDecision('HUMAN').eligibleForCreatorReward).toBe(true);
    expect(creatorRewardActorDecision('MACHINE_HUNTER').level).toBe('BLOCKED');
    expect(creatorRewardActorDecision('SYSTEM').level).toBe('BLOCKED');
    expect(creatorRewardActorDecision('UNKNOWN').level).toBe('BLOCKED');
    expect(evaluateEconomicRisk({ actor: 'HUMAN', signals: ['self_attribution'] }).level).toBe('REVIEW');
    expect(evaluateEconomicRisk({ actor: 'HUMAN', signals: ['velocity'] }).eligibleForCreatorReward).toBe(false);
    expect(evaluateEconomicRisk({ actor: 'HUMAN' }).level).toBe('LOW');
  });

  it('el payout sigue congelado y una carrera de cancelación no paga', () => {
    const gate = evaluateEconomicActivationGate();
    expect(gate.payout).toBe('BLOCKED');
    expect(projectRewardHold('AVAILABLE', gate).payoutEligible).toBe(false);
    expect(projectRewardHold('AVAILABLE', gate).state).toBe('FISCAL_REVIEW');
    const state = readEconomicState();
    expect(state).toMatchObject({
      infrastructureReady: true,
      fiscalPolicyStatus: 'UNCONFIRMED',
      payoutStatus: 'FROZEN',
      providerStatus: 'SANDBOX',
    });
    let current = 'CONFIRMED';
    const cancel = claimEconomicTransition(current, 'CONFIRMED', 'CANCELLED');
    if (cancel.ok) current = cancel.next;
    const pay = claimEconomicTransition(current, 'CONFIRMED', 'PAYOUT_ELIGIBLE');
    expect(cancel.ok).toBe(true);
    expect(pay.ok).toBe(false);
    expect(current).toBe('CANCELLED');
  });

  it('el menú del owner no ofrece configuración ni un pago que parezca vivo', () => {
    const hrefs = OWNER_NAV_SECTIONS.flatMap((section) => section.items.map((item) => item.href));
    expect(hrefs).not.toContain('/admin/contexto');
    expect(hrefs).toContain('/admin/owner/economia');
    expect(hrefs).toContain('/admin/owner/payouts');
    const rewards = read('app/admin/rewards/page.tsx');
    const commissions = read('app/admin/commissions/page.tsx');
    expect(rewards).toMatch(/payoutFrozen/);
    expect(rewards).toMatch(/Registrar pago/);
    expect(commissions).toMatch(/payoutFrozen/);
    expect(read('app/admin/contexto/page.tsx')).toMatch(/redirect\('\/admin\/sistemas\/mapa'\)/);
  });
});
