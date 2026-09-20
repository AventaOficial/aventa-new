/**
 * M5.1 — Ledger → Reward bridge contracts.
 * Attribution SoT remains resolveCommissionAttribution via createRewardFromLedgerEntry.
 * Settlement projection is evidence/hint only. No payout. No second matcher.
 */

export const LEDGER_REWARD_BRIDGE_META_KEY = 'ledger_reward_bridge' as const;

export const LEDGER_REWARD_BRIDGE_VERSION = 'm51' as const;

/** Outcome classes persisted on affiliate_ledger_entries.meta */
export type LedgerRewardOutcomeClass =
  | 'pending'
  | 'created'
  | 'duplicate'
  | 'deferred'
  | 'rejected'
  | 'retryable';

export type LedgerRewardAttemptOutcome = {
  version: typeof LEDGER_REWARD_BRIDGE_VERSION;
  class: LedgerRewardOutcomeClass;
  reason: string;
  attempt: number;
  at: string;
  commissionId: string | null;
  rewardId: string | null;
  /** When true, reconcile must not auto-retry. */
  terminal: boolean;
};

export type ProcessLedgerRewardAttemptResult = {
  ledgerEntryId: string;
  outcome: LedgerRewardOutcomeClass;
  reason: string;
  attempt: number;
  rewardId: string | null;
  commissionId: string | null;
  terminal: boolean;
};

export type ReconcileLedgerRewardBridgeResult = {
  scanned: number;
  attempted: number;
  created: number;
  duplicate: number;
  deferred: number;
  rejected: number;
  retryable: number;
  skipped: number;
  results: ProcessLedgerRewardAttemptResult[];
};
