/**
 * Append-only commission revisions.
 * NEVER UPDATE affiliate_commissions.gross_commission_cents for corrections.
 * NEVER write ledger_entry_id / rewards / payouts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { appendEconomicEvent } from '../appendEconomicEvent';
import type {
  CommissionRevisionKind,
  CommissionRevisionSemantics,
  RevisionStatus,
} from '../adapter/types';
import { canTransitionRevision } from '../adapter/types';
import {
  ECONOMIC_LEDGER_BOUNDARY,
  isAffiliateNetwork,
  isEconomicIngestSource,
  type AffiliateNetwork,
  type EconomicIngestSource,
} from '../types';
import { isIntegerCents, isNonNegativeIntegerCents, normalizeCurrency } from '../adapter/validateNormalized';
import { computeEffectiveCommissionCents } from './effectiveCommission';

export type CommissionRevisionRecord = {
  revisionId: string;
  commissionId: string;
  externalRevisionId: string;
  source: EconomicIngestSource;
  network: AffiliateNetwork;
  revisionKind: CommissionRevisionKind;
  semantics: CommissionRevisionSemantics;
  amountDeltaCents: number | null;
  absoluteAmountCents: number | null;
  currency: string;
  status: RevisionStatus;
  occurredAt: string;
  effectiveAfterCents: number | null;
  reused: boolean;
};

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '23505') return true;
  return (error.message ?? '').toLowerCase().includes('duplicate');
}

function mapRow(
  row: Record<string, unknown>,
  reused: boolean,
  effectiveAfterCents: number | null,
): CommissionRevisionRecord {
  return {
    revisionId: String(row.id),
    commissionId: String(row.commission_id),
    externalRevisionId: String(row.external_revision_id),
    source: row.source as EconomicIngestSource,
    network: row.network as AffiliateNetwork,
    revisionKind: row.revision_kind as CommissionRevisionKind,
    semantics: row.semantics as CommissionRevisionSemantics,
    amountDeltaCents:
      row.amount_delta_cents == null ? null : Number(row.amount_delta_cents),
    absoluteAmountCents:
      row.absolute_amount_cents == null ? null : Number(row.absolute_amount_cents),
    currency: String(row.currency),
    status: row.status as RevisionStatus,
    occurredAt: String(row.occurred_at),
    effectiveAfterCents,
    reused,
  };
}

export async function recordCommissionRevision(
  supabase: SupabaseClient,
  input: {
    commissionId: string;
    source: EconomicIngestSource;
    network: AffiliateNetwork;
    externalRevisionId: string;
    revisionKind: CommissionRevisionKind;
    semantics: CommissionRevisionSemantics;
    amountDeltaCents?: number | null;
    absoluteAmountCents?: number | null;
    currency: string;
    reason?: string | null;
    occurredAt: string | Date;
    rawReference?: Record<string, unknown>;
    actor?: string;
  },
): Promise<CommissionRevisionRecord | null> {
  void ECONOMIC_LEDGER_BOUNDARY;

  if (!isEconomicIngestSource(input.source) || !isAffiliateNetwork(input.network)) {
    return null;
  }
  const externalRevisionId = input.externalRevisionId.trim();
  const commissionId = input.commissionId.trim();
  if (!externalRevisionId || !commissionId) return null;

  const currency = normalizeCurrency(input.currency);
  if (!currency) return null;

  if (input.semantics === 'delta') {
    if (!isIntegerCents(input.amountDeltaCents) || input.absoluteAmountCents != null) {
      return null;
    }
    if (input.revisionKind === 'positive_adjustment' && input.amountDeltaCents <= 0) {
      return null;
    }
    if (input.revisionKind === 'negative_adjustment' && input.amountDeltaCents >= 0) {
      return null;
    }
  } else if (input.semantics === 'replacement') {
    if (
      !isNonNegativeIntegerCents(input.absoluteAmountCents) ||
      input.amountDeltaCents != null
    ) {
      return null;
    }
  } else {
    return null;
  }

  const { data: commission, error: cErr } = await supabase
    .from('affiliate_commissions')
    .select('id, gross_commission_cents, currency, ledger_entry_id')
    .eq('id', commissionId)
    .maybeSingle();
  if (cErr || !commission?.id) return null;
  // Foundation must never attach ledger.
  if (commission.ledger_entry_id != null) {
    console.error('[economy/recordCommissionRevision] refuse: ledger_entry_id already set');
    return null;
  }

  const occurredAt =
    typeof input.occurredAt === 'string'
      ? input.occurredAt
      : input.occurredAt.toISOString();

  const row = {
    commission_id: commissionId,
    source: input.source,
    network: input.network,
    external_revision_id: externalRevisionId,
    revision_kind: input.revisionKind,
    semantics: input.semantics,
    amount_delta_cents: input.semantics === 'delta' ? input.amountDeltaCents : null,
    absolute_amount_cents:
      input.semantics === 'replacement' ? input.absoluteAmountCents : null,
    currency,
    reason: input.reason?.trim() || null,
    status: 'recorded' as const,
    occurred_at: occurredAt,
    raw_reference: input.rawReference ?? {},
  };

  const { data, error } = await supabase
    .from('affiliate_commission_revisions')
    .insert(row)
    .select(
      'id, commission_id, source, network, external_revision_id, revision_kind, semantics, amount_delta_cents, absolute_amount_cents, currency, status, occurred_at',
    )
    .maybeSingle();

  if (!error && data?.id) {
    const effective = await computeEffectiveCommissionCents(supabase, commissionId);
    await appendEconomicEvent(supabase, {
      entityType: 'commission',
      entityId: commissionId,
      eventType: 'commission_revision',
      toStatus: input.revisionKind,
      actor: input.actor ?? 'system',
      payload: {
        revisionId: data.id,
        externalRevisionId,
        semantics: input.semantics,
        amountDeltaCents: row.amount_delta_cents,
        absoluteAmountCents: row.absolute_amount_cents,
        currency,
        effectiveAfterCents: effective,
        ledgerBoundary: ECONOMIC_LEDGER_BOUNDARY.note,
      },
    });
    return mapRow(data as Record<string, unknown>, false, effective);
  }

  if (isUniqueViolation(error)) {
    const again = await supabase
      .from('affiliate_commission_revisions')
      .select(
        'id, commission_id, source, network, external_revision_id, revision_kind, semantics, amount_delta_cents, absolute_amount_cents, currency, status, occurred_at',
      )
      .eq('source', input.source)
      .eq('network', input.network)
      .eq('external_revision_id', externalRevisionId)
      .maybeSingle();
    if (again.data?.id) {
      const effective = await computeEffectiveCommissionCents(
        supabase,
        String(again.data.commission_id),
      );
      return mapRow(again.data as Record<string, unknown>, true, effective);
    }
  }

  if (error) {
    console.error('[economy/recordCommissionRevision]', error.message);
  }
  return null;
}

export async function transitionRevisionStatus(
  supabase: SupabaseClient,
  input: {
    revisionId: string;
    toStatus: RevisionStatus;
    actor?: string;
    reason?: string;
  },
): Promise<{ ok: boolean; from?: RevisionStatus; to?: RevisionStatus; error?: string }> {
  const { data: existing, error } = await supabase
    .from('affiliate_commission_revisions')
    .select('id, status, commission_id')
    .eq('id', input.revisionId)
    .maybeSingle();
  if (error || !existing?.id) {
    return { ok: false, error: 'revision_not_found' };
  }
  const from = existing.status as RevisionStatus;
  if (!canTransitionRevision(from, input.toStatus)) {
    return { ok: false, from, to: input.toStatus, error: 'invalid_transition' };
  }

  const { error: upErr } = await supabase
    .from('affiliate_commission_revisions')
    .update({ status: input.toStatus })
    .eq('id', input.revisionId)
    .eq('status', from);

  if (upErr) {
    return { ok: false, from, to: input.toStatus, error: upErr.message };
  }

  await appendEconomicEvent(supabase, {
    entityType: 'commission',
    entityId: String(existing.commission_id),
    eventType: 'revision_status_transition',
    fromStatus: from,
    toStatus: input.toStatus,
    actor: input.actor ?? 'system',
    payload: { revisionId: input.revisionId, reason: input.reason ?? null },
  });

  return { ok: true, from, to: input.toStatus };
}
