/**
 * M1 Settlement Bridge — approved commission → affiliate_ledger_entries.
 *
 * Reuses canonical authorities. Never creates creator_rewards / payouts.
 * Idempotent via deterministic external_ref + commission.ledger_entry_id CAS.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  REWARDS_CREATOR_SHARE_BPS,
  splitCommissionCents,
} from '@/lib/rewards/config';
import { isMoneyPathFrozen } from '@/lib/server/moneyPathFreeze';
import { appendEconomicEvent } from '../appendEconomicEvent';
import { isAffiliateNetwork, type AffiliateNetwork } from '../types';
import { buildSettlementExternalRef } from './externalRef';
import { isSettlementBridgeEnabled } from './isSettlementBridgeEnabled';
import { resolveSettlementLedgerAttribution } from './projectLedgerAttribution';
import type {
  SettlementAllocation,
  SettlementBridgeResult,
  SettlementEventType,
  SettlementRejectReason,
} from './types';

/** Boundary pointer only — settlement never invokes the rewards engine. */
const REWARD_BOUNDARY = 'future_createRewardFromLedgerEntry' as const;

type CommissionRow = {
  id: string;
  conversion_id: string;
  source: string;
  network: string;
  external_commission_id: string;
  gross_commission_cents: unknown;
  currency: string | null;
  status: string;
  ledger_entry_id: string | null;
  occurred_at: string;
};

function baseResult(
  partial: Partial<SettlementBridgeResult> &
    Pick<SettlementBridgeResult, 'ok' | 'event' | 'commissionId'>,
): SettlementBridgeResult {
  return {
    ok: partial.ok,
    event: partial.event,
    reason: partial.reason,
    commissionId: partial.commissionId,
    conversionId: partial.conversionId ?? null,
    ledgerEntryId: partial.ledgerEntryId ?? null,
    externalRef: partial.externalRef ?? null,
    network: partial.network ?? null,
    allocation: partial.allocation ?? null,
    reused: partial.reused ?? false,
    rewardBoundary: REWARD_BOUNDARY,
    createdCreatorReward: false,
    createdPayout: false,
  };
}

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '23505') return true;
  return (error.message ?? '').toLowerCase().includes('duplicate');
}

async function audit(
  supabase: SupabaseClient,
  input: {
    commissionId: string;
    eventType: SettlementEventType;
    reason?: string;
    payload?: Record<string, unknown>;
    actor?: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  const result = await appendEconomicEvent(supabase, {
    entityType: 'settlement',
    entityId: input.commissionId,
    eventType: input.eventType,
    toStatus: input.eventType,
    actor: input.actor ?? 'settlement_bridge_m1',
    payload: {
      reason: input.reason ?? null,
      ...(input.payload ?? {}),
    },
  });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true };
}

function validateGross(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || !Number.isInteger(raw) || raw < 0) {
    return null;
  }
  return raw;
}

function buildAllocation(
  gross: number,
  currency: string,
  creatorShareBps: number,
): SettlementAllocation | { error: SettlementRejectReason } {
  const split = splitCommissionCents(gross, creatorShareBps);
  if (split.creatorCents < 0 || split.platformCents < 0) {
    return { error: 'invalid_allocation' };
  }
  if (split.creatorCents > gross) {
    return { error: 'invalid_allocation' };
  }
  if (split.creatorCents + split.platformCents !== gross) {
    return { error: 'invalid_allocation' };
  }
  return {
    grossCommissionCents: gross,
    creatorAllocationCents: split.creatorCents,
    platformAllocationCents: split.platformCents,
    creatorShareBps,
    currency,
    withdrawable: false,
    settled: false,
  };
}

async function loadLedgerById(
  supabase: SupabaseClient,
  ledgerId: string,
): Promise<{ id: string; external_ref: string | null; amount_cents: number; currency: string; network: string } | null> {
  const { data, error } = await supabase
    .from('affiliate_ledger_entries')
    .select('id, external_ref, amount_cents, currency, network')
    .eq('id', ledgerId)
    .maybeSingle();
  if (error || !data?.id) return null;
  return data as {
    id: string;
    external_ref: string | null;
    amount_cents: number;
    currency: string;
    network: string;
  };
}

async function loadLedgerByExternalRef(
  supabase: SupabaseClient,
  network: string,
  externalRef: string,
): Promise<{ id: string; external_ref: string | null; amount_cents: number; currency: string; network: string } | null> {
  const { data, error } = await supabase
    .from('affiliate_ledger_entries')
    .select('id, external_ref, amount_cents, currency, network')
    .eq('network', network)
    .eq('external_ref', externalRef)
    .maybeSingle();
  if (error || !data?.id) return null;
  return data as {
    id: string;
    external_ref: string | null;
    amount_cents: number;
    currency: string;
    network: string;
  };
}

async function linkCommissionLedger(
  supabase: SupabaseClient,
  commissionId: string,
  ledgerEntryId: string,
): Promise<'linked' | 'already' | 'failed'> {
  const { data: existing } = await supabase
    .from('affiliate_commissions')
    .select('id, ledger_entry_id')
    .eq('id', commissionId)
    .maybeSingle();
  if (existing?.ledger_entry_id) {
    return existing.ledger_entry_id === ledgerEntryId ? 'already' : 'failed';
  }

  const { error } = await supabase
    .from('affiliate_commissions')
    .update({
      ledger_entry_id: ledgerEntryId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', commissionId)
    .is('ledger_entry_id', null);

  if (error) {
    // Concurrent link won — re-read
    const again = await supabase
      .from('affiliate_commissions')
      .select('ledger_entry_id')
      .eq('id', commissionId)
      .maybeSingle();
    if (again.data?.ledger_entry_id === ledgerEntryId) return 'already';
    return 'failed';
  }
  return 'linked';
}

export type SettleCommissionInput = {
  commissionId: string;
  actor?: string;
  creatorShareBps?: number;
};

/**
 * Settle an approved commission into the platform ledger (when bridge enabled).
 * Never creates rewards/payouts. Never marks user balance withdrawable.
 */
export async function settleCommission(
  supabase: SupabaseClient,
  input: SettleCommissionInput,
): Promise<SettlementBridgeResult> {
  const commissionId = (input.commissionId ?? '').trim();
  const actor = input.actor ?? 'settlement_bridge_m1';

  if (!commissionId) {
    return baseResult({
      ok: false,
      event: 'settlement_rejected',
      reason: 'commission_malformed',
      commissionId: '',
    });
  }

  if (!isSettlementBridgeEnabled()) {
    await audit(supabase, {
      commissionId,
      eventType: 'settlement_rejected',
      reason: 'settlement_disabled',
      actor,
    });
    return baseResult({
      ok: false,
      event: 'settlement_rejected',
      reason: 'settlement_disabled',
      commissionId,
    });
  }

  if (isMoneyPathFrozen()) {
    await audit(supabase, {
      commissionId,
      eventType: 'settlement_rejected',
      reason: 'money_path_frozen',
      actor,
    });
    return baseResult({
      ok: false,
      event: 'settlement_rejected',
      reason: 'money_path_frozen',
      commissionId,
    });
  }

  await audit(supabase, {
    commissionId,
    eventType: 'settlement_requested',
    actor,
  });

  const { data: row, error: loadErr } = await supabase
    .from('affiliate_commissions')
    .select(
      'id, conversion_id, source, network, external_commission_id, gross_commission_cents, currency, status, ledger_entry_id, occurred_at',
    )
    .eq('id', commissionId)
    .maybeSingle();

  if (loadErr || !row?.id) {
    await audit(supabase, {
      commissionId,
      eventType: 'settlement_rejected',
      reason: 'commission_not_found',
      actor,
    });
    return baseResult({
      ok: false,
      event: 'settlement_rejected',
      reason: 'commission_not_found',
      commissionId,
    });
  }

  const commission = row as CommissionRow;

  if (!isAffiliateNetwork(commission.network) || !commission.conversion_id) {
    await audit(supabase, {
      commissionId,
      eventType: 'settlement_rejected',
      reason: 'commission_malformed',
      actor,
    });
    return baseResult({
      ok: false,
      event: 'settlement_rejected',
      reason: 'commission_malformed',
      commissionId,
      conversionId: commission.conversion_id ?? null,
      network: commission.network ?? null,
    });
  }

  const network = commission.network as AffiliateNetwork;
  const currency = (commission.currency ?? '').trim().toUpperCase();
  if (!currency) {
    await audit(supabase, {
      commissionId,
      eventType: 'settlement_rejected',
      reason: 'currency_mismatch',
      actor,
      payload: { detail: 'missing_commission_currency' },
    });
    return baseResult({
      ok: false,
      event: 'settlement_rejected',
      reason: 'currency_mismatch',
      commissionId,
      conversionId: commission.conversion_id,
      network,
    });
  }

  if (commission.status === 'reversed') {
    await audit(supabase, {
      commissionId,
      eventType: 'settlement_rejected',
      reason: 'commission_reversed',
      actor,
    });
    return baseResult({
      ok: false,
      event: 'settlement_rejected',
      reason: 'commission_reversed',
      commissionId,
      conversionId: commission.conversion_id,
      network,
      ledgerEntryId: commission.ledger_entry_id,
    });
  }

  if (commission.status !== 'approved') {
    await audit(supabase, {
      commissionId,
      eventType: 'settlement_rejected',
      reason: 'commission_not_approved',
      actor,
      payload: { status: commission.status },
    });
    return baseResult({
      ok: false,
      event: 'settlement_rejected',
      reason: 'commission_not_approved',
      commissionId,
      conversionId: commission.conversion_id,
      network,
    });
  }

  const gross = validateGross(commission.gross_commission_cents);
  if (gross === null) {
    await audit(supabase, {
      commissionId,
      eventType: 'settlement_rejected',
      reason: 'invalid_amount',
      actor,
    });
    return baseResult({
      ok: false,
      event: 'settlement_rejected',
      reason: 'invalid_amount',
      commissionId,
      conversionId: commission.conversion_id,
      network,
    });
  }

  const creatorShareBps = input.creatorShareBps ?? REWARDS_CREATOR_SHARE_BPS;
  const allocationOrErr = buildAllocation(gross, currency, creatorShareBps);
  if ('error' in allocationOrErr) {
    await audit(supabase, {
      commissionId,
      eventType: 'settlement_rejected',
      reason: allocationOrErr.error,
      actor,
    });
    return baseResult({
      ok: false,
      event: 'settlement_rejected',
      reason: allocationOrErr.error,
      commissionId,
      conversionId: commission.conversion_id,
      network,
    });
  }
  const allocation = allocationOrErr;

  let externalRef: string;
  try {
    externalRef = buildSettlementExternalRef(commissionId);
  } catch {
    return baseResult({
      ok: false,
      event: 'settlement_failed',
      reason: 'commission_malformed',
      commissionId,
    });
  }

  // Retry / crash recovery path: already linked
  if (commission.ledger_entry_id) {
    const existing = await loadLedgerById(supabase, commission.ledger_entry_id);
    if (existing) {
      // Currency invariant on reuse
      if ((existing.currency ?? '').toUpperCase() !== currency) {
        await audit(supabase, {
          commissionId,
          eventType: 'settlement_rejected',
          reason: 'currency_mismatch',
          actor,
          payload: {
            ledgerCurrency: existing.currency,
            commissionCurrency: currency,
          },
        });
        return baseResult({
          ok: false,
          event: 'settlement_rejected',
          reason: 'currency_mismatch',
          commissionId,
          conversionId: commission.conversion_id,
          network,
          ledgerEntryId: existing.id,
          externalRef,
        });
      }
      await audit(supabase, {
        commissionId,
        eventType: 'settlement_reused',
        actor,
        payload: { ledgerEntryId: existing.id, externalRef },
      });
      return baseResult({
        ok: true,
        event: 'settlement_reused',
        commissionId,
        conversionId: commission.conversion_id,
        network,
        ledgerEntryId: existing.id,
        externalRef: existing.external_ref ?? externalRef,
        allocation,
        reused: true,
      });
    }
  }

  // Crash recovery: ledger exists by external_ref but link missing
  const byRef = await loadLedgerByExternalRef(supabase, network, externalRef);
  if (byRef) {
    if ((byRef.currency ?? '').toUpperCase() !== currency) {
      await audit(supabase, {
        commissionId,
        eventType: 'settlement_rejected',
        reason: 'currency_mismatch',
        actor,
      });
      return baseResult({
        ok: false,
        event: 'settlement_rejected',
        reason: 'currency_mismatch',
        commissionId,
        conversionId: commission.conversion_id,
        network,
        ledgerEntryId: byRef.id,
        externalRef,
      });
    }
    const link = await linkCommissionLedger(supabase, commissionId, byRef.id);
    if (link === 'failed') {
      await audit(supabase, {
        commissionId,
        eventType: 'settlement_failed',
        reason: 'link_failed',
        actor,
      });
      return baseResult({
        ok: false,
        event: 'settlement_failed',
        reason: 'link_failed',
        commissionId,
        conversionId: commission.conversion_id,
        network,
        ledgerEntryId: byRef.id,
        externalRef,
      });
    }
    await audit(supabase, {
      commissionId,
      eventType: 'settlement_reused',
      actor,
      payload: { ledgerEntryId: byRef.id, externalRef, crashRecovery: true },
    });
    return baseResult({
      ok: true,
      event: 'settlement_reused',
      commissionId,
      conversionId: commission.conversion_id,
      network,
      ledgerEntryId: byRef.id,
      externalRef,
      allocation,
      reused: true,
    });
  }

  await audit(supabase, {
    commissionId,
    eventType: 'settlement_eligible',
    actor,
    payload: { externalRef, gross, currency },
  });

  const attributionResolved = await resolveSettlementLedgerAttribution(
    supabase,
    commission.conversion_id,
  );
  if (!attributionResolved.ok) {
    await audit(supabase, {
      commissionId,
      eventType: 'settlement_rejected',
      reason: 'conversion_not_found',
      actor,
      payload: { conversionId: commission.conversion_id },
    });
    return baseResult({
      ok: false,
      event: 'settlement_rejected',
      reason: 'conversion_not_found',
      commissionId,
      conversionId: commission.conversion_id,
      network,
      externalRef,
    });
  }
  const { attribution } = attributionResolved;

  const ledgerRow = {
    network,
    amount_cents: gross,
    currency,
    status: 'accrued' as const,
    external_ref: externalRef,
    notes: 'settlement_bridge_m1',
    source: 'api' as const,
    click_id: attribution.click_id,
    offer_id: attribution.offer_id,
    creator_id: attribution.creator_id,
    tracking_tag: attribution.tracking_tag,
    attributable: attribution.attributable,
    attribution_method: attribution.attribution_method,
    attribution_confidence: attribution.attribution_confidence,
    meta: {
      settlement: {
        bridgeVersion: 'm1',
        commissionId,
        conversionId: commission.conversion_id,
        externalCommissionId: commission.external_commission_id,
        externalRef,
        grossCommissionCents: allocation.grossCommissionCents,
        creatorAllocationCents: allocation.creatorAllocationCents,
        platformAllocationCents: allocation.platformAllocationCents,
        creatorShareBps: allocation.creatorShareBps,
        withdrawable: false,
        settled: false,
        rewardBoundary: REWARD_BOUNDARY,
        attributionSource: attribution.source,
      },
    },
  };

  const { data: inserted, error: insertErr } = await supabase
    .from('affiliate_ledger_entries')
    .insert(ledgerRow)
    .select('id, external_ref, amount_cents, currency, network')
    .maybeSingle();

  let ledgerId: string | null = inserted?.id ? String(inserted.id) : null;

  if (isUniqueViolation(insertErr)) {
    const raced = await loadLedgerByExternalRef(supabase, network, externalRef);
    if (!raced) {
      await audit(supabase, {
        commissionId,
        eventType: 'settlement_failed',
        reason: 'ledger_write_failed',
        actor,
      });
      return baseResult({
        ok: false,
        event: 'settlement_failed',
        reason: 'ledger_write_failed',
        commissionId,
        conversionId: commission.conversion_id,
        network,
        externalRef,
      });
    }
    ledgerId = raced.id;
    const link = await linkCommissionLedger(supabase, commissionId, raced.id);
    if (link === 'failed') {
      await audit(supabase, {
        commissionId,
        eventType: 'settlement_failed',
        reason: 'link_failed',
        actor,
      });
      return baseResult({
        ok: false,
        event: 'settlement_failed',
        reason: 'link_failed',
        commissionId,
        conversionId: commission.conversion_id,
        network,
        ledgerEntryId: raced.id,
        externalRef,
      });
    }
    await audit(supabase, {
      commissionId,
      eventType: 'settlement_reused',
      actor,
      payload: { ledgerEntryId: raced.id, externalRef, concurrent: true },
    });
    return baseResult({
      ok: true,
      event: 'settlement_reused',
      commissionId,
      conversionId: commission.conversion_id,
      network,
      ledgerEntryId: raced.id,
      externalRef,
      allocation,
      reused: true,
    });
  }

  if (insertErr || !ledgerId) {
    await audit(supabase, {
      commissionId,
      eventType: 'settlement_failed',
      reason: 'ledger_write_failed',
      actor,
      payload: { message: insertErr?.message ?? null },
    });
    return baseResult({
      ok: false,
      event: 'settlement_failed',
      reason: 'ledger_write_failed',
      commissionId,
      conversionId: commission.conversion_id,
      network,
      externalRef,
    });
  }

  const link = await linkCommissionLedger(supabase, commissionId, ledgerId);
  if (link === 'failed') {
    await audit(supabase, {
      commissionId,
      eventType: 'settlement_failed',
      reason: 'link_failed',
      actor,
      payload: { ledgerEntryId: ledgerId },
    });
    return baseResult({
      ok: false,
      event: 'settlement_failed',
      reason: 'link_failed',
      commissionId,
      conversionId: commission.conversion_id,
      network,
      ledgerEntryId: ledgerId,
      externalRef,
    });
  }

  const createdAudit = await audit(supabase, {
    commissionId,
    eventType: 'settlement_created',
    actor,
    payload: {
      ledgerEntryId: ledgerId,
      externalRef,
      gross,
      currency,
      creatorAllocationCents: allocation.creatorAllocationCents,
      platformAllocationCents: allocation.platformAllocationCents,
      // Explicit: reward path not invoked in M1
      rewardBoundary: REWARD_BOUNDARY,
      createdCreatorReward: false,
      createdPayout: false,
    },
  });
  if (!createdAudit.ok) {
    return baseResult({
      ok: false,
      event: 'settlement_failed',
      reason: 'audit_append_failed',
      commissionId,
      conversionId: commission.conversion_id,
      network,
      ledgerEntryId: ledgerId,
      externalRef,
    });
  }

  return baseResult({
    ok: true,
    event: 'settlement_created',
    commissionId,
    conversionId: commission.conversion_id,
    network,
    ledgerEntryId: ledgerId,
    externalRef,
    allocation,
    reused: false,
  });
}
