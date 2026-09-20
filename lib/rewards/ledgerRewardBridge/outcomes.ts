/**
 * M5.1 — Durable outcome on affiliate_ledger_entries.meta (no new DDL).
 * Key: ledger_reward_bridge. Authority for "do not infinite-retry".
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  LEDGER_REWARD_BRIDGE_META_KEY,
  LEDGER_REWARD_BRIDGE_VERSION,
  type LedgerRewardAttemptOutcome,
  type LedgerRewardOutcomeClass,
} from './types';

export function readLedgerRewardOutcome(
  meta: Record<string, unknown> | null | undefined,
): LedgerRewardAttemptOutcome | null {
  if (!meta || typeof meta !== 'object') return null;
  const raw = meta[LEDGER_REWARD_BRIDGE_META_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const cls = o.class;
  if (
    cls !== 'pending' &&
    cls !== 'created' &&
    cls !== 'duplicate' &&
    cls !== 'deferred' &&
    cls !== 'rejected' &&
    cls !== 'retryable'
  ) {
    return null;
  }
  return {
    version: LEDGER_REWARD_BRIDGE_VERSION,
    class: cls,
    reason: typeof o.reason === 'string' ? o.reason : 'unknown',
    attempt: typeof o.attempt === 'number' && Number.isFinite(o.attempt) ? o.attempt : 0,
    at: typeof o.at === 'string' ? o.at : '',
    commissionId: typeof o.commissionId === 'string' ? o.commissionId : null,
    rewardId: typeof o.rewardId === 'string' ? o.rewardId : null,
    terminal: o.terminal === true,
  };
}

export function buildLedgerRewardOutcome(input: {
  class: LedgerRewardOutcomeClass;
  reason: string;
  attempt: number;
  commissionId?: string | null;
  rewardId?: string | null;
  terminal: boolean;
  at?: string;
}): LedgerRewardAttemptOutcome {
  return {
    version: LEDGER_REWARD_BRIDGE_VERSION,
    class: input.class,
    reason: input.reason,
    attempt: input.attempt,
    at: input.at ?? new Date().toISOString(),
    commissionId: input.commissionId ?? null,
    rewardId: input.rewardId ?? null,
    terminal: input.terminal,
  };
}

export function mergeOutcomeIntoMeta(
  prev: Record<string, unknown> | null | undefined,
  outcome: LedgerRewardAttemptOutcome,
): Record<string, unknown> {
  return {
    ...(prev && typeof prev === 'object' ? prev : {}),
    [LEDGER_REWARD_BRIDGE_META_KEY]: outcome,
  };
}

export function extractCommissionIdFromMeta(
  meta: Record<string, unknown> | null | undefined,
): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const settlement = meta.settlement;
  if (settlement && typeof settlement === 'object') {
    const id = (settlement as Record<string, unknown>).commissionId;
    if (typeof id === 'string' && id.trim()) return id.trim();
  }
  const bridge = readLedgerRewardOutcome(meta);
  return bridge?.commissionId ?? null;
}

export function isSettlementOriginLedger(row: {
  notes?: string | null;
  meta?: Record<string, unknown> | null;
}): boolean {
  if ((row.notes ?? '').trim() === 'settlement_bridge_m1') return true;
  const meta = row.meta;
  if (meta && typeof meta === 'object' && meta.settlement && typeof meta.settlement === 'object') {
    return true;
  }
  return readLedgerRewardOutcome(meta) != null;
}

/**
 * Persist outcome into ledger meta. CAS-free last-write for attempt bookkeeping;
 * monetary uniqueness remains on creator_rewards / ledger_settlements.
 */
export async function persistLedgerRewardOutcome(
  supabase: SupabaseClient,
  input: {
    ledgerEntryId: string;
    prevMeta: Record<string, unknown> | null | undefined;
    outcome: LedgerRewardAttemptOutcome;
  },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const nextMeta = mergeOutcomeIntoMeta(input.prevMeta, input.outcome);
  const { error } = await supabase
    .from('affiliate_ledger_entries')
    .update({ meta: nextMeta, updated_at: new Date().toISOString() })
    .eq('id', input.ledgerEntryId);
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true };
}
