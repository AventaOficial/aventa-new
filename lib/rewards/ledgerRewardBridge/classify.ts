/**
 * M5.1 — Classify createReward / tryCreateReward reasons into durable outcomes.
 * Uses only canonical reasons already returned by the rewards engine / matcher.
 */

import { isMoneyPathFrozen } from '@/lib/server/moneyPathFreeze';
import { isRewardsProgramActive } from '@/lib/rewards/programStatus';
import type { LedgerRewardOutcomeClass } from './types';

/** Terminal rejects — do not auto-retry. */
const TERMINAL_REASONS = new Set([
  'commission_void',
  'zero_amount',
  'zero_creator_share',
  'anonymous_click_not_auto_rewardable',
  'offer_not_participating',
  'no_evidence',
  'creator_offer_mismatch',
  'pending_staff_review',
  'low_confidence',
  'ambiguous_or_no_click',
  'fraud_self_click',
  'invalid_manual_offer',
  'schema_missing',
]);

/** Deferred until flags allow — reconcile may retry when flags OK. */
const DEFERRED_REASONS = new Set(['program_inactive', 'money_path_frozen']);

/** Transient — reconcile retries. */
const RETRYABLE_REASONS = new Set([
  'settlement_claim_failed',
  'insert_failed',
  'ledger_load_failed',
  'outcome_persist_failed',
]);

export function isTerminalRejectReason(reason: string): boolean {
  return TERMINAL_REASONS.has(reason);
}

export function isDeferredReason(reason: string): boolean {
  return DEFERRED_REASONS.has(reason);
}

export function isRetryableReason(reason: string): boolean {
  return RETRYABLE_REASONS.has(reason);
}

export function classifyEngineReason(reason: string): {
  class: Exclude<LedgerRewardOutcomeClass, 'pending' | 'created'>;
  terminal: boolean;
} {
  if (reason === 'duplicate_ledger') {
    return { class: 'duplicate', terminal: true };
  }
  if (isDeferredReason(reason)) {
    return { class: 'deferred', terminal: false };
  }
  if (isRetryableReason(reason)) {
    return { class: 'retryable', terminal: false };
  }
  if (isTerminalRejectReason(reason)) {
    return { class: 'rejected', terminal: true };
  }
  // Unknown engine reason → fail-closed terminal reject (no infinite retry of mystery).
  return { class: 'rejected', terminal: true };
}

export function canAutoAttemptRewards(): {
  ok: boolean;
  reason: 'ok' | 'program_inactive' | 'money_path_frozen';
} {
  if (isMoneyPathFrozen()) return { ok: false, reason: 'money_path_frozen' };
  if (!isRewardsProgramActive()) return { ok: false, reason: 'program_inactive' };
  return { ok: true, reason: 'ok' };
}
