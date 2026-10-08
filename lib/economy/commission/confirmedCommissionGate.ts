/**
 * Solo una comisión confirmada puede entrar al cálculo de recompensa.
 * Un clic, una conversión sin confirmar o una estimación no alcanzan.
 */

import type { CommissionStatus } from '@/lib/economy/types';

export const COMMISSION_LIFECYCLE = [
  'CLICK',
  'ATTRIBUTED',
  'CONVERSION_OBSERVED',
  'COMMISSION_PENDING',
  'COMMISSION_CONFIRMED',
  'COMMISSION_REVERSED',
] as const;

export type CommissionLifecycleState = (typeof COMMISSION_LIFECYCLE)[number];

export function projectCommissionLifecycle(status: CommissionStatus): CommissionLifecycleState {
  if (status === 'approved') return 'COMMISSION_CONFIRMED';
  if (status === 'reversed' || status === 'rejected') return 'COMMISSION_REVERSED';
  return 'COMMISSION_PENDING';
}

export function commissionMayFundReward(status: CommissionStatus): boolean {
  return projectCommissionLifecycle(status) === 'COMMISSION_CONFIRMED';
}

export function economicIdempotencyKey(input: {
  source: string;
  sourceEventId: string;
  kind: string;
}): string {
  return [input.kind, input.source, input.sourceEventId]
    .map((part) => part.trim())
    .join(':')
    .slice(0, 200);
}
