/**
 * Money System shadow pipeline — reconstructable economic evidence without settlement.
 *
 * Uses canonical authorities only:
 * - recordAttributedClick (optional, when creating click)
 * - recordConversion / resolveConversionAttribution
 * - recordCommission / transitionCommissionStatus
 * - splitCommissionCents (allocation projection — NOT persisted as balance)
 *
 * NEVER writes: affiliate_ledger_entries, creator_rewards, reward_payouts, ledger_settlements.
 * NEVER sets affiliate_commissions.ledger_entry_id.
 * NEVER implies withdrawable user balance.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  REWARDS_CREATOR_SHARE_BPS,
  splitCommissionCents,
} from '@/lib/rewards/config';
import { recordConversion, transitionConversionStatus } from '../recordConversion';
import {
  recordCommission,
  transitionCommissionStatus,
} from '../recordCommission';
import {
  ECONOMIC_LEDGER_BOUNDARY,
  type AffiliateNetwork,
  type AttributionLinkStatus,
  type CommissionStatus,
  type ConversionStatus,
  type EconomicIngestSource,
} from '../types';
import { assertMoneyShadowAllowed } from './assertMoneyFoundationFreeze';

export const MONEY_SHADOW_MODE = 'shadow_observation' as const;

/** Explicit lifecycle — do not collapse these. */
export const MONEY_EVENT_KINDS = [
  'CLICK',
  'CONVERSION',
  'COMMISSION_REPORTED',
  'COMMISSION_CONFIRMED',
  'COMMISSION_SETTLED', // never reached in shadow
  'LEDGER_PROJECTED', // projection only — not booked
  'REWARD_PROJECTED', // projection only — not withdrawable
] as const;

export type MoneyEventKind = (typeof MONEY_EVENT_KINDS)[number];

export type MoneyShadowAllocationProjection = {
  grossCommissionCents: number;
  currency: string;
  creatorShareBps: number;
  creatorCents: number;
  platformCents: number;
  withdrawable: false;
  settled: false;
  note: 'shadow_projection_only_not_user_balance';
};

export type MoneyShadowEvidence = {
  mode: typeof MONEY_SHADOW_MODE;
  freezeOk: true;
  settlementEnabled: false;
  offerId: string | null;
  clickId: string | null;
  conversionId: string | null;
  commissionId: string | null;
  attributionStatus: AttributionLinkStatus | null;
  conversionStatus: ConversionStatus | null;
  commissionStatus: CommissionStatus | null;
  network: AffiliateNetwork;
  externalConversionId: string;
  externalCommissionId: string;
  conversionReused: boolean;
  commissionReused: boolean;
  allocation: MoneyShadowAllocationProjection | null;
  chain: MoneyEventKind[];
  touchedForbiddenTables: string[];
  reconstructable: true;
};

const FORBIDDEN_WRITE_TABLES = [
  'affiliate_ledger_entries',
  'creator_rewards',
  'reward_payouts',
  'ledger_settlements',
  'commission_pools',
  'commission_allocations',
] as const;

export type MoneyShadowPipelineInput = {
  source: EconomicIngestSource;
  network: AffiliateNetwork;
  externalConversionId: string;
  externalCommissionId: string;
  grossCommissionCents: number;
  currency?: string;
  occurredAt?: string | Date;
  /** Existing click id — never invent from client user_id alone. */
  clickId?: string | null;
  offerId?: string | null;
  /** Advance conversion to confirmed after ingest (shadow observation). */
  confirmConversion?: boolean;
  /** Advance commission reported → approved (CONFIRMED ≠ SETTLED). */
  confirmCommission?: boolean;
  creatorShareBps?: number;
  actor?: string;
};

/**
 * Run shadow economic observation pipeline.
 * Caller supplies a Supabase client that may be a test mock.
 */
export async function runMoneyShadowPipeline(
  supabase: SupabaseClient,
  input: MoneyShadowPipelineInput,
): Promise<MoneyShadowEvidence> {
  assertMoneyShadowAllowed();
  if (ECONOMIC_LEDGER_BOUNDARY.settlementEnabled) {
    throw new Error('money_shadow_settlement_must_remain_off');
  }

  const occurredAt = input.occurredAt ?? new Date();
  const chain: MoneyEventKind[] = [];
  const touchedForbidden: string[] = [];

  // Wrap from() to detect forbidden writes if client exposes from.
  const originalFrom = supabase.from.bind(supabase);
  const guarded = {
    ...supabase,
    from(table: string) {
      const builder = originalFrom(table);
      if ((FORBIDDEN_WRITE_TABLES as readonly string[]).includes(table)) {
        // Instrument insert/update if present
        const b = builder as {
          insert?: (...args: unknown[]) => unknown;
          update?: (...args: unknown[]) => unknown;
        };
        if (typeof b.insert === 'function') {
          const prev = b.insert.bind(builder);
          b.insert = (...args: unknown[]) => {
            touchedForbidden.push(table);
            return prev(...args);
          };
        }
        if (typeof b.update === 'function') {
          const prev = b.update.bind(builder);
          b.update = (...args: unknown[]) => {
            touchedForbidden.push(table);
            return prev(...args);
          };
        }
      }
      return builder;
    },
  } as SupabaseClient;

  if (input.clickId) {
    chain.push('CLICK');
  }

  const conversion = await recordConversion(guarded, {
    source: input.source,
    network: input.network,
    externalConversionId: input.externalConversionId,
    occurredAt,
    clickId: input.clickId,
    offerId: input.offerId,
    status: 'received',
    actor: input.actor ?? 'money_shadow_pipeline',
  });

  if (!conversion) {
    throw new Error('money_shadow_conversion_failed');
  }
  chain.push('CONVERSION');

  let conversionStatus: ConversionStatus = conversion.status;
  if (input.confirmConversion !== false && conversionStatus === 'received') {
    const ok = await transitionConversionStatus(guarded, {
      conversionId: conversion.conversionId,
      toStatus: 'confirmed',
      actor: input.actor ?? 'money_shadow_pipeline',
    });
    if (ok.ok) conversionStatus = 'confirmed';
  }

  const commission = await recordCommission(guarded, {
    conversionId: conversion.conversionId,
    source: input.source,
    network: input.network,
    externalCommissionId: input.externalCommissionId,
    grossCommissionCents: input.grossCommissionCents,
    currency: input.currency ?? 'MXN',
    occurredAt,
    status: 'reported',
    actor: input.actor ?? 'money_shadow_pipeline',
  });

  if (!commission) {
    throw new Error('money_shadow_commission_failed');
  }
  chain.push('COMMISSION_REPORTED');

  let commissionStatus: CommissionStatus = commission.status;
  if (input.confirmCommission !== false && commissionStatus === 'reported') {
    const ok = await transitionCommissionStatus(guarded, {
      commissionId: commission.commissionId,
      toStatus: 'approved',
      actor: input.actor ?? 'money_shadow_pipeline',
    });
    if (ok.ok) {
      commissionStatus = 'approved';
      chain.push('COMMISSION_CONFIRMED');
    }
  }

  // Explicit: SETTLED is never reached in shadow.
  void ('COMMISSION_SETTLED' satisfies MoneyEventKind);

  const split = splitCommissionCents(
    commission.grossCommissionCents,
    input.creatorShareBps ?? REWARDS_CREATOR_SHARE_BPS,
  );
  const allocation: MoneyShadowAllocationProjection = {
    grossCommissionCents: commission.grossCommissionCents,
    currency: commission.currency,
    creatorShareBps: input.creatorShareBps ?? REWARDS_CREATOR_SHARE_BPS,
    creatorCents: split.creatorCents,
    platformCents: split.platformCents,
    withdrawable: false,
    settled: false,
    note: 'shadow_projection_only_not_user_balance',
  };
  chain.push('LEDGER_PROJECTED');
  chain.push('REWARD_PROJECTED');

  if (touchedForbidden.length > 0) {
    throw new Error(
      `money_shadow_forbidden_write:${[...new Set(touchedForbidden)].join(',')}`,
    );
  }

  // ledger_entry_id must remain unset on commission authority
  if (commission.ledgerEntryId !== null) {
    throw new Error('money_shadow_commission_linked_to_ledger');
  }

  return {
    mode: MONEY_SHADOW_MODE,
    freezeOk: true,
    settlementEnabled: false,
    offerId: conversion.offerId,
    clickId: conversion.clickId,
    conversionId: conversion.conversionId,
    commissionId: commission.commissionId,
    attributionStatus: conversion.attributionStatus,
    conversionStatus,
    commissionStatus,
    network: input.network,
    externalConversionId: conversion.externalConversionId,
    externalCommissionId: commission.externalCommissionId,
    conversionReused: conversion.reused,
    commissionReused: commission.reused,
    allocation,
    chain,
    touchedForbiddenTables: [],
    reconstructable: true,
  };
}

/**
 * Pure: project allocations without any DB writes.
 */
export function projectShadowAllocations(input: {
  grossCommissionCents: number;
  currency?: string;
  creatorShareBps?: number;
}): MoneyShadowAllocationProjection {
  if (
    !Number.isFinite(input.grossCommissionCents) ||
    input.grossCommissionCents < 0 ||
    !Number.isInteger(input.grossCommissionCents)
  ) {
    throw new Error('invalid_gross_commission_cents');
  }
  const split = splitCommissionCents(
    input.grossCommissionCents,
    input.creatorShareBps ?? REWARDS_CREATOR_SHARE_BPS,
  );
  return {
    grossCommissionCents: input.grossCommissionCents,
    currency: (input.currency ?? 'MXN').toUpperCase(),
    creatorShareBps: input.creatorShareBps ?? REWARDS_CREATOR_SHARE_BPS,
    creatorCents: split.creatorCents,
    platformCents: split.platformCents,
    withdrawable: false,
    settled: false,
    note: 'shadow_projection_only_not_user_balance',
  };
}
