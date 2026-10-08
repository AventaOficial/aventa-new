/**
 * Proyección de estados de recompensa sobre los estados ya persistidos.
 * No reescribe filas históricas. AVAILABLE no es pagable si la compuerta está cerrada.
 */

import type { EconomicActivationGate } from '@/lib/economy/activation/economicActivationGate';
import type { RewardStatus } from '@/lib/rewards/config';

export const REWARD_HOLD_STATES = [
  'EARNED',
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'FISCAL_REVIEW',
  'FRAUD_REVIEW',
  'PAYOUT_ELIGIBLE',
  'PAID',
  'CANCELLED',
  'REVERSED',
  'EXPIRED',
  'BLOCKED',
] as const;

export type RewardHoldState = (typeof REWARD_HOLD_STATES)[number];

export type RewardHoldProjection = {
  state: RewardHoldState;
  payoutEligible: boolean;
  reason: string;
};

export function projectRewardHold(
  status: RewardStatus,
  gate: EconomicActivationGate,
  riskBlocked = false,
): RewardHoldProjection {
  if (status === 'CANCELLED') return { state: 'CANCELLED', payoutEligible: false, reason: 'cancelled' };
  if (status === 'REVERSED') return { state: 'REVERSED', payoutEligible: false, reason: 'reversed' };
  if (status === 'PAID') return { state: 'PAID', payoutEligible: false, reason: 'already_paid' };
  if (riskBlocked) return { state: 'BLOCKED', payoutEligible: false, reason: 'risk_blocked' };
  if (status === 'PENDING') return { state: 'PENDING_CONFIRMATION', payoutEligible: false, reason: 'awaiting_confirmation' };
  if (status === 'VALIDATING') return { state: 'CONFIRMED', payoutEligible: false, reason: 'hold' };
  if (!gate.payoutsAllowed || gate.fiscalPolicy !== 'ACTIVE') {
    return { state: 'FISCAL_REVIEW', payoutEligible: false, reason: 'activation_gate' };
  }
  return { state: 'PAYOUT_ELIGIBLE', payoutEligible: true, reason: 'gate_open' };
}
