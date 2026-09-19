/**
 * Deterministic ledger external_ref for settlement.
 * Independent of process, clock, and random IDs.
 */

import { SETTLEMENT_EXTERNAL_REF_PREFIX } from './types';

export function buildSettlementExternalRef(commissionId: string): string {
  const id = commissionId.trim().toLowerCase();
  if (!id) {
    throw new Error('settlement_external_ref_requires_commission_id');
  }
  return `${SETTLEMENT_EXTERNAL_REF_PREFIX}${id}`;
}

export function parseSettlementCommissionId(
  externalRef: string | null | undefined,
): string | null {
  const raw = (externalRef ?? '').trim().toLowerCase();
  if (!raw.startsWith(SETTLEMENT_EXTERNAL_REF_PREFIX)) return null;
  const id = raw.slice(SETTLEMENT_EXTERNAL_REF_PREFIX.length).trim();
  return id || null;
}
