/**
 * CEO Deal Intelligence truth — connection semantics ≠ $0.
 */

import {
  DEAL_INTELLIGENCE_ECONOMY_BOUNDARY,
  DEAL_INTELLIGENCE_PUBLICATION_BOUNDARY,
  isDealIntelligencePersistenceEnabled,
} from './constants';
import type { DealIntelligenceConnectionState } from './types';

export type DealIntelligenceTruthSnapshot = {
  generatedAt: string;
  connection: DealIntelligenceConnectionState;
  persistenceEnabled: boolean;
  economicDataAvailable: false;
  economicDataAttributable: false;
  economicDataSettleable: false;
  autoPublish: false;
  metrics: {
    priceObservationsHour: number | null;
    dealsDetectedHour: number | null;
    duplicateRate: number | null;
    dqeRejectionRate: number | null;
    promotionDetectionRate: number | null;
    couponDetectionRate: number | null;
    identityExactRate: number | null;
    identityProbableRate: number | null;
    identityUnknownRate: number | null;
    sourceErrorRate: number | null;
    sourceLatencyMs: number | null;
  };
  note: string;
  economyBoundary: typeof DEAL_INTELLIGENCE_ECONOMY_BOUNDARY;
  publicationBoundary: typeof DEAL_INTELLIGENCE_PUBLICATION_BOUNDARY;
};

/**
 * Until persistence is wired + enabled, connection is NOT_CONNECTED.
 * Never report CONNECTED_ZERO just because Price Memory is healthy.
 */
export function buildDealIntelligenceTruth(input?: {
  now?: Date;
  persistedObservationCount?: number | null;
  persistedDealEventCount?: number | null;
}): DealIntelligenceTruthSnapshot {
  const persistenceEnabled = isDealIntelligencePersistenceEnabled();
  const obs = input?.persistedObservationCount;
  const events = input?.persistedDealEventCount;

  let connection: DealIntelligenceConnectionState = 'NOT_CONNECTED';
  let note =
    'Deal Intelligence contracts live; observation/event persistence not connected. Price Memory ≠ DI connected.';

  if (persistenceEnabled) {
    const total = (obs ?? 0) + (events ?? 0);
    if (obs == null && events == null) {
      connection = 'NOT_CONNECTED';
      note = 'DEAL_INTELLIGENCE_ENABLED but no persistence counters supplied.';
    } else if (total === 0) {
      connection = 'CONNECTED_ZERO';
      note = 'Persistence path enabled; zero observations/events.';
    } else {
      connection = 'CONNECTED_WITH_DATA';
      note = `Persistence path enabled; observations=${obs ?? 0} events=${events ?? 0}.`;
    }
  }

  return {
    generatedAt: (input?.now ?? new Date()).toISOString(),
    connection,
    persistenceEnabled,
    economicDataAvailable: false,
    economicDataAttributable: false,
    economicDataSettleable: false,
    autoPublish: false,
    metrics: {
      priceObservationsHour: null,
      dealsDetectedHour: null,
      duplicateRate: null,
      dqeRejectionRate: null,
      promotionDetectionRate: null,
      couponDetectionRate: null,
      identityExactRate: null,
      identityProbableRate: null,
      identityUnknownRate: null,
      sourceErrorRate: null,
      sourceLatencyMs: null,
    },
    note,
    economyBoundary: DEAL_INTELLIGENCE_ECONOMY_BOUNDARY,
    publicationBoundary: DEAL_INTELLIGENCE_PUBLICATION_BOUNDARY,
  };
}
