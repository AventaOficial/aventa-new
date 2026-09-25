/**
 * Settlement reversal — compensating ledger movement.
 *
 * Original:  settlement:commission:{id}     +N
 * Reversal:  settlement:reversal:commission:{id}  -N
 * Net: 0
 *
 * Idempotent via UNIQUE(network, external_ref) on the reversal ref.
 * Concurrent retries reuse the existing compensating row.
 * Respects MONEY_PATH_FROZEN (fail-closed).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
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
  },
): Promise<SettlementReversalResult> {
  const commissionId = input.commissionId.trim();
  const originalLedgerId = input.ledgerEntryId.trim();
  const actor = input.actor ?? 'settlement_reversal';
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
    return {
      ok: false,
      reason: 'original_ledger_not_found',
      contract: buildSettlementReversalContract({
        commissionId,
        ledgerEntryId: originalLedgerId,
      }),
      reused: false,
      compensatingLedgerEntryId: null,
    };
  }

  const network = String(original.network ?? 'other');
  const amountCents = Number(original.amount_cents);
  if (!Number.isFinite(amountCents) || !Number.isInteger(amountCents) || amountCents < 0) {
    return {
      ok: false,
      reason: 'invalid_original_amount',
      contract: buildSettlementReversalContract({
        commissionId,
        ledgerEntryId: originalLedgerId,
      }),
      reused: false,
      compensatingLedgerEntryId: null,
    };
  }

  // Idempotent reuse: reversal external_ref already present.
  const { data: existingRev } = await supabase
    .from('affiliate_ledger_entries')
    .select('id, amount_cents, external_ref')
    .eq('network', network)
    .eq('external_ref', reversalExternalRef)
    .maybeSingle();

  if (existingRev?.id) {
    const contract = buildSettlementReversalContract({
      commissionId,
      ledgerEntryId: originalLedgerId,
      compensatingLedgerEntryId: String(existingRev.id),
      amountCents: -amountCents,
    });
    const audit = await appendEconomicEvent(supabase, {
      entityType: 'settlement',
      entityId: commissionId,
      eventType: 'settlement_reversal_reused',
      toStatus: 'reversed',
      actor,
      payload: { ...contract },
    });
    if (!audit.ok) {
      return {
        ok: false,
        reason: 'audit_append_failed',
        contract,
        reused: true,
        compensatingLedgerEntryId: String(existingRev.id),
      };
    }
    return {
      ok: true,
      reason: null,
      contract,
      reused: true,
      compensatingLedgerEntryId: String(existingRev.id),
    };
  }

  const compensatingAmount = -amountCents;
  // CHECK on affiliate_ledger_entries allows only pending|accrued|paid|void.
  // Compensating -N is a real economic row (not void); use accrued like settlement mint.
  const row = {
    network,
    amount_cents: compensatingAmount,
    currency: String(original.currency ?? 'MXN'),
    status: 'accrued' as const,
    external_ref: reversalExternalRef,
    notes: 'settlement_reversal_compensating',
    source: 'api' as const,
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

  let compensatingId = inserted?.id ? String(inserted.id) : null;

  if (isUniqueViolation(insertErr)) {
    const { data: raced } = await supabase
      .from('affiliate_ledger_entries')
      .select('id')
      .eq('network', network)
      .eq('external_ref', reversalExternalRef)
      .maybeSingle();
    if (!raced?.id) {
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
    compensatingId = String(raced.id);
    const contract = buildSettlementReversalContract({
      commissionId,
      ledgerEntryId: originalLedgerId,
      compensatingLedgerEntryId: compensatingId,
      amountCents: compensatingAmount,
    });
    const audit = await appendEconomicEvent(supabase, {
      entityType: 'settlement',
      entityId: commissionId,
      eventType: 'settlement_reversal_reused',
      toStatus: 'reversed',
      actor,
      payload: { ...contract, concurrent: true },
    });
    if (!audit.ok) {
      return {
        ok: false,
        reason: 'audit_append_failed',
        contract,
        reused: true,
        compensatingLedgerEntryId: compensatingId,
      };
    }
    return {
      ok: true,
      reason: null,
      contract,
      reused: true,
      compensatingLedgerEntryId: compensatingId,
    };
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

  // Soft-mark original as reversed (best-effort; unique compensating row is SoT for net).
  await supabase
    .from('affiliate_ledger_entries')
    .update({
      status: 'void',
      updated_at: new Date().toISOString(),
      meta: {
        ...((original.meta as Record<string, unknown> | null) ?? {}),
        voided_by_reversal: {
          compensatingLedgerEntryId: compensatingId,
          reversalExternalRef,
          at: new Date().toISOString(),
        },
      },
    })
    .eq('id', originalLedgerId);

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
 * Fail-closed: callers MUST inspect `ok` (do not discard).
 */
export async function emitSettlementReversalRequired(
  supabase: SupabaseClient,
  input: {
    commissionId: string;
    ledgerEntryId: string;
    actor?: string;
  },
): Promise<SettlementReversalResult> {
  return executeSettlementReversal(supabase, input);
}
