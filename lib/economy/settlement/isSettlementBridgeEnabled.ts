/**
 * Runtime gate for M1 Settlement Bridge.
 * Default OFF. Independent of Rewards/Commission program flags.
 * Does not mutate ECONOMIC_LEDGER_BOUNDARY (foundation remains settlementEnabled=false).
 */

export function isSettlementBridgeEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = (env.SETTLEMENT_BRIDGE_ENABLED ?? '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

export const SETTLEMENT_BRIDGE_ENV_KEY = 'SETTLEMENT_BRIDGE_ENABLED' as const;
