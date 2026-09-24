/**
 * Attribution truth without settlement.
 * A layer may record its own observation. It may not confirm another layer's money.
 */

import { recordCrossLayerRefusal } from '@/lib/intelligence/telemetry';

export const TRANSACTION_FOUNDATION_MODE = 'observe_only' as const;

export type EconomicLayer = 'attribution' | 'conversion' | 'commission' | 'settlement';

export type EconomicEventState = 'observed' | 'confirmed' | 'rejected' | 'reversed' | 'not_connected';

export type CanonicalEconomicEvent = {
  layer: EconomicLayer;
  identity: string;
  timestamp: string;
  source: string;
  evidenceRef: string | null;
  state: EconomicEventState;
  idempotencyKey: string;
  correlationId: string;
};

const PROMOTABLE: Record<EconomicLayer, EconomicLayer[]> = {
  attribution: [],
  conversion: [],
  commission: [],
  settlement: [],
};

/** Foundation mode: no layer may authorize another. Settlement never accepts a promotion. */
export function canPromoteLayer(from: EconomicLayer, to: EconomicLayer): boolean {
  if (TRANSACTION_FOUNDATION_MODE === 'observe_only') {
    recordCrossLayerRefusal();
    return false;
  }
  return PROMOTABLE[from].includes(to);
}

export function buildAttributionObservation(input: {
  offerId: string;
  clickId: string | null;
  timestamp: string;
  source: string;
  idempotencyKey: string;
}): CanonicalEconomicEvent {
  const clickId = input.clickId?.trim() || null;
  return {
    layer: 'attribution',
    identity: clickId ? `click:${clickId}` : `offer:${input.offerId}:unattributed`,
    timestamp: input.timestamp,
    source: input.source,
    evidenceRef: clickId,
    state: clickId ? 'observed' : 'not_connected',
    idempotencyKey: input.idempotencyKey,
    correlationId: `offer:${input.offerId}`,
  };
}

/** Conversion ingest is not connected. Late, duplicate, and refund states exist but stay not_connected. */
export function buildConversionObservation(input: {
  correlationId: string;
  timestamp: string;
  externalId?: string | null;
}): CanonicalEconomicEvent {
  return {
    layer: 'conversion',
    identity: input.externalId?.trim() ? `conversion:${input.externalId.trim()}` : 'conversion:not_connected',
    timestamp: input.timestamp,
    source: 'not_connected',
    evidenceRef: null,
    state: 'not_connected',
    idempotencyKey: `conversion:${input.correlationId}:not_connected`,
    correlationId: input.correlationId,
  };
}

export function buildCommissionObservation(correlationId: string, timestamp: string): CanonicalEconomicEvent {
  return {
    layer: 'commission',
    identity: 'commission:not_connected',
    timestamp,
    source: 'not_connected',
    evidenceRef: null,
    state: 'not_connected',
    idempotencyKey: `commission:${correlationId}:not_connected`,
    correlationId,
  };
}

export function buildSettlementRefusal(correlationId: string, timestamp: string): CanonicalEconomicEvent {
  recordCrossLayerRefusal();
  return {
    layer: 'settlement',
    identity: 'settlement:refused',
    timestamp,
    source: 'transaction_foundation',
    evidenceRef: null,
    state: 'rejected',
    idempotencyKey: `settlement:${correlationId}:refused`,
    correlationId,
  };
}

export function assertNoDuplicateIdentity(events: CanonicalEconomicEvent[]): { ok: boolean; duplicate: string | null } {
  const seen = new Set<string>();
  for (const event of events) {
    const key = `${event.layer}:${event.idempotencyKey}`;
    if (seen.has(key)) return { ok: false, duplicate: key };
    seen.add(key);
  }
  return { ok: true, duplicate: null };
}
