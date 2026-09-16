/**
 * Identidad determinista de click / attribution chain.
 * No crea money. No inventa conversion/commission IDs vivos.
 */

import { createHash } from 'crypto';

/** Ventana de idempotencia alineada a dedupe de offer_events outbound (10 min). */
export const ATTRIBUTION_CLICK_IDEMPOTENCY_WINDOW_MS = 10 * 60 * 1000;

export type AttributionIdentityChain = {
  offerId: string;
  clickId: string | null;
  trackingId: string | null;
  merchantNetwork: string | null;
  campaignKey: string | null;
  channel: string | null;
  destinationUrl: string | null;
  originalDestinationUrl: string | null;
  /** Placeholders futuros — siempre null hasta ingest real. */
  conversionId: null;
  commissionId: null;
};

export function buildClickIdempotencyKey(input: {
  offerId: string;
  actorKey: string;
  nowMs?: number;
  windowMs?: number;
}): string {
  const windowMs = input.windowMs ?? ATTRIBUTION_CLICK_IDEMPOTENCY_WINDOW_MS;
  const nowMs = input.nowMs ?? Date.now();
  const bucket = Math.floor(nowMs / windowMs);
  const raw = `outbound:${input.offerId}:${input.actorKey}:${bucket}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 40);
}

export function actorKeyFromSignals(input: {
  userId?: string | null;
  ipHash?: string | null;
}): string {
  if (input.userId?.trim()) return `u:${input.userId.trim()}`;
  if (input.ipHash?.trim()) return `ip:${input.ipHash.trim()}`;
  return 'anon';
}

export function buildAttributionIdentityChain(partial: {
  offerId: string;
  clickId?: string | null;
  merchantNetwork?: string | null;
  campaignKey?: string | null;
  channel?: string | null;
  destinationUrl?: string | null;
  originalDestinationUrl?: string | null;
}): AttributionIdentityChain {
  const clickId = partial.clickId?.trim() || null;
  return {
    offerId: partial.offerId,
    clickId,
    trackingId: clickId,
    merchantNetwork: partial.merchantNetwork ?? null,
    campaignKey: partial.campaignKey ?? null,
    channel: partial.channel ?? null,
    destinationUrl: partial.destinationUrl ?? null,
    originalDestinationUrl: partial.originalDestinationUrl ?? null,
    conversionId: null,
    commissionId: null,
  };
}
