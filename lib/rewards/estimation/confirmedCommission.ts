/**
 * Una comisión confirmada solo nace de un asiento de ledger real.
 * Una estimación no tiene la marca y no puede entrar a este reparto.
 */
import { splitCommissionCents } from '@/lib/rewards/config';
import { rewardShareBps, type RewardRateContext } from '@/lib/rewards/levels';

const confirmedBrand = Symbol('confirmed_affiliate_commission');

export type ConfirmedAffiliateCommission = {
  readonly cents: number;
  readonly ledgerEntryId: string;
  readonly [confirmedBrand]: true;
};

export type EstimatedAffiliateCommission = {
  readonly kind: 'estimated';
  readonly cents: number;
};

export function estimatedAffiliateCommission(cents: number): EstimatedAffiliateCommission {
  return { kind: 'estimated', cents };
}

/** El ledger ya registró el importe. No acepta una cifra suelta ni una estimación. */
export function confirmedAffiliateCommissionFromLedger(input: {
  ledgerEntryId: string;
  amountCents: number;
}): ConfirmedAffiliateCommission | null {
  const ledgerEntryId = input.ledgerEntryId.trim();
  if (!ledgerEntryId) return null;
  if (!Number.isInteger(input.amountCents) || input.amountCents < 0) return null;
  return {
    cents: input.amountCents,
    ledgerEntryId,
    [confirmedBrand]: true,
  };
}

export function isConfirmedAffiliateCommission(value: unknown): value is ConfirmedAffiliateCommission {
  if (!value || typeof value !== 'object') return false;
  const row = value as ConfirmedAffiliateCommission;
  return row[confirmedBrand] === true && typeof row.ledgerEntryId === 'string' && Number.isInteger(row.cents);
}

/**
 * Rechaza la transición estimación → confirmado.
 * La comisión real entra por confirmedAffiliateCommissionFromLedger.
 */
export function transitionEstimateToConfirmed(estimate: EstimatedAffiliateCommission): never {
  throw new Error(
    estimate.kind === 'estimated'
      ? 'estimated_commission_is_not_confirmed'
      : 'estimated_commission_is_not_confirmed',
  );
}

export function projectRewardFromConfirmedCommission(input: {
  commission: ConfirmedAffiliateCommission;
  reward: RewardRateContext;
}): {
  isEstimate: false;
  basis: 'confirmed_commission';
  withdrawable: false;
  ledgerEntryId: string;
  rewardRateBps: number;
  creatorRewardCents: number;
  platformCents: number;
} {
  if (!isConfirmedAffiliateCommission(input.commission)) {
    throw new Error('confirmed_commission_required');
  }
  const rewardRateBps = rewardShareBps(input.reward);
  const split = splitCommissionCents(input.commission.cents, rewardRateBps);
  return {
    isEstimate: false,
    basis: 'confirmed_commission',
    withdrawable: false,
    ledgerEntryId: input.commission.ledgerEntryId,
    rewardRateBps,
    creatorRewardCents: split.creatorCents,
    platformCents: split.platformCents,
  };
}
