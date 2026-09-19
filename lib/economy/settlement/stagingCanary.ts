/**
 * M2 Settlement staging canary — hard guards for controlled settlement ops.
 * Default dry-run (no writes). --execute only on staging with bridge enabled.
 * Never activates rewards/payouts. Reuses settleCommission.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isCommissionProgramPubliclyActive } from '@/lib/commissions/programStatus';
import { isRewardsProgramActive } from '@/lib/rewards/programStatus';
import {
  extractSupabaseProjectRef,
  isProductionSupabaseRef,
  isStagingSupabaseRef,
  PRODUCTION_SUPABASE_REF,
  resolveAventaSupabaseTarget,
  STAGING_SUPABASE_REF,
} from '@/lib/supabase/projectRefs';
import { isMoneyPathFrozen, isProductionRuntime } from '@/lib/server/moneyPathFreeze';
import { ECONOMIC_LEDGER_BOUNDARY } from '../types';
import {
  buildSettlementDiagnostics,
  buildSettlementOpsSnapshot,
  type SettlementDiagnostics,
  type SettlementOpsSnapshot,
} from './diagnostics';
import { isSettlementBridgeEnabled } from './isSettlementBridgeEnabled';
import { settleCommission, type SettleCommissionInput } from './settleCommission';
import type { SettlementBridgeResult } from './types';

export const SETTLEMENT_STAGING_CANARY_ACTOR = 'settlement_staging_canary_m2' as const;

export type SettlementStagingCanaryMode = 'dry_run' | 'execute';

export type SettlementStagingCanaryRejectReason =
  | 'production_runtime_forbidden'
  | 'settlement_bridge_disabled'
  | 'money_path_frozen'
  | 'target_not_staging'
  | 'supabase_ref_not_staging'
  | 'production_supabase_ref_forbidden'
  | 'commission_id_required'
  | 'commission_not_found'
  | 'commission_not_approved'
  | 'rewards_program_active'
  | 'commission_program_active';

export type SettlementStagingCanaryGuardsOk = {
  ok: true;
  target: 'staging';
  supabaseRef: string;
  settlementBridgeEnabled: true;
  moneyPathFrozen: false;
  productionRuntime: false;
  ops: SettlementOpsSnapshot;
};

export type SettlementStagingCanaryGuardsFail = {
  ok: false;
  reason: SettlementStagingCanaryRejectReason | string;
  ops: SettlementOpsSnapshot;
};

export type SettlementStagingCanaryGuardsResult =
  | SettlementStagingCanaryGuardsOk
  | SettlementStagingCanaryGuardsFail;

export type SettlementStagingCanaryDryRunResult = {
  mode: 'dry_run';
  ok: true;
  guards: SettlementStagingCanaryGuardsOk;
  commissionId: string;
  commissionStatus: 'approved';
  diagnostics: SettlementDiagnostics;
  wouldSettle: true;
  writesPerformed: false;
};

export type SettlementStagingCanaryExecuteResult = {
  mode: 'execute';
  ok: boolean;
  guards: SettlementStagingCanaryGuardsOk;
  commissionId: string;
  settlement: SettlementBridgeResult;
  diagnostics: SettlementDiagnostics | null;
  writesPerformed: boolean;
};

export type SettlementStagingCanaryBlockedResult = {
  mode: SettlementStagingCanaryMode;
  ok: false;
  reason: SettlementStagingCanaryRejectReason | string;
  ops: SettlementOpsSnapshot;
  writesPerformed: false;
};

export type SettlementStagingCanaryResult =
  | SettlementStagingCanaryDryRunResult
  | SettlementStagingCanaryExecuteResult
  | SettlementStagingCanaryBlockedResult;

function guardsFail(
  reason: SettlementStagingCanaryRejectReason | string,
  env: NodeJS.ProcessEnv,
): SettlementStagingCanaryGuardsFail {
  return {
    ok: false,
    reason,
    ops: buildSettlementOpsSnapshot(env),
  };
}

/**
 * Pure env/runtime guards — no DB. Fail-closed for production and frozen money path.
 */
export function assertSettlementStagingCanaryEnv(
  env: NodeJS.ProcessEnv = process.env,
): SettlementStagingCanaryGuardsResult {
  const ops = buildSettlementOpsSnapshot(env);

  if (isProductionRuntime()) {
    return guardsFail('production_runtime_forbidden', env);
  }

  if (!isSettlementBridgeEnabled(env)) {
    return guardsFail('settlement_bridge_disabled', env);
  }

  if (isMoneyPathFrozen()) {
    return guardsFail('money_path_frozen', env);
  }

  if (isRewardsProgramActive()) {
    return guardsFail('rewards_program_active', env);
  }

  if (isCommissionProgramPubliclyActive()) {
    return guardsFail('commission_program_active', env);
  }

  const target = resolveAventaSupabaseTarget(env);
  if (target !== 'staging') {
    return guardsFail('target_not_staging', env);
  }

  const ref = extractSupabaseProjectRef(env.NEXT_PUBLIC_SUPABASE_URL ?? '');
  if (!ref || !isStagingSupabaseRef(ref)) {
    return {
      ok: false,
      reason: `supabase_ref_not_staging:expected=${STAGING_SUPABASE_REF}:got=${ref ?? 'null'}`,
      ops,
    };
  }

  if (isProductionSupabaseRef(ref)) {
    return {
      ok: false,
      reason: `production_supabase_ref_forbidden:${PRODUCTION_SUPABASE_REF}`,
      ops,
    };
  }

  const expected = (env.AVENTA_EXPECTED_SUPABASE_REF ?? '').trim().toLowerCase();
  if (expected && expected !== STAGING_SUPABASE_REF) {
    return {
      ok: false,
      reason: `expected_ref_mismatch:expected=${STAGING_SUPABASE_REF}:got=${expected}`,
      ops,
    };
  }

  return {
    ok: true,
    target: 'staging',
    supabaseRef: ref,
    settlementBridgeEnabled: true,
    moneyPathFrozen: false,
    productionRuntime: false,
    ops,
  };
}

async function loadCommissionStatus(
  supabase: SupabaseClient,
  commissionId: string,
): Promise<{ status: string } | null> {
  const { data, error } = await supabase
    .from('affiliate_commissions')
    .select('id, status')
    .eq('id', commissionId)
    .maybeSingle();
  if (error || !data?.id) return null;
  return { status: String(data.status ?? '') };
}

export type RunSettlementStagingCanaryInput = {
  commissionId: string;
  mode?: SettlementStagingCanaryMode;
  actor?: string;
  env?: NodeJS.ProcessEnv;
  creatorShareBps?: number;
};

/**
 * Staging-only settlement canary. Dry-run validates approved commission + diagnostics.
 * Execute calls settleCommission then refreshes diagnostics.
 */
export async function runSettlementStagingCanary(
  supabase: SupabaseClient,
  input: RunSettlementStagingCanaryInput,
): Promise<SettlementStagingCanaryResult> {
  const env = input.env ?? process.env;
  const mode = input.mode ?? 'dry_run';
  const commissionId = (input.commissionId ?? '').trim();

  if (!commissionId) {
    return {
      mode,
      ok: false,
      reason: 'commission_id_required',
      ops: buildSettlementOpsSnapshot(env),
      writesPerformed: false,
    };
  }

  const guards = assertSettlementStagingCanaryEnv(env);
  if (!guards.ok) {
    return {
      mode,
      ok: false,
      reason: guards.reason,
      ops: guards.ops,
      writesPerformed: false,
    };
  }

  const row = await loadCommissionStatus(supabase, commissionId);
  if (!row) {
    return {
      mode,
      ok: false,
      reason: 'commission_not_found',
      ops: guards.ops,
      writesPerformed: false,
    };
  }

  if (row.status !== 'approved') {
    return {
      mode,
      ok: false,
      reason: 'commission_not_approved',
      ops: guards.ops,
      writesPerformed: false,
    };
  }

  if (mode === 'dry_run') {
    const diagnostics = await buildSettlementDiagnostics(supabase, commissionId, env);
    if (!diagnostics) {
      return {
        mode,
        ok: false,
        reason: 'commission_not_found',
        ops: guards.ops,
        writesPerformed: false,
      };
    }
    return {
      mode: 'dry_run',
      ok: true,
      guards,
      commissionId,
      commissionStatus: 'approved',
      diagnostics,
      wouldSettle: true,
      writesPerformed: false,
    };
  }

  const settleInput: SettleCommissionInput = {
    commissionId,
    actor: input.actor ?? SETTLEMENT_STAGING_CANARY_ACTOR,
    creatorShareBps: input.creatorShareBps,
  };
  const settlement = await settleCommission(supabase, settleInput);
  const diagnostics = await buildSettlementDiagnostics(supabase, commissionId, env);
  const writesPerformed =
    settlement.ok &&
    (settlement.event === 'settlement_created' ||
      settlement.event === 'settlement_reused');

  return {
    mode: 'execute',
    ok: settlement.ok,
    guards,
    commissionId,
    settlement,
    diagnostics,
    writesPerformed,
  };
}

/** Documented boundary — M2 canary never crosses reward/payout creation. */
export const SETTLEMENT_STAGING_CANARY_BOUNDARY = {
  settlementBridgeRequired: true,
  productionRuntimeForbidden: true,
  moneyPathMustBeUnfrozen: true,
  defaultMode: 'dry_run' as const,
  economicLedgerSettlementEnabled: ECONOMIC_LEDGER_BOUNDARY.settlementEnabled,
  createsRewards: false,
  createsPayouts: false,
} as const;
