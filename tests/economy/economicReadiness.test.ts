import { describe, expect, it } from 'vitest';
import {
  CURRENT_ECONOMIC_ACTIVATION,
  evaluateEconomicActivationGate,
} from '@/lib/economy/activation/economicActivationGate';
import {
  commissionMayFundReward,
  economicIdempotencyKey,
  projectCommissionLifecycle,
} from '@/lib/economy/commission/confirmedCommissionGate';
import { compareFiscalScenarios, executeFiscalPolicy } from '@/lib/economy/fiscal/fiscalEngine';
import { CURRENT_FISCAL_POLICY, selectFiscalPolicy, type FiscalPolicyVersion } from '@/lib/economy/fiscal/fiscalPolicy';
import {
  canTransitionPaymentIdentity,
  identityAllowsPayout,
  paymentDataMayBeCollected,
} from '@/lib/economy/identity/paymentIdentity';
import { creatorRewardActorDecision, evaluateEconomicRisk } from '@/lib/economy/risk/economicRisk';
import { projectRewardHold } from '@/lib/economy/rewards/rewardHoldLifecycle';
import { resolvePayoutProvider } from '@/lib/rewards/payoutIntent/resolveProvider';

const activePolicy: FiscalPolicyVersion = {
  id: 'fixture-v1',
  effectiveFrom: '2026-01-01T00:00:00.000Z',
  jurisdiction: 'TEST',
  recipientType: 'FIXTURE',
  activityClassification: 'FIXTURE',
  status: 'ACTIVE',
  withholdingBps: 1000,
  adjustmentBps: 0,
  documentation: ['fixture'],
  payoutRequirements: ['fixture'],
};

describe('economic activation gate', () => {
  it('mantiene el payout bloqueado aunque el entorno pida lo contrario', () => {
    const previous = {
      frozen: process.env.MONEY_PATH_FROZEN,
      program: process.env.REWARDS_PROGRAM_ACTIVE,
      payout: process.env.REWARDS_PAYOUT_ENABLED,
    };
    process.env.MONEY_PATH_FROZEN = 'false';
    process.env.REWARDS_PROGRAM_ACTIVE = 'true';
    process.env.REWARDS_PAYOUT_ENABLED = 'true';
    try {
      const gate = evaluateEconomicActivationGate();
      expect(gate.payout).toBe('BLOCKED');
      expect(gate.payoutsAllowed).toBe(false);
      expect(gate.fiscalPolicy).toBe('UNCONFIRMED');
      expect(gate.missing).toHaveLength(12);
    } finally {
      if (previous.frozen === undefined) delete process.env.MONEY_PATH_FROZEN;
      else process.env.MONEY_PATH_FROZEN = previous.frozen;
      if (previous.program === undefined) delete process.env.REWARDS_PROGRAM_ACTIVE;
      else process.env.REWARDS_PROGRAM_ACTIVE = previous.program;
      if (previous.payout === undefined) delete process.env.REWARDS_PAYOUT_ENABLED;
      else process.env.REWARDS_PAYOUT_ENABLED = previous.payout;
    }
  });

  it('solo abre payout si todos los requisitos y la política fiscal están activos', () => {
    const open = Object.fromEntries(
      Object.keys(CURRENT_ECONOMIC_ACTIVATION).map((id) => [id, true]),
    ) as typeof CURRENT_ECONOMIC_ACTIVATION;
    expect(evaluateEconomicActivationGate(open, 'UNCONFIRMED').payoutsAllowed).toBe(false);
    expect(evaluateEconomicActivationGate(open, 'ACTIVE').payout).toBe('ALLOWED');
  });
});

describe('fiscal engine', () => {
  it('no calcula neto con la política sin confirmar', () => {
    const result = executeFiscalPolicy(10_000, CURRENT_FISCAL_POLICY);
    expect(result.presentation).toBe('SIMULATED');
    expect(result.netPayableCents).toBeNull();
    expect(result.withholdingCents).toBeNull();
  });

  it('los escenarios nombrados no inventan una tasa', () => {
    const rows = compareFiscalScenarios(25_000);
    expect(rows.map((row) => row.scenario.label)).toEqual([
      'PF_RESICO',
      'PF_ACTIVIDAD_EMPRESARIAL',
      'PM_RESICO',
    ]);
    for (const row of rows) {
      expect(row.scenario.presentation).toBe('SIMULATED');
      expect(row.withholdingCents).toBeNull();
      expect(row.estimatedNetCents).toBeNull();
    }
  });

  it('una política activa explícita es determinista y no reescribe otra versión', () => {
    const first = executeFiscalPolicy(10_000, activePolicy);
    const second = executeFiscalPolicy(10_000, { ...activePolicy, id: 'fixture-v2', withholdingBps: 500 });
    expect(first).toMatchObject({ withholdingCents: 1000, netPayableCents: 9000, presentation: 'ACTIVE_POLICY' });
    expect(second.withholdingCents).toBe(500);
    expect(first.policyId).toBe('fixture-v1');
  });

  it('elige la política activa vigente y cae a UNCONFIRMED si no hay ninguna', () => {
    const later: FiscalPolicyVersion = { ...activePolicy, id: 'later', effectiveFrom: '2026-06-01T00:00:00.000Z' };
    expect(selectFiscalPolicy([activePolicy, later], new Date('2026-07-01T00:00:00.000Z')).id).toBe('later');
    expect(selectFiscalPolicy([CURRENT_FISCAL_POLICY], new Date('2026-07-01T00:00:00.000Z')).status).toBe('UNCONFIRMED');
  });
});

describe('commission, identity, risk and holds', () => {
  it('solo la comisión confirmada financia una recompensa', () => {
    expect(commissionMayFundReward('approved')).toBe(true);
    expect(commissionMayFundReward('pending')).toBe(false);
    expect(commissionMayFundReward('reported')).toBe(false);
    expect(projectCommissionLifecycle('reversed')).toBe('COMMISSION_REVERSED');
  });

  it('la clave de idempotencia es estable y no colisiona entre eventos', () => {
    const key = economicIdempotencyKey({ source: 'amazon', sourceEventId: 'order-1', kind: 'commission' });
    expect(key).toBe(economicIdempotencyKey({ source: 'amazon', sourceEventId: 'order-1', kind: 'commission' }));
    expect(key).not.toBe(economicIdempotencyKey({ source: 'amazon', sourceEventId: 'order-2', kind: 'commission' }));
  });

  it('no pide datos de pago antes de la elegibilidad', () => {
    expect(paymentDataMayBeCollected('NOT_STARTED', false)).toBe(false);
    expect(paymentDataMayBeCollected('PAYMENT_DATA_REQUIRED', false)).toBe(false);
    expect(paymentDataMayBeCollected('PAYMENT_DATA_REQUIRED', true)).toBe(true);
    expect(canTransitionPaymentIdentity('NOT_STARTED', 'VERIFIED')).toBe(false);
    expect(identityAllowsPayout('VERIFIED')).toBe(true);
    expect(identityAllowsPayout('VERIFICATION_PENDING')).toBe(false);
  });

  it('máquina, sistema y desconocido no reciben recompensa humana', () => {
    expect(creatorRewardActorDecision('HUMAN').eligibleForCreatorReward).toBe(true);
    expect(creatorRewardActorDecision('MACHINE_HUNTER').level).toBe('BLOCKED');
    expect(creatorRewardActorDecision('SYSTEM').eligibleForCreatorReward).toBe(false);
    expect(creatorRewardActorDecision('UNKNOWN').reasons).toEqual(['unknown_actor']);
    expect(creatorRewardActorDecision(null).eligibleForCreatorReward).toBe(false);
  });

  it('una señal de riesgo pide revisión y el éxito solo no bloquea', () => {
    expect(evaluateEconomicRisk({ actor: 'HUMAN' }).level).toBe('LOW');
    const review = evaluateEconomicRisk({ actor: 'HUMAN', signals: ['self_attribution'] });
    expect(review.level).toBe('REVIEW');
    expect(review.eligibleForCreatorReward).toBe(false);
  });

  it('AVAILABLE no es pagable mientras la compuerta está cerrada', () => {
    const gate = evaluateEconomicActivationGate();
    expect(projectRewardHold('AVAILABLE', gate)).toMatchObject({
      state: 'FISCAL_REVIEW',
      payoutEligible: false,
    });
    expect(projectRewardHold('PENDING', gate).state).toBe('PENDING_CONFIRMATION');
    expect(projectRewardHold('PAID', gate).state).toBe('PAID');
    expect(projectRewardHold('CANCELLED', gate).payoutEligible).toBe(false);
  });
});

describe('real payout provider', () => {
  it('credenciales completas no abren el proveedor real', () => {
    const result = resolvePayoutProvider({
      PAYOUT_PROVIDER: 'real',
      PAYOUT_PROVIDER_API_URL: 'https://provider.test',
      PAYOUT_PROVIDER_API_KEY: 'secret',
      NODE_ENV: 'test',
      VERCEL_ENV: 'preview',
      MONEY_PATH_FROZEN: 'false',
      REWARDS_PAYOUT_ENABLED: 'true',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('activation_gate_blocked');
  });
});
