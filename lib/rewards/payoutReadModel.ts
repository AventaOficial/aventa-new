/**
 * User-facing reward label. "Entregada" requires the full local payout evidence.
 * Economic status and this label are not the same claim.
 */

export type RewardUiStatus = 'validating' | 'available' | 'delivered' | 'cancelled' | 'synthetic';

export type PayoutCertification = {
  intentSucceeded: boolean;
  rewardPaidAudit: boolean;
  payoutIntentSucceededAudit: boolean;
};

export const EMPTY_PAYOUT_CERTIFICATION: PayoutCertification = {
  intentSucceeded: false,
  rewardPaidAudit: false,
  payoutIntentSucceededAudit: false,
};

export function isCertifiedPaidReward(certification: PayoutCertification): boolean {
  return (
    certification.intentSucceeded &&
    certification.rewardPaidAudit &&
    certification.payoutIntentSucceededAudit
  );
}

export function presentCreatorReward(input: {
  status: string;
  synthetic: boolean;
  certification?: PayoutCertification;
}): { uiStatus: RewardUiStatus; label: string } {
  if (input.synthetic) {
    if (input.status === 'PAID') {
      return { uiStatus: 'synthetic', label: 'Prueba QA (no es pago real)' };
    }
    return { uiStatus: 'synthetic', label: 'Registro de prueba' };
  }

  const certification = input.certification ?? EMPTY_PAYOUT_CERTIFICATION;
  switch (input.status) {
    case 'PAID':
      if (isCertifiedPaidReward(certification)) {
        return { uiStatus: 'delivered', label: 'Entregada' };
      }
      return { uiStatus: 'validating', label: 'En validación' };
    case 'CANCELLED':
      return { uiStatus: 'cancelled', label: 'Cancelada' };
    case 'REVERSED':
      return { uiStatus: 'cancelled', label: 'Revertida' };
    case 'AVAILABLE':
      return { uiStatus: 'available', label: 'Lista' };
    case 'PENDING':
    case 'VALIDATING':
    default:
      return { uiStatus: 'validating', label: 'En validación' };
  }
}
