/**
 * Controlled activation readiness — declarative checklist.
 * Does NOT enable money. Fail-closed by design.
 *
 * Verdict READY_FOR_CONTROLLED_ACTIVATION means staging canaries may proceed
 * under explicit flags — never that production should pay out.
 */

import { isMoneyPathFrozen, isProductionRuntime } from '@/lib/server/moneyPathFreeze';
import { isSettlementBridgeEnabled } from '@/lib/economy/settlement/isSettlementBridgeEnabled';
import { isRewardsProgramActive } from '@/lib/rewards/programStatus';

export type ActivationCheck = {
  id: string;
  ok: boolean;
  detail: string;
  severity: 'blocker' | 'gate' | 'info';
};

export type ControlledActivationReport = {
  verdict: 'READY_FOR_CONTROLLED_ACTIVATION' | 'NOT_READY' | 'SAFE_FROZEN';
  productionRuntime: boolean;
  moneyPathFrozen: boolean;
  settlementBridgeEnabled: boolean;
  rewardsProgramActive: boolean;
  checks: ActivationCheck[];
  remainingBlockers: string[];
};

function isCommissionProgramActive(): boolean {
  const v = (process.env.COMMISSION_PROGRAM_ACTIVE ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/**
 * Evaluate readiness from env/runtime only (no DB).
 * Network ingest evidence remains BLOCKED_EXTERNAL — always listed.
 */
export function evaluateControlledActivationReadiness(): ControlledActivationReport {
  const productionRuntime = isProductionRuntime();
  const moneyPathFrozen = isMoneyPathFrozen();
  const settlementBridgeEnabled = isSettlementBridgeEnabled();
  const rewardsProgramActive = isRewardsProgramActive();
  const commissionProgramActive = isCommissionProgramActive();

  const checks: ActivationCheck[] = [
    {
      id: 'money_path_freeze_present',
      ok: true,
      detail: moneyPathFrozen
        ? 'MONEY_PATH_FROZEN active (fail-closed)'
        : 'MONEY_PATH_FROZEN explicitly off',
      severity: moneyPathFrozen ? 'info' : 'gate',
    },
    {
      id: 'settlement_runtime_off_by_default',
      ok: !settlementBridgeEnabled || !productionRuntime,
      detail: settlementBridgeEnabled
        ? productionRuntime
          ? 'SETTLEMENT_BRIDGE_ENABLED on in production — unsafe without canary protocol'
          : 'SETTLEMENT_BRIDGE_ENABLED on (non-prod — canary surface)'
        : 'SETTLEMENT_BRIDGE_ENABLED off',
      severity: settlementBridgeEnabled && productionRuntime ? 'blocker' : 'info',
    },
    {
      id: 'rewards_program_off',
      ok: !rewardsProgramActive || !productionRuntime,
      detail: rewardsProgramActive
        ? productionRuntime
          ? 'REWARDS_PROGRAM_ACTIVE on in production'
          : 'REWARDS_PROGRAM_ACTIVE on (non-prod)'
        : 'REWARDS_PROGRAM_ACTIVE off (fail-closed)',
      severity: rewardsProgramActive && productionRuntime ? 'blocker' : 'info',
    },
    {
      id: 'commission_program_off',
      ok: !commissionProgramActive || !productionRuntime,
      detail: commissionProgramActive
        ? 'COMMISSION_PROGRAM_ACTIVE on'
        : 'COMMISSION_PROGRAM_ACTIVE off',
      severity: commissionProgramActive && productionRuntime ? 'gate' : 'info',
    },
    {
      id: 'network_ingest_evidence',
      ok: false,
      detail:
        'BLOCKED_EXTERNAL: no official ML/Amazon conversion ingest wired (registry empty / NOT_SUPPORTED_BY_OFFICIAL_API)',
      severity: 'blocker',
    },
    {
      id: 'click_to_commission_code',
      ok: true,
      detail: 'Click→Attribution→Conversion→Commission writers + idempotency present in code',
      severity: 'info',
    },
    {
      id: 'settlement_reversal_money_movement',
      ok: true,
      detail:
        'executeSettlementReversal writes compensating ledger entry (settlement:reversal:commission:{id} = -N); idempotent via UNIQUE(network, external_ref)',
      severity: 'info',
    },
    {
      id: 'canonical_ledger_single_sot',
      ok: true,
      detail:
        'affiliate_ledger_entries is sole SoT; CSV/manual are network evidence ingest with reserved settlement: refs blocked',
      severity: 'info',
    },
    {
      id: 'audit_append_fail_closed',
      ok: true,
      detail: 'appendEconomicEvent returns ok/error; transitions/settlement/reversal fail on audit_append_failed',
      severity: 'info',
    },
  ];

  const remainingBlockers = checks
    .filter((c) => !c.ok && c.severity === 'blocker')
    .map((c) => c.id);

  let verdict: ControlledActivationReport['verdict'] = 'NOT_READY';
  if (productionRuntime && moneyPathFrozen && remainingBlockers.length > 0) {
    verdict = 'SAFE_FROZEN';
  } else if (
    !productionRuntime &&
    remainingBlockers.every((id) => id === 'network_ingest_evidence') &&
    moneyPathFrozen
  ) {
    verdict = 'READY_FOR_CONTROLLED_ACTIVATION';
  } else if (remainingBlockers.length === 0 && !productionRuntime) {
    verdict = 'READY_FOR_CONTROLLED_ACTIVATION';
  }

  return {
    verdict,
    productionRuntime,
    moneyPathFrozen,
    settlementBridgeEnabled,
    rewardsProgramActive,
    checks,
    remainingBlockers,
  };
}
