/**
 * deal.detected event — idempotent, non-publishing.
 */

import { DEAL_DETECTED_EVENT_TYPE, DEAL_INTELLIGENCE_SCHEMA_VERSION } from './constants';
import { hashStable } from './identity';
import type {
  CouponObservation,
  DealDetectedEvent,
  DealIdentity,
  DealScore,
  EvidenceReference,
  PriceObservation,
  PromotionObservation,
} from './types';

export function buildDealDetectedIdempotencyKey(input: {
  sourceId: string;
  identity: DealIdentity;
  observedAt: string;
  salePrice: number | null;
  scoreVersion: string | null;
}): string {
  const fp =
    input.identity.productFingerprint ??
    input.identity.asin ??
    input.identity.mlItemId ??
    input.identity.canonicalUrl ??
    'unknown';
  const bucket = input.observedAt.slice(0, 16);
  return `dd:${hashStable([
    input.sourceId,
    fp,
    String(input.salePrice ?? ''),
    input.scoreVersion ?? '',
    bucket,
  ])}`;
}

export function buildDealDetectedEvent(input: {
  productIdentity: DealIdentity;
  sourceId: string;
  observedAt: string;
  priceObservation?: PriceObservation | null;
  promotionObservations?: PromotionObservation[];
  couponObservations?: CouponObservation[];
  dealScore?: DealScore | null;
  evidence?: EvidenceReference[];
  confidence?: number;
}): DealDetectedEvent {
  const salePrice = input.priceObservation?.salePrice ?? null;
  const idempotencyKey = buildDealDetectedIdempotencyKey({
    sourceId: input.sourceId,
    identity: input.productIdentity,
    observedAt: input.observedAt,
    salePrice,
    scoreVersion: input.dealScore?.version ?? null,
  });
  const eventId = `evt_${hashStable([idempotencyKey])}`;
  const dealId = `deal_${hashStable([
    input.productIdentity.productFingerprint ?? 'u',
    input.sourceId,
  ])}`;

  return {
    eventType: DEAL_DETECTED_EVENT_TYPE,
    eventId,
    schemaVersion: DEAL_INTELLIGENCE_SCHEMA_VERSION,
    dealId,
    productIdentity: input.productIdentity,
    sourceId: input.sourceId,
    observedAt: input.observedAt,
    priceObservation: input.priceObservation ?? null,
    promotionObservations: input.promotionObservations ?? [],
    couponObservations: input.couponObservations ?? [],
    dealScore: input.dealScore ?? null,
    evidence: input.evidence ?? [],
    confidence: Math.max(0, Math.min(1, input.confidence ?? input.dealScore?.confidence ?? 0.5)),
    idempotencyKey,
    publicationAllowed: false,
  };
}

export function dedupeDealDetectedEvents(
  events: DealDetectedEvent[],
): { unique: DealDetectedEvent[]; duplicateKeys: string[] } {
  const seen = new Set<string>();
  const unique: DealDetectedEvent[] = [];
  const duplicateKeys: string[] = [];
  for (const e of events) {
    if (seen.has(e.idempotencyKey)) {
      duplicateKeys.push(e.idempotencyKey);
      continue;
    }
    seen.add(e.idempotencyKey);
    unique.push(e);
  }
  return { unique, duplicateKeys };
}
