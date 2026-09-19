/**
 * Money System Foundation — freeze / program gate assertions.
 * Never unfreezes. Never activates Rewards/Commission programs.
 */

import { isMoneyPathFrozen, isProductionRuntime } from '@/lib/server/moneyPathFreeze';
import { isRewardsProgramActive } from '@/lib/rewards/programStatus';
import { isCommissionProgramPubliclyActive } from '@/lib/commissions/programStatus';
import { ECONOMIC_LEDGER_BOUNDARY } from '../types';

export type MoneyFoundationFreezeSnapshot = {
  moneyPathFrozen: boolean;
  rewardsProgramActive: boolean;
  commissionProgramActive: boolean;
  settlementEnabled: boolean;
  foundationWritesLedger: boolean;
  foundationWritesRewards: boolean;
  foundationWritesPayouts: boolean;
  productionRuntime: boolean;
  shadowAllowed: boolean;
  blockers: string[];
};

/**
 * Snapshot of fail-closed money gates.
 * Shadow path is allowed only when settlement remains OFF and programs are not
 * implying live payouts. Freeze may be false in non-prod tests — settlement
 * boundary still blocks real money.
 */
export function snapshotMoneyFoundationFreeze(
  _env: NodeJS.ProcessEnv = process.env,
): MoneyFoundationFreezeSnapshot {
  void _env;
  const moneyPathFrozen = isMoneyPathFrozen();
  const rewardsProgramActive = isRewardsProgramActive();
  const commissionProgramActive = isCommissionProgramPubliclyActive();
  const productionRuntime = isProductionRuntime();
  const blockers: string[] = [];

  if (ECONOMIC_LEDGER_BOUNDARY.settlementEnabled) {
    blockers.push('settlement_enabled');
  }
  if (ECONOMIC_LEDGER_BOUNDARY.foundationWritesLedger) {
    blockers.push('foundation_writes_ledger');
  }
  if (ECONOMIC_LEDGER_BOUNDARY.foundationWritesRewards) {
    blockers.push('foundation_writes_rewards');
  }
  if (ECONOMIC_LEDGER_BOUNDARY.foundationWritesPayouts) {
    blockers.push('foundation_writes_payouts');
  }
  if (productionRuntime && !moneyPathFrozen) {
    blockers.push('production_money_path_unfrozen');
  }
  if (productionRuntime && rewardsProgramActive) {
    blockers.push('production_rewards_active');
  }
  if (productionRuntime && commissionProgramActive) {
    blockers.push('production_commission_program_active');
  }

  const shadowAllowed = blockers.length === 0;

  return {
    moneyPathFrozen,
    rewardsProgramActive,
    commissionProgramActive,
    settlementEnabled: ECONOMIC_LEDGER_BOUNDARY.settlementEnabled,
    foundationWritesLedger: ECONOMIC_LEDGER_BOUNDARY.foundationWritesLedger,
    foundationWritesRewards: ECONOMIC_LEDGER_BOUNDARY.foundationWritesRewards,
    foundationWritesPayouts: ECONOMIC_LEDGER_BOUNDARY.foundationWritesPayouts,
    productionRuntime,
    shadowAllowed,
    blockers,
  };
}

export function assertMoneyShadowAllowed(
  env: NodeJS.ProcessEnv = process.env,
): MoneyFoundationFreezeSnapshot {
  const snap = snapshotMoneyFoundationFreeze(env);
  if (!snap.shadowAllowed) {
    throw new Error(
      `money_shadow_blocked:${snap.blockers.join(',') || 'unknown'}`,
    );
  }
  return snap;
}
