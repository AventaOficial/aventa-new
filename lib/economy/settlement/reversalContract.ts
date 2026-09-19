/**
 * Future reversal campaign contract — emit when approved commission with ledger is reversed.
 * M1: no money movement, no silent void of ledger.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { appendEconomicEvent } from '../appendEconomicEvent';
import { buildSettlementExternalRef } from './externalRef';
import type { SettlementReversalContract } from './types';

export function buildSettlementReversalContract(input: {
  commissionId: string;
  ledgerEntryId: string;
  reversedAt?: string;
}): SettlementReversalContract {
  return {
    kind: 'settlement_reversal_required',
    commissionId: input.commissionId,
    ledgerEntryId: input.ledgerEntryId,
    externalRef: buildSettlementExternalRef(input.commissionId),
    reversedAt: input.reversedAt ?? new Date().toISOString(),
    moneyMovement: 'none_m1',
    note: 'commission_reversed_with_existing_ledger_requires_reconciliation',
  };
}

/**
 * Call after commission → reversed when a ledger link exists.
 * Does not void ledger or claw back rewards (future campaign).
 */
export async function emitSettlementReversalRequired(
  supabase: SupabaseClient,
  input: {
    commissionId: string;
    ledgerEntryId: string;
    actor?: string;
  },
): Promise<SettlementReversalContract> {
  const contract = buildSettlementReversalContract(input);
  await appendEconomicEvent(supabase, {
    entityType: 'settlement',
    entityId: input.commissionId,
    eventType: 'settlement_reversal_required',
    fromStatus: 'approved',
    toStatus: 'reversed',
    actor: input.actor ?? 'settlement_bridge_m1',
    payload: { ...contract },
  });
  return contract;
}
