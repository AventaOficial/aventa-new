/**
 * M5.4 — Classify reservePayoutIntent rejects for automation.
 * Uses only canonical PayoutIntentRejectReason values.
 */

import type { PayoutIntentRejectReason } from '@/lib/rewards/payoutIntent/types';
import type { AvailablePayoutIntentOutcomeClass } from './types';

const TERMINAL = new Set<string>([
  'reward_not_found',
  'reward_terminal',
  'reward_not_available',
  'zero_amount',
  'currency_unsupported',
  'amount_mismatch',
  'currency_mismatch',
  'creator_mismatch',
  'schema_missing',
]);

const DEFERRED = new Set<string>([
  'money_path_frozen',
  'program_inactive',
  'below_minimum_available',
  'insert_failed',
]);

export function classifyReserveReject(reason: string): {
  class: Exclude<AvailablePayoutIntentOutcomeClass, 'reserved' | 'reused'>;
  terminal: boolean;
} {
  if (DEFERRED.has(reason)) {
    return { class: 'deferred', terminal: false };
  }
  if (TERMINAL.has(reason)) {
    return { class: 'rejected', terminal: true };
  }
  // Unknown → fail-closed terminal (no infinite mystery retries).
  return { class: 'rejected', terminal: true };
}

export function isTerminalReserveReason(reason: PayoutIntentRejectReason | string): boolean {
  return classifyReserveReject(reason).terminal;
}
