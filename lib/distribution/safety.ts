import {
  DEAL_INTELLIGENCE_PUBLICATION_BOUNDARY,
} from '@/lib/dealIntelligence/constants';
import { ECONOMIC_LEDGER_BOUNDARY } from '@/lib/economy/types';
import {
  DISTRIBUTION_ENGINE_BOUNDARIES,
  isDistributionEngineEnabled,
} from './constants';

/**
 * Contract asserts — Distribution must never flip money/Supply/DI publication gates.
 */
export function assertDistributionMoneyUntouched(): void {
  if (DISTRIBUTION_ENGINE_BOUNDARIES.settlementEnabled) {
    throw new Error('Distribution must keep settlementEnabled=false');
  }
  if (DISTRIBUTION_ENGINE_BOUNDARIES.writesLedger) {
    throw new Error('Distribution must not write ledger');
  }
  if (DISTRIBUTION_ENGINE_BOUNDARIES.writesRewards) {
    throw new Error('Distribution must not write rewards');
  }
  if (DISTRIBUTION_ENGINE_BOUNDARIES.writesPayouts) {
    throw new Error('Distribution must not write payouts');
  }
  if (DISTRIBUTION_ENGINE_BOUNDARIES.writesConversions) {
    throw new Error('Distribution must not write conversions');
  }
  if (DISTRIBUTION_ENGINE_BOUNDARIES.writesCommissions) {
    throw new Error('Distribution must not write commissions');
  }
  if (ECONOMIC_LEDGER_BOUNDARY.settlementEnabled) {
    throw new Error('Economy settlement must remain OFF');
  }
}

export function assertDistributionDoesNotPublishProviders(): void {
  if (DISTRIBUTION_ENGINE_BOUNDARIES.callsExternalProviders) {
    throw new Error('P0-D1 must not call external providers');
  }
}

export function assertDistributionDoesNotApprove(): void {
  if (DISTRIBUTION_ENGINE_BOUNDARIES.approvesOffers) {
    throw new Error('Distribution must not approve offers');
  }
  if (DISTRIBUTION_ENGINE_BOUNDARIES.modifiesModerationState) {
    throw new Error('Distribution must not modify moderation state');
  }
}

export function assertDealIntelligencePublicationUnchanged(): void {
  if (DEAL_INTELLIGENCE_PUBLICATION_BOUNDARY.autoPublish !== false) {
    throw new Error('DI autoPublish must remain false');
  }
}

/** Safe to call when flag is off — no work. */
export function assertFlagFailClosedWhenUnset(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!('DISTRIBUTION_ENGINE_ENABLED' in env) || !env.DISTRIBUTION_ENGINE_ENABLED) {
    if (isDistributionEngineEnabled(env)) {
      throw new Error('Distribution flag must default OFF');
    }
  }
}
