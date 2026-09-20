/**
 * S6.1 — Money-path / LLM isolation asserts for Deal Alerts.
 */

import { DEAL_INTELLIGENCE_ECONOMY_BOUNDARY } from '@/lib/dealIntelligence/constants';
import { assertDealIntelligenceMoneyUntouched } from '@/lib/dealIntelligence/safety';
import { DEAL_ALERTS_ECONOMY_BOUNDARY } from './constants';

export function assertDealAlertsMoneyUntouched(): {
  ok: true;
  dealAlerts: typeof DEAL_ALERTS_ECONOMY_BOUNDARY;
  dealIntelligence: typeof DEAL_INTELLIGENCE_ECONOMY_BOUNDARY;
} {
  if (DEAL_ALERTS_ECONOMY_BOUNDARY.settlementEnabled) {
    throw new Error('Deal Alerts settlement must stay OFF');
  }
  if (DEAL_ALERTS_ECONOMY_BOUNDARY.moneyPathRequired) {
    throw new Error('Deal Alerts must not require money path');
  }
  if (
    DEAL_ALERTS_ECONOMY_BOUNDARY.writesRewards ||
    DEAL_ALERTS_ECONOMY_BOUNDARY.writesPayouts ||
    DEAL_ALERTS_ECONOMY_BOUNDARY.writesCommissions ||
    DEAL_ALERTS_ECONOMY_BOUNDARY.writesAttribution
  ) {
    throw new Error('Deal Alerts must not write money entities');
  }
  assertDealIntelligenceMoneyUntouched();
  return {
    ok: true,
    dealAlerts: DEAL_ALERTS_ECONOMY_BOUNDARY,
    dealIntelligence: DEAL_INTELLIGENCE_ECONOMY_BOUNDARY,
  };
}

/** Documented: Deal Alerts never call LLMs as authority. */
export const DEAL_ALERTS_LLM_AS_AUTHORITY = false as const;
