/**
 * S6.1 — Global DealDetected idempotency (no userId).
 * Reuses DI hashStable / key shape; adds deal-alerts window version.
 */

import { hashStable } from '@/lib/dealIntelligence/identity';
import { buildDealDetectedIdempotencyKey as buildDiDealDetectedIdempotencyKey } from '@/lib/dealIntelligence/dealDetectedEvent';
import type { DealIdentity } from '@/lib/dealIntelligence/types';
import { DEAL_ALERTS_DETECTION_WINDOW_VERSION } from './constants';

/**
 * Canonical Deal Alerts idempotency key — deterministic, user-independent.
 *
 * Conceptual: fingerprint + detection window/version (+ source + sale + observed bucket).
 * Compatible with DI keys by wrapping the same inputs and appending window version.
 */
export function buildDealAlertsIdempotencyKey(input: {
  sourceId: string;
  identity: DealIdentity;
  observedAt: string;
  salePrice: number | null;
  /** Optional DI score version — not an alert score. */
  scoreVersion?: string | null;
  detectionWindowVersion?: string;
}): string {
  const fingerprint =
    input.identity.productFingerprint?.trim() ||
    input.identity.asin?.trim() ||
    input.identity.mlItemId?.trim() ||
    input.identity.canonicalUrl?.trim() ||
    '';
  if (!fingerprint) {
    // Fail-closed marker — callers must not treat as alertable.
    return `da:missing_fingerprint:${hashStable([input.sourceId, input.observedAt])}`;
  }

  const window = input.detectionWindowVersion ?? DEAL_ALERTS_DETECTION_WINDOW_VERSION;
  const diKey = buildDiDealDetectedIdempotencyKey({
    sourceId: input.sourceId,
    identity: input.identity,
    observedAt: input.observedAt,
    salePrice: input.salePrice,
    scoreVersion: input.scoreVersion ?? null,
  });
  return `da:${window}:${diKey}`;
}

/** Assert key never embeds a user id (architecture guard for tests/callers). */
export function idempotencyKeyIsUserAgnostic(key: string, userId?: string | null): boolean {
  if (!key || key.includes('user:') || key.includes('userId=')) return false;
  if (userId && userId.trim() && key.includes(userId.trim())) return false;
  return true;
}
