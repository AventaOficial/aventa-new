/**
 * Settlement reversal — compensating ledger movement.
 *
 * Original:  settlement:commission:{id}     +N
 * Reversal:  settlement:reversal:commission:{id}  -N
 * Net: 0
 *
 * Idempotent via UNIQUE(network, external_ref) on the reversal ref.
 * The compensating row is status=accrued, source=api, amount negative.
 * The original settlement row is not updated.
 * recoverSettlementReversal completes a commission that is already reversed.
 * Concurrent retries reuse the existing compensating row.
 * Respects MONEY_PATH_FROZEN (fail-closed).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { periodKeyFromInstant } from '@/lib/economy/readModel/economicPeriod';
import { isMoneyPathFrozen } from '@/lib/server/moneyPathFreeze';
import { appendEconomicEvent } from '../appendEconomicEvent';
import { buildSettlementExternalRef } from './externalRef';
import type { SettlementReversalContract, SettlementReversalResult } from './types';

export const SETTLEMENT_REVERSAL_EXTERNAL_REF_PREFIX = 'settlement:reversal:commission:' as const;

export function buildSettlementReversalExternalRef(commissionId: string): string {
  const id = commissionId.trim().toLowerCase();
  if (!id) throw new Error('settlement_reversal_external_ref_requires_commission_id');
  return `${SETTLEMENT_REVERSAL_EXTERNAL_REF_PREFIX}${id}`;
}

export function buildSettlementReversalContract(input: {
  commissionId: string;
  ledgerEntryId: string;
  reversedAt?: string;
  compensatingLedgerEntryId?: string | null;
  amountCents?: number | null;
}): SettlementReversalContract {
  return {
    kind: 'settlement_reversal_executed',
    commissionId: input.commissionId,
    ledgerEntryId: input.ledgerEntryId,
    externalRef: buildSettlementExternalRef(input.commissionId),
    reversalExternalRef: buildSettlementReversalExternalRef(input.commissionId),
    reversedAt: input.reversedAt ?? new Date().toISOString(),
    moneyMovement: 'compensating_ledger_entry',
    compensatingLedgerEntryId: input.compensatingLedgerEntryId ?? null,
    amountCents: input.amountCents ?? null,
    note: 'commission_reversed_with_compensating_ledger_entry',
  };
}

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '23505') return true;
  return (error.message ?? '').toLowerCase().includes('duplicate');
}

function storedAmountMatches(stored: unknown, expected: number): boolean {
  const actual = Number(stored);
  return Number.isFinite(actual) && Number.isInteger(actual) && actual === expected;
}

function failedReversal(
  reason: NonNullable<SettlementReversalResult['reason']>,
  input: {
    commissionId: string;
    ledgerEntryId: string;
    amountCents?: number | null;
    compensatingLedgerEntryId?: string | null;
    reused?: boolean;
  },
): SettlementReversalResult {
  return {
    ok: false,
    reason,
    contract: buildSettlementReversalContract({
      commissionId: input.commissionId,
      ledgerEntryId: input.ledgerEntryId,
      amountCents: input.amountCents,
      compensatingLedgerEntryId: input.compensatingLedgerEntryId,
    }),
    reused: input.reused ?? false,
    compensatingLedgerEntryId: input.compensatingLedgerEntryId ?? null,
  };
}

/**
 * Execute (or reuse) a compensating ledger entry for a reversed commission.
 * Safe under replay and concurrent callers.
 */
export async function executeSettlementReversal(
  supabase: SupabaseClient,
  input: {
    commissionId: string;
    ledgerEntryId: string;
    actor?: string;
    /** Instante de la reversión. El periodo es el de este instante en America/Mexico_City. */
    occurredAt?: string;
  },
): Promise<SettlementReversalResult> {
  const commissionId = input.commissionId.trim();
  const originalLedgerId = input.ledgerEntryId.trim();
  const actor = input.actor ?? 'settlement_reversal';
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const reversalExternalRef = buildSettlementReversalExternalRef(commissionId);

  if (isMoneyPathFrozen()) {
    const contract = buildSettlementReversalContract({
      commissionId,
      ledgerEntryId: originalLedgerId,
    });
    await appendEconomicEvent(supabase, {
      entityType: 'settlement',
      entityId: commissionId,
      eventType: 'settlement_reversal_blocked',
      fromStatus: 'approved',
      toStatus: 'reversed',
      actor,
      payload: { ...contract, reason: 'money_path_frozen' },
    });
    return {
      ok: false,
      reason: 'money_path_frozen',
      contract,
      reused: false,
      compensatingLedgerEntryId: null,
    };
  }

  const { data: original, error: loadErr } = await supabase
    .from('affiliate_ledger_entries')
    .select('id, network, amount_cents, currency, status, external_ref, meta')
    .eq('id', originalLedgerId)
    .maybeSingle();

  if (loadErr || !original?.id) {
    return failedReversal('missing_original_settlement', {
      commissionId,
      ledgerEntryId: originalLedgerId,
    });
  }

  const network = String(original.network ?? 'other');
  const amountCents = Number(original.amount_cents);
  if (!Number.isFinite(amountCents) || !Number.isInteger(amountCents) || amountCents < 0) {
    return failedReversal('invalid_original_amount', {
      commissionId,
      ledgerEntryId: originalLedgerId,
    });
  }

  const canonicalSettlementRef = buildSettlementExternalRef(commissionId);
  const actualSettlementRef = String(original.external_ref ?? '').trim().toLowerCase();
  if (actualSettlementRef !== canonicalSettlementRef) {
    return failedReversal('missing_original_settlement', {
      commissionId,
      ledgerEntryId: originalLedgerId,
    });
  }

  const compensatingAmount = -amountCents;

  const acceptExisting = async (
    existing: { id: string; amount_cents?: unknown },
    concurrent: boolean,
  ): Promise<SettlementReversalResult> => {
    const existingId = String(existing.id);
    if (!storedAmountMatches(existing.amount_cents, compensatingAmount)) {
      const rejected = failedReversal('inconsistent_reversal', {
        commissionId,
        ledgerEntryId: originalLedgerId,
        amountCents: compensatingAmount,
        compensatingLedgerEntryId: existingId,
      });
      await appendEconomicEvent(supabase, {
        entityType: 'settlement',
        entityId: commissionId,
        eventType: 'settlement_reversal_inconsistent',
        toStatus: 'reversed',
        actor,
        payload: {
          ...rejected.contract,
          expectedAmountCents: compensatingAmount,
          actualAmountCents: Number(existing.amount_cents),
          concurrent,
        },
      });
      return rejected;
    }

    const contract = buildSettlementReversalContract({
      commissionId,
      ledgerEntryId: originalLedgerId,
      compensatingLedgerEntryId: existingId,
      amountCents: compensatingAmount,
    });
    const audit = await appendEconomicEvent(supabase, {
      entityType: 'settlement',
      entityId: commissionId,
      eventType: 'settlement_reversal_reused',
      toStatus: 'reversed',
      actor,
      payload: { ...contract, concurrent },
    });
    if (!audit.ok) {
      return {
        ok: false,
        reason: 'audit_append_failed',
        contract,
        reused: true,
        compensatingLedgerEntryId: existingId,
      };
    }
    return {
      ok: true,
      reason: null,
      contract,
      reused: true,
      compensatingLedgerEntryId: existingId,
    };
  };

  const { data: existingRev } = await supabase
    .from('affiliate_ledger_entries')
    .select('id, amount_cents, external_ref')
    .eq('network', network)
    .eq('external_ref', reversalExternalRef)
    .maybeSingle();

  if (existingRev?.id) {
    return acceptExisting(existingRev, false);
  }
  const reversalPeriod = periodKeyFromInstant(occurredAt);
  const row = {
    network,
    amount_cents: compensatingAmount,
    currency: String(original.currency ?? 'MXN'),
    status: 'accrued' as const,
    external_ref: reversalExternalRef,
    notes: 'settlement_reversal_compensating',
    source: 'api' as const,
    period_start: `${reversalPeriod}-01`,
    created_at: occurredAt,
    meta: {
      settlement_reversal: {
        originalLedgerEntryId: originalLedgerId,
        originalExternalRef: original.external_ref ?? null,
        originalAmountCents: amountCents,
        commissionId,
        settlementExternalRef: buildSettlementExternalRef(commissionId),
        reversalExternalRef,
      },
    },
  };

  const { data: inserted, error: insertErr } = await supabase
    .from('affiliate_ledger_entries')
    .insert(row)
    .select('id')
    .maybeSingle();

  const compensatingId = inserted?.id ? String(inserted.id) : null;

  if (isUniqueViolation(insertErr)) {
    const { data: raced } = await supabase
      .from('affiliate_ledger_entries')
      .select('id, amount_cents')
      .eq('network', network)
      .eq('external_ref', reversalExternalRef)
      .maybeSingle();
    if (!raced?.id) {
      return failedReversal('ledger_write_failed', {
        commissionId,
        ledgerEntryId: originalLedgerId,
        amountCents: compensatingAmount,
      });
    }
    return acceptExisting(raced, true);
  }

  if (insertErr || !compensatingId) {
    return {
      ok: false,
      reason: 'ledger_write_failed',
      contract: buildSettlementReversalContract({
        commissionId,
        ledgerEntryId: originalLedgerId,
        amountCents: compensatingAmount,
      }),
      reused: false,
      compensatingLedgerEntryId: null,
    };
  }

  const contract = buildSettlementReversalContract({
    commissionId,
    ledgerEntryId: originalLedgerId,
    compensatingLedgerEntryId: compensatingId,
    amountCents: compensatingAmount,
  });

  const audit = await appendEconomicEvent(supabase, {
    entityType: 'settlement',
    entityId: commissionId,
    eventType: 'settlement_reversed',
    fromStatus: 'approved',
    toStatus: 'reversed',
    actor,
    payload: {
      ...contract,
      originalAmountCents: amountCents,
      compensatingAmountCents: compensatingAmount,
      netCents: 0,
    },
  });
  if (!audit.ok) {
    return {
      ok: false,
      reason: 'audit_append_failed',
      contract,
      reused: false,
      compensatingLedgerEntryId: compensatingId,
    };
  }

  return {
    ok: true,
    reason: null,
    contract,
    reused: false,
    compensatingLedgerEntryId: compensatingId,
  };
}

/**
 * Called after commission → reversed when a ledger link exists.
 * Creates compensating ledger entry (or reuses) so net economic effect is 0.
 */
export async function emitSettlementReversalRequired(
  supabase: SupabaseClient,
  input: {
    commissionId: string;
    ledgerEntryId: string;
    actor?: string;
  },
): Promise<SettlementReversalContract> {
  const result = await executeSettlementReversal(supabase, input);
  return result.contract;
}

/**
 * Completes the ledger for a commission that is already reversed.
 * Does not call transitionCommissionStatus.
 */
export async function recoverSettlementReversal(
  supabase: SupabaseClient,
  input: {
    commissionId: string;
    actor?: string;
    occurredAt?: string;
  },
): Promise<SettlementReversalResult> {
  const commissionId = input.commissionId.trim();
  if (!commissionId) {
    return failedReversal('commission_not_found', {
      commissionId,
      ledgerEntryId: '',
    });
  }

  const { data: commission, error } = await supabase
    .from('affiliate_commissions')
    .select('id, status, ledger_entry_id')
    .eq('id', commissionId)
    .maybeSingle();

  if (error || !commission?.id) {
    return failedReversal('commission_not_found', {
      commissionId,
      ledgerEntryId: '',
    });
  }

  if (commission.status !== 'reversed') {
    return failedReversal('commission_not_reversed', {
      commissionId,
      ledgerEntryId: String(commission.ledger_entry_id ?? ''),
    });
  }

  const ledgerEntryId =
    typeof commission.ledger_entry_id === 'string' ? commission.ledger_entry_id.trim() : '';
  if (!ledgerEntryId) {
    return failedReversal('missing_ledger_entry', {
      commissionId,
      ledgerEntryId: '',
    });
  }

  return executeSettlementReversal(supabase, {
    commissionId,
    ledgerEntryId,
    actor: input.actor ?? 'settlement_reversal_recovery',
    occurredAt: input.occurredAt,
  });
}
