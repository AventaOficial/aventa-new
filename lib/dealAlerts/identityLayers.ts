/**
 * S6.2 — Identity layers for Deal Alerts (no persistence).
 *
 * Opportunity identity ≠ Alert identity ≠ Delivery identity
 */

import { hashStable } from '@/lib/dealIntelligence/identity';
import { DEAL_ALERTS_DETECTION_WINDOW_VERSION } from './constants';

/**
 * Opportunity identity — global deal fingerprint (product/merchant).
 * Used for DealDetected idempotency `da:{dw.v1}:{diKey}`.
 * Never includes userId or subscriptionId.
 */
export function opportunityIdentityKey(opportunityFingerprint: string): string {
  return `opp:${opportunityFingerprint.trim()}`;
}

/**
 * Alert identity — opportunity × subscription (eligibility / cooldown / per-sub dedupe).
 * Enables fanout: same opportunity → many alerts without collapsing users.
 */
export function alertIdentityKey(input: {
  opportunityFingerprint: string;
  subscriptionId: string;
}): string {
  return `alert:${hashStable([
    DEAL_ALERTS_DETECTION_WINDOW_VERSION,
    input.opportunityFingerprint.trim(),
    input.subscriptionId.trim(),
  ])}`;
}

/**
 * Delivery identity — reserved for S6.5 outbox.
 * Not computed in S6.2; documented for handoff only.
 */
export const DELIVERY_IDENTITY_DEFERRED = {
  layer: 'S6.5',
  note: 'delivery:{alertIdentityKey}:{channel}:{attempt} — not implemented in Decision Layer',
} as const;
