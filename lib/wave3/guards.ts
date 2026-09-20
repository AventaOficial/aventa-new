/**
 * WAVE 3 — staging firewall + flag snapshots.
 * Fail-closed. Never writes. Never exposes secrets.
 */

import {
  extractSupabaseProjectRef,
  isProductionSupabaseRef,
  isStagingSupabaseRef,
  PRODUCTION_SUPABASE_REF,
  STAGING_SUPABASE_REF,
} from '@/lib/supabase/projectRefs';
import {
  isMoneyPathFrozen,
  isProductionRuntime,
} from '@/lib/server/moneyPathFreeze';
import { isDistributionEngineEnabled } from '@/lib/distribution/constants';
import { isSettlementBridgeEnabled } from '@/lib/economy/settlement/isSettlementBridgeEnabled';
import { isRewardsProgramActive } from '@/lib/rewards/programStatus';
import { isCommissionProgramPubliclyActive } from '@/lib/commissions/programStatus';
import { isSupplyAutomationEnabled } from '@/lib/supply/policy';
import { isMachinePendingWriteEnabled } from '@/lib/bots/ingest/machineLiveInsertEligibility';

export type Wave3FlagSnapshot = {
  SUPPLY_AUTOMATION_ENABLED: string;
  BOT_INGEST_MACHINE_PENDING_WRITES: string;
  DISTRIBUTION_ENGINE_ENABLED: string;
  SETTLEMENT_BRIDGE_ENABLED: string;
  MONEY_PATH_FROZEN: string;
  REWARDS_PROGRAM_ACTIVE: string;
  COMMISSION_PROGRAM_ACTIVE: string;
  supplyOn: boolean;
  machineWritesOn: boolean;
  distributionOn: boolean;
  settlementOn: boolean;
  moneyFrozen: boolean;
  rewardsOn: boolean;
  commissionOn: boolean;
};

export type Wave3StagingGuardOk = {
  ok: true;
  target: 'staging';
  supabaseRef: string;
  productionRuntime: false;
};

export type Wave3StagingGuardFail = {
  ok: false;
  reason: string;
};

export function snapshotWave3Flags(
  env: NodeJS.ProcessEnv = process.env,
): Wave3FlagSnapshot {
  return {
    SUPPLY_AUTOMATION_ENABLED: env.SUPPLY_AUTOMATION_ENABLED ?? '(unset)',
    BOT_INGEST_MACHINE_PENDING_WRITES:
      env.BOT_INGEST_MACHINE_PENDING_WRITES ?? '(unset)',
    DISTRIBUTION_ENGINE_ENABLED: env.DISTRIBUTION_ENGINE_ENABLED ?? '(unset)',
    SETTLEMENT_BRIDGE_ENABLED: env.SETTLEMENT_BRIDGE_ENABLED ?? '(unset)',
    MONEY_PATH_FROZEN: env.MONEY_PATH_FROZEN ?? '(unset)',
    REWARDS_PROGRAM_ACTIVE: env.REWARDS_PROGRAM_ACTIVE ?? '(unset)',
    COMMISSION_PROGRAM_ACTIVE: env.COMMISSION_PROGRAM_ACTIVE ?? '(unset)',
    supplyOn: isSupplyAutomationEnabled(env),
    machineWritesOn: isMachinePendingWriteEnabled(),
    distributionOn: isDistributionEngineEnabled(env),
    settlementOn: isSettlementBridgeEnabled(env),
    moneyFrozen: isMoneyPathFrozen(),
    rewardsOn: isRewardsProgramActive(),
    commissionOn: isCommissionProgramPubliclyActive(),
  };
}

/**
 * Abort if not staging-only. Does not mutate env.
 */
export function assertWave3StagingOnly(
  env: NodeJS.ProcessEnv = process.env,
): Wave3StagingGuardOk | Wave3StagingGuardFail {
  if (isProductionRuntime()) {
    return { ok: false, reason: 'production_runtime_forbidden' };
  }
  const target = (env.AVENTA_SUPABASE_TARGET ?? '').trim().toLowerCase();
  if (target !== 'staging') {
    return { ok: false, reason: `target_not_staging:got=${target || 'empty'}` };
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const ref = extractSupabaseProjectRef(url);
  if (!ref || !isStagingSupabaseRef(ref)) {
    return {
      ok: false,
      reason: `supabase_ref_not_staging:expected=${STAGING_SUPABASE_REF}:got=${ref ?? 'null'}`,
    };
  }
  if (isProductionSupabaseRef(ref)) {
    return {
      ok: false,
      reason: `production_supabase_ref_forbidden:${PRODUCTION_SUPABASE_REF}`,
    };
  }
  const expected = (env.AVENTA_EXPECTED_SUPABASE_REF ?? '').trim();
  if (expected && expected !== STAGING_SUPABASE_REF) {
    return {
      ok: false,
      reason: `expected_ref_mismatch:expected=${STAGING_SUPABASE_REF}:got=${expected}`,
    };
  }
  return { ok: true, target: 'staging', supabaseRef: ref, productionRuntime: false };
}

/** Restore fail-closed defaults after process-scoped canary. */
export function restoreWave3FailClosedFlags(): Wave3FlagSnapshot {
  delete process.env.SUPPLY_AUTOMATION_ENABLED;
  delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
  process.env.DISTRIBUTION_ENGINE_ENABLED = 'false';
  process.env.SETTLEMENT_BRIDGE_ENABLED = 'false';
  process.env.REWARDS_PROGRAM_ACTIVE = 'false';
  process.env.COMMISSION_PROGRAM_ACTIVE = 'false';
  process.env.MONEY_PATH_FROZEN = 'true';
  return snapshotWave3Flags();
}

export const WAVE3_PRODUCTION_REF = PRODUCTION_SUPABASE_REF;
export const WAVE3_STAGING_REF = STAGING_SUPABASE_REF;
