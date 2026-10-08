/**
 * Identidad de pago. No recolecta datos.
 * El perfil sigue en NOT_STARTED mientras la compuerta de payout está cerrada.
 */

export const PAYMENT_IDENTITY_STATES = [
  'NOT_STARTED',
  'PROFILE_REQUIRED',
  'TAX_DATA_REQUIRED',
  'PAYMENT_DATA_REQUIRED',
  'VERIFICATION_PENDING',
  'VERIFIED',
  'BLOCKED',
  'EXPIRED',
] as const;

export type PaymentIdentityState = (typeof PAYMENT_IDENTITY_STATES)[number];

const TRANSITIONS: Record<PaymentIdentityState, readonly PaymentIdentityState[]> = {
  NOT_STARTED: ['PROFILE_REQUIRED', 'BLOCKED'],
  PROFILE_REQUIRED: ['TAX_DATA_REQUIRED', 'BLOCKED'],
  TAX_DATA_REQUIRED: ['PAYMENT_DATA_REQUIRED', 'BLOCKED'],
  PAYMENT_DATA_REQUIRED: ['VERIFICATION_PENDING', 'BLOCKED'],
  VERIFICATION_PENDING: ['VERIFIED', 'BLOCKED', 'EXPIRED'],
  VERIFIED: ['EXPIRED', 'BLOCKED'],
  BLOCKED: [],
  EXPIRED: ['PROFILE_REQUIRED'],
};

export function canTransitionPaymentIdentity(from: PaymentIdentityState, to: PaymentIdentityState): boolean {
  return from !== to && TRANSITIONS[from].includes(to);
}

export function paymentDataMayBeCollected(state: PaymentIdentityState, payoutsAllowed: boolean): boolean {
  return payoutsAllowed && (state === 'PAYMENT_DATA_REQUIRED' || state === 'VERIFICATION_PENDING' || state === 'VERIFIED');
}

export function identityAllowsPayout(state: PaymentIdentityState): boolean {
  return state === 'VERIFIED';
}
