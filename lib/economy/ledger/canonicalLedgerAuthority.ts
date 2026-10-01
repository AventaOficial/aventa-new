/**
 * Canonical ledger authority — single economic SoT.
 *
 * Architecture:
 *   Economic events (audit)
 *        ↓
 *   affiliate_ledger_entries (canonical ledger)
 *        ↓
 *   Settlement bridge / Rewards bridges
 *        ↓
 *   Exports / CSV reports (read-only or network-evidence ingest)
 *
 * Network CSV/admin manual POST may INSERT evidence rows into the SAME table
 * with source='csv'|'manual'. They MUST NOT:
 *   - mint creator_rewards
 *   - invent settlement:commission:* refs
 *   - bypass MONEY_PATH_FROZEN
 *
 * Settlement owns commission→ledger. CSV is network evidence, not a second ledger.
 */

export const CANONICAL_LEDGER_TABLE = 'affiliate_ledger_entries' as const;

export const LEDGER_WRITERS = {
  settlementBridge: {
    id: 'settlement_bridge_m1',
    path: 'lib/economy/settlement/settleCommission.ts',
    role: 'canonical_settlement',
    mayMintRewards: false,
    externalRefPrefix: 'settlement:commission:',
  },
  settlementReversal: {
    id: 'settlement_reversal',
    path: 'lib/economy/settlement/reversalContract.ts',
    role: 'compensating_reversal',
    mayMintRewards: false,
    externalRefPrefix: 'settlement:reversal:commission:',
  },
  networkEvidenceCsv: {
    id: 'network_evidence_csv',
    path: 'app/api/admin/affiliate-ledger/import-csv/route.ts',
    role: 'network_evidence_ingest',
    mayMintRewards: false,
    note: 'Same table, source=csv. Never creates rewards. Not a parallel SoT.',
  },
  networkEvidenceManual: {
    id: 'network_evidence_manual',
    path: 'app/api/admin/affiliate-ledger/route.ts#POST',
    role: 'network_evidence_ingest',
    mayMintRewards: false,
    note: 'Same table, source=manual|api. Never creates rewards.',
  },
} as const;

/** Explicit constant — CSV/manual paths must not call rewardsEngine. */
export const NETWORK_EVIDENCE_REWARDS_DISABLED = true as const;

export const SETTLEMENT_EXTERNAL_REF_PREFIX = 'settlement:commission:' as const;
export const SETTLEMENT_REVERSAL_PREFIX = 'settlement:reversal:commission:' as const;

/**
 * Network evidence must not collide with settlement-owned external_ref namespace.
 */
export function isSettlementOwnedExternalRef(ref: string | null | undefined): boolean {
  const r = (ref ?? '').trim().toLowerCase();
  if (!r) return false;
  return (
    r.startsWith(SETTLEMENT_EXTERNAL_REF_PREFIX) ||
    r.startsWith(SETTLEMENT_REVERSAL_PREFIX)
  );
}

export function assertNetworkEvidenceExternalRefAllowed(
  ref: string | null | undefined,
): { ok: true } | { ok: false; error: string } {
  if (isSettlementOwnedExternalRef(ref)) {
    return {
      ok: false,
      error:
        'external_ref reserved for settlement bridge — CSV/manual cannot mint settlement:commission:* or settlement:reversal:*',
    };
  }
  return { ok: true };
}
