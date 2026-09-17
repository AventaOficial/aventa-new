/**
 * Safety asserts — Deal Intelligence must not touch money / Supply WRITE / publish.
 */

import { ECONOMIC_LEDGER_BOUNDARY } from '@/lib/economy/types';
import {
  DEAL_INTELLIGENCE_ECONOMY_BOUNDARY,
  DEAL_INTELLIGENCE_PUBLICATION_BOUNDARY,
} from './constants';
import type { DealDetectedEvent } from './types';

export function assertDealIntelligenceMoneyUntouched(): {
  ok: true;
  ledger: typeof ECONOMIC_LEDGER_BOUNDARY;
  di: typeof DEAL_INTELLIGENCE_ECONOMY_BOUNDARY;
} {
  if (DEAL_INTELLIGENCE_ECONOMY_BOUNDARY.settlementEnabled) {
    throw new Error('DI settlement must stay OFF');
  }
  if (ECONOMIC_LEDGER_BOUNDARY.settlementEnabled) {
    throw new Error('Economy settlement must stay OFF');
  }
  return { ok: true, ledger: ECONOMIC_LEDGER_BOUNDARY, di: DEAL_INTELLIGENCE_ECONOMY_BOUNDARY };
}

export function assertDealDetectedDoesNotPublish(event: DealDetectedEvent): void {
  if (event.publicationAllowed !== false) {
    throw new Error('deal.detected must set publicationAllowed=false');
  }
  if (DEAL_INTELLIGENCE_PUBLICATION_BOUNDARY.autoPublish) {
    throw new Error('DI autoPublish must stay false');
  }
}

export function isSupplyWriteEnabledFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const v = (env.SUPPLY_ENGINE_WRITE ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}
