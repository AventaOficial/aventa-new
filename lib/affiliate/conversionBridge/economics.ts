/**
 * Decisión económica a partir de evidencia ya normalizada.
 * No escribe ledger, rewards ni payouts. El puente de settlement existente
 * decide después si la comisión confirmada puede asentarse.
 */

import type { CommissionStatus, ConversionStatus } from '@/lib/economy/types';
import type { CanonicalConversionState, ProviderEvidence } from './contract';
import { commissionStateFor } from './status';
import type { MatchResult } from './match';

export type EconomicDecision = {
  canonicalStatus: CanonicalConversionState;
  dbConversionStatus: ConversionStatus;
  dbCommissionStatus: CommissionStatus | null;
  createConversion: boolean;
  createCommission: boolean;
  transitionConversion: boolean;
  transitionCommission: boolean;
  requestSettlement: boolean;
  requestCompensation: boolean;
  countsAsAventaSale: boolean;
  countsAsConfirmedSale: boolean;
  hunterRewardEligible: boolean;
  payout: false;
};

function decision(partial: Omit<EconomicDecision, 'payout'>): EconomicDecision {
  return { ...partial, payout: false };
}

export function decideEconomics(input: {
  canonicalStatus: CanonicalConversionState;
  match: MatchResult;
  existingStatus: CanonicalConversionState | null;
}): EconomicDecision {
  const commission = commissionStateFor(input.canonicalStatus);
  const hunterRewardEligible = input.match.hunterRewardEligible && input.canonicalStatus === 'CONFIRMED';
  const confirmed = input.canonicalStatus === 'CONFIRMED';
  const reversingConfirmed = input.canonicalStatus === 'REVERSED' && input.existingStatus === 'CONFIRMED';
  const dbConversionStatus = reversingConfirmed || (input.existingStatus == null && input.canonicalStatus === 'REVERSED')
    ? 'reversed'
    : input.canonicalStatus === 'REVERSED'
      ? 'rejected'
      : dbConversion(input.canonicalStatus);
  const dbCommissionStatus = reversingConfirmed
    ? 'reversed'
    : input.canonicalStatus === 'REVERSED'
      ? 'rejected'
      : dbCommission(commission);

  if (input.existingStatus == null) {
    return decision({
      canonicalStatus: input.canonicalStatus,
      dbConversionStatus,
      dbCommissionStatus,
      createConversion: true,
      createCommission: dbCommissionStatus != null,
      transitionConversion: false,
      transitionCommission: false,
      requestSettlement: confirmed,
      requestCompensation: false,
      countsAsAventaSale: confirmed,
      countsAsConfirmedSale: confirmed,
      hunterRewardEligible,
    });
  }

  const same = input.existingStatus === input.canonicalStatus;
  return decision({
    canonicalStatus: input.canonicalStatus,
    dbConversionStatus,
    dbCommissionStatus,
    createConversion: false,
    createCommission: false,
    transitionConversion: !same,
    transitionCommission: !same && dbCommissionStatus != null,
    requestSettlement: !same && confirmed,
    requestCompensation: reversingConfirmed,
    countsAsAventaSale: confirmed || reversingConfirmed,
    countsAsConfirmedSale: confirmed,
    hunterRewardEligible,
  });
}

export function dbConversion(status: CanonicalConversionState): ConversionStatus {
  if (status === 'CONFIRMED') return 'confirmed';
  if (status === 'REVERSED') return 'reversed';
  if (status === 'INVALID') return 'rejected';
  return 'pending';
}

export function dbCommission(status: ReturnType<typeof commissionStateFor>): CommissionStatus | null {
  if (status === 'CONFIRMED') return 'approved';
  if (status === 'REVERSED') return 'reversed';
  if (status === 'PENDING') return 'pending';
  return null;
}

export function evidencePayload(
  evidence: ProviderEvidence,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  return {
    provider: evidence.provider,
    source_mode: evidence.source_mode,
    source_batch_id: evidence.source_batch_id,
    source_row_reference: evidence.source_row_reference,
    external_conversion_id: evidence.external_conversion_id,
    external_order_id: evidence.external_order_id,
    imported_at: evidence.imported_at,
    provider_event_version: evidence.provider_event_version,
    ...extra,
  };
}
