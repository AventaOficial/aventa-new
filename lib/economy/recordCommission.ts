/**
 * recordCommission — ingest server-side de comisiones de red.
 * Amount/currency solo desde fuente trusted (nunca frontend).
 * NUNCA escribe ledger_entry_id / rewards / payouts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { appendEconomicEvent } from './appendEconomicEvent';
import { emitSettlementReversalRequired } from './settlement/reversalContract';
import {
  ECONOMIC_LEDGER_BOUNDARY,
  canTransitionCommission,
  isAffiliateNetwork,
  isEconomicIngestSource,
  type AffiliateNetwork,
  type CommissionStatus,
  type EconomicIngestSource,
} from './types';

export type CommissionRecord = {
  commissionId: string;
  conversionId: string;
  externalCommissionId: string;
  source: EconomicIngestSource;
  network: AffiliateNetwork;
  grossCommissionCents: number;
  currency: string;
  status: CommissionStatus;
  occurredAt: string;
  ledgerEntryId: null;
  reused: boolean;
};

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '23505') return true;
  return (error.message ?? '').toLowerCase().includes('duplicate');
}

function mapRow(row: Record<string, unknown>, reused: boolean): CommissionRecord {
  return {
    commissionId: String(row.id),
    conversionId: String(row.conversion_id),
    externalCommissionId: String(row.external_commission_id),
    source: row.source as EconomicIngestSource,
    network: row.network as AffiliateNetwork,
    grossCommissionCents: Number(row.gross_commission_cents),
    currency: String(row.currency ?? 'MXN'),
    status: row.status as CommissionStatus,
    occurredAt: String(row.occurred_at),
    ledgerEntryId: null,
    reused,
  };
}

export async function recordCommission(
  supabase: SupabaseClient,
  input: {
    conversionId: string;
    source: EconomicIngestSource;
    network: AffiliateNetwork;
    externalCommissionId: string;
    grossCommissionCents: number;
    currency?: string;
    occurredAt: string | Date;
    status?: CommissionStatus;
    rawReference?: Record<string, unknown>;
    actor?: string;
  },
): Promise<CommissionRecord | null> {
  if (!isEconomicIngestSource(input.source) || !isAffiliateNetwork(input.network)) {
    return null;
  }
  const externalCommissionId = input.externalCommissionId.trim();
  const conversionId = input.conversionId.trim();
  if (!externalCommissionId || !conversionId) return null;
  if (
    !Number.isFinite(input.grossCommissionCents) ||
    input.grossCommissionCents < 0 ||
    !Number.isInteger(input.grossCommissionCents)
  ) {
    return null;
  }

  // Guardrail: conversion debe existir.
  const { data: conversion, error: convErr } = await supabase
    .from('affiliate_conversions')
    .select('id')
    .eq('id', conversionId)
    .maybeSingle();
  if (convErr || !conversion?.id) return null;

  const occurredAt =
    typeof input.occurredAt === 'string'
      ? input.occurredAt
      : input.occurredAt.toISOString();
  const status: CommissionStatus = input.status ?? 'reported';
  const currency = (input.currency ?? 'MXN').trim().toUpperCase() || 'MXN';

  // Explicit: foundation never sets ledger_entry_id.
  void ECONOMIC_LEDGER_BOUNDARY;

  const row = {
    conversion_id: conversionId,
    source: input.source,
    network: input.network,
    external_commission_id: externalCommissionId,
    gross_commission_cents: input.grossCommissionCents,
    currency,
    status,
    occurred_at: occurredAt,
    ledger_entry_id: null,
    raw_reference: input.rawReference ?? {},
  };

  const { data, error } = await supabase
    .from('affiliate_commissions')
    .insert(row)
    .select(
      'id, conversion_id, source, network, external_commission_id, gross_commission_cents, currency, status, occurred_at, ledger_entry_id',
    )
    .maybeSingle();

  if (!error && data?.id) {
    const audit = await appendEconomicEvent(supabase, {
      entityType: 'commission',
      entityId: String(data.id),
      eventType: 'created',
      toStatus: status,
      actor: input.actor ?? 'system',
      payload: {
        conversionId,
        externalCommissionId,
        grossCommissionCents: input.grossCommissionCents,
        currency,
        ledgerBoundary: ECONOMIC_LEDGER_BOUNDARY.note,
      },
    });
    if (!audit.ok) {
      await supabase.from('affiliate_commissions').delete().eq('id', data.id);
      console.error(
        '[economy/recordCommission] audit_append_failed — rolled back create',
        audit.error,
      );
      return null;
    }
    return mapRow(data as Record<string, unknown>, false);
  }

  if (isUniqueViolation(error)) {
    const selectCols =
      'id, conversion_id, source, network, external_commission_id, gross_commission_cents, currency, status, occurred_at, ledger_entry_id';
    // External key reuse (idempotent report).
    const again = await supabase
      .from('affiliate_commissions')
      .select(selectCols)
      .eq('source', input.source)
      .eq('network', input.network)
      .eq('external_commission_id', externalCommissionId)
      .maybeSingle();
    if (again.data?.id) {
      return mapRow(again.data as Record<string, unknown>, true);
    }
    // Double-credit guard: UNIQUE(conversion_id) — reuse canonical row for same conversion.
    const byConversion = await supabase
      .from('affiliate_commissions')
      .select(selectCols)
      .eq('conversion_id', conversionId)
      .maybeSingle();
    if (byConversion.data?.id) {
      return mapRow(byConversion.data as Record<string, unknown>, true);
    }
  }

  if (error) {
    console.error('[economy/recordCommission]', error.message);
  }
  return null;
}

export async function transitionCommissionStatus(
  supabase: SupabaseClient,
  input: {
    commissionId: string;
    toStatus: CommissionStatus;
    actor?: string;
    reason?: string;
  },
): Promise<{ ok: boolean; from?: CommissionStatus; to?: CommissionStatus; error?: string }> {
  const { data: existing, error } = await supabase
    .from('affiliate_commissions')
    .select('id, status, ledger_entry_id')
    .eq('id', input.commissionId)
    .maybeSingle();
  if (error || !existing?.id) {
    return { ok: false, error: 'commission_not_found' };
  }
  const from = existing.status as CommissionStatus;
  if (!canTransitionCommission(from, input.toStatus)) {
    return { ok: false, from, to: input.toStatus, error: 'invalid_transition' };
  }

  const { error: upErr } = await supabase
    .from('affiliate_commissions')
    .update({ status: input.toStatus, updated_at: new Date().toISOString() })
    .eq('id', input.commissionId)
    .eq('status', from);

  if (upErr) {
    return { ok: false, from, to: input.toStatus, error: upErr.message };
  }

  const audit = await appendEconomicEvent(supabase, {
    entityType: 'commission',
    entityId: input.commissionId,
    eventType: 'status_transition',
    fromStatus: from,
    toStatus: input.toStatus,
    actor: input.actor ?? 'system',
    payload: { reason: input.reason ?? null },
  });
  if (!audit.ok) {
    return { ok: false, from, to: input.toStatus, error: 'audit_append_failed' };
  }

  // Compensating reversal when ledger link exists (gated by MONEY_PATH_FROZEN inside).
  if (
    input.toStatus === 'reversed' &&
    typeof existing.ledger_entry_id === 'string' &&
    existing.ledger_entry_id.trim()
  ) {
    const reversal = await emitSettlementReversalRequired(supabase, {
      commissionId: input.commissionId,
      ledgerEntryId: existing.ledger_entry_id.trim(),
      actor: input.actor ?? 'system',
    });
    if (!reversal.ok) {
      return {
        ok: false,
        from,
        to: input.toStatus,
        error: reversal.reason ?? 'settlement_reversal_failed',
      };
    }
  }

  return { ok: true, from, to: input.toStatus };
}
