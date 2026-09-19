/**
 * Minimal operator diagnostics for M1 settlement bridge.
 * M2: ops snapshot for staging canary / settlement-ops observability.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isCommissionProgramPubliclyActive } from '@/lib/commissions/programStatus';
import { REWARDS_CREATOR_SHARE_BPS, splitCommissionCents } from '@/lib/rewards/config';
import { isRewardsProgramActive } from '@/lib/rewards/programStatus';
import {
  extractSupabaseProjectRef,
  resolveAventaSupabaseTarget,
} from '@/lib/supabase/projectRefs';
import { isMoneyPathFrozen, isProductionRuntime } from '@/lib/server/moneyPathFreeze';
import { ECONOMIC_LEDGER_BOUNDARY } from '../types';
import { buildSettlementExternalRef } from './externalRef';
import { isSettlementBridgeEnabled } from './isSettlementBridgeEnabled';

export type SettlementOpsSnapshot = {
  settlementBridgeEnabled: boolean;
  moneyPathFrozen: boolean;
  productionRuntime: boolean;
  supabaseTarget: string;
  supabaseRef: string | null;
  rewardsProgramActive: boolean;
  commissionProgramActive: boolean;
  economicLedgerBoundary: {
    settlementEnabled: boolean;
    foundationWritesLedger: boolean;
    foundationWritesRewards: boolean;
    foundationWritesPayouts: boolean;
  };
  stagingCanaryEligible: boolean;
  blockers: string[];
};

export function buildSettlementOpsSnapshot(
  env: NodeJS.ProcessEnv = process.env,
): SettlementOpsSnapshot {
  const settlementBridgeEnabled = isSettlementBridgeEnabled(env);
  const moneyPathFrozen = isMoneyPathFrozen();
  const productionRuntime = isProductionRuntime();
  const supabaseTarget = resolveAventaSupabaseTarget(env);
  const supabaseRef = extractSupabaseProjectRef(env.NEXT_PUBLIC_SUPABASE_URL ?? '');
  const rewardsProgramActive = isRewardsProgramActive();
  const commissionProgramActive = isCommissionProgramPubliclyActive();

  const blockers: string[] = [];
  if (productionRuntime) blockers.push('production_runtime');
  if (!settlementBridgeEnabled) blockers.push('settlement_bridge_disabled');
  if (moneyPathFrozen) blockers.push('money_path_frozen');
  if (supabaseTarget !== 'staging') blockers.push('target_not_staging');
  if (rewardsProgramActive) blockers.push('rewards_program_active');
  if (commissionProgramActive) blockers.push('commission_program_active');
  if (ECONOMIC_LEDGER_BOUNDARY.settlementEnabled) {
    blockers.push('economic_ledger_settlement_enabled');
  }

  const stagingCanaryEligible = blockers.length === 0;

  return {
    settlementBridgeEnabled,
    moneyPathFrozen,
    productionRuntime,
    supabaseTarget,
    supabaseRef,
    rewardsProgramActive,
    commissionProgramActive,
    economicLedgerBoundary: {
      settlementEnabled: ECONOMIC_LEDGER_BOUNDARY.settlementEnabled,
      foundationWritesLedger: ECONOMIC_LEDGER_BOUNDARY.foundationWritesLedger,
      foundationWritesRewards: ECONOMIC_LEDGER_BOUNDARY.foundationWritesRewards,
      foundationWritesPayouts: ECONOMIC_LEDGER_BOUNDARY.foundationWritesPayouts,
    },
    stagingCanaryEligible,
    blockers,
  };
}

export type SettlementDiagnostics = {
  ops: SettlementOpsSnapshot;
  settlementBridgeEnabled: boolean;
  commissionId: string;
  commissionStatus: string | null;
  conversionId: string | null;
  network: string | null;
  grossCommissionCents: number | null;
  currency: string | null;
  ledgerEntryId: string | null;
  externalRef: string | null;
  ledgerAmountCents: number | null;
  ledgerCurrency: string | null;
  creatorAllocationCents: number | null;
  platformAllocationCents: number | null;
  withdrawable: false;
  settled: false;
  rewardBoundary: 'future_createRewardFromLedgerEntry';
  timestamps: {
    commissionOccurredAt: string | null;
    commissionUpdatedAt: string | null;
    ledgerCreatedAt: string | null;
  };
  lastEvent: {
    eventType: string;
    createdAt: string;
    payload: Record<string, unknown>;
  } | null;
};

export async function buildSettlementDiagnostics(
  supabase: SupabaseClient,
  commissionId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SettlementDiagnostics | null> {
  const id = commissionId.trim();
  if (!id) return null;
  const ops = buildSettlementOpsSnapshot(env);

  const { data: commission } = await supabase
    .from('affiliate_commissions')
    .select(
      'id, conversion_id, network, gross_commission_cents, currency, status, ledger_entry_id, occurred_at, updated_at',
    )
    .eq('id', id)
    .maybeSingle();

  if (!commission?.id) return null;

  const gross =
    typeof commission.gross_commission_cents === 'number'
      ? commission.gross_commission_cents
      : null;
  const split =
    gross !== null
      ? splitCommissionCents(gross, REWARDS_CREATOR_SHARE_BPS)
      : null;

  let ledger: {
    id: string;
    amount_cents: number;
    currency: string;
    external_ref: string | null;
    created_at: string;
    meta: Record<string, unknown> | null;
  } | null = null;

  if (commission.ledger_entry_id) {
    const { data } = await supabase
      .from('affiliate_ledger_entries')
      .select('id, amount_cents, currency, external_ref, created_at, meta')
      .eq('id', commission.ledger_entry_id)
      .maybeSingle();
    if (data && typeof data === 'object' && 'id' in data && data.id) {
      const row = data as Record<string, unknown>;
      ledger = {
        id: String(row.id),
        amount_cents: Number(row.amount_cents),
        currency: String(row.currency ?? 'MXN'),
        external_ref:
          typeof row.external_ref === 'string' ? row.external_ref : null,
        created_at: String(row.created_at ?? ''),
        meta:
          row.meta && typeof row.meta === 'object'
            ? (row.meta as Record<string, unknown>)
            : null,
      };
    }
  }

  const externalRef =
    ledger?.external_ref ??
    (commission.id ? buildSettlementExternalRef(String(commission.id)) : null);

  const metaSettlement =
    ledger?.meta &&
    typeof ledger.meta === 'object' &&
    ledger.meta !== null &&
    'settlement' in ledger.meta
      ? (ledger.meta as { settlement?: Record<string, unknown> }).settlement
      : null;

  const { data: events } = await supabase
    .from('affiliate_economic_events')
    .select('event_type, created_at, payload')
    .eq('entity_type', 'settlement')
    .eq('entity_id', id)
    .order('created_at', { ascending: false })
    .limit(1);

  const last = Array.isArray(events) && events[0] ? events[0] : null;

  return {
    ops,
    settlementBridgeEnabled: isSettlementBridgeEnabled(env),
    commissionId: String(commission.id),
    commissionStatus: (commission.status as string) ?? null,
    conversionId: (commission.conversion_id as string) ?? null,
    network: (commission.network as string) ?? null,
    grossCommissionCents: gross,
    currency: commission.currency
      ? String(commission.currency).toUpperCase()
      : null,
    ledgerEntryId: ledger?.id ?? (commission.ledger_entry_id as string | null) ?? null,
    externalRef,
    ledgerAmountCents: ledger?.amount_cents ?? null,
    ledgerCurrency: ledger?.currency
      ? String(ledger.currency).toUpperCase()
      : null,
    creatorAllocationCents:
      typeof metaSettlement?.creatorAllocationCents === 'number'
        ? metaSettlement.creatorAllocationCents
        : (split?.creatorCents ?? null),
    platformAllocationCents:
      typeof metaSettlement?.platformAllocationCents === 'number'
        ? metaSettlement.platformAllocationCents
        : (split?.platformCents ?? null),
    withdrawable: false,
    settled: false,
    rewardBoundary: 'future_createRewardFromLedgerEntry',
    timestamps: {
      commissionOccurredAt: (commission.occurred_at as string) ?? null,
      commissionUpdatedAt: (commission.updated_at as string) ?? null,
      ledgerCreatedAt: ledger?.created_at ?? null,
    },
    lastEvent: last
      ? {
          eventType: String((last as { event_type: string }).event_type),
          createdAt: String((last as { created_at: string }).created_at),
          payload:
            ((last as { payload?: Record<string, unknown> }).payload as Record<
              string,
              unknown
            >) ?? {},
        }
      : null,
  };
}
