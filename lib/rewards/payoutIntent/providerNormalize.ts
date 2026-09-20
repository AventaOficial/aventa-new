/**
 * M4.5 — Normalized provider evidence.
 * Adapters return provider-shaped outcomes; this layer maps to a uniform internal result.
 * Never carries secrets/credentials. Never mutates rewards/intents.
 */

import type {
  PayoutIntentRow,
  PayoutProviderReconcileResult,
  PayoutProviderSubmitResult,
} from './types';
import type { ProviderConfirmationEvidence } from './confirmation';

export type NormalizedProviderStatus =
  | 'initiated'
  | 'submitted'
  | 'unknown'
  | 'failed'
  | 'confirmed_success'
  | 'confirmed_failure'
  | 'unavailable'
  | 'malformed';

export type NormalizedProviderResult = {
  provider: string;
  providerReference: string | null;
  status: NormalizedProviderStatus;
  idempotencyKey: string;
  amountCents: number;
  currency: string;
  observedAt: string;
  failureCode?: string | null;
  /** Non-secret operational note only. */
  note?: string | null;
};

function baseFromIntent(
  intent: PayoutIntentRow,
  providerId: string,
): Pick<
  NormalizedProviderResult,
  'provider' | 'idempotencyKey' | 'amountCents' | 'currency' | 'observedAt'
> {
  return {
    provider: providerId,
    idempotencyKey: intent.idempotency_key,
    amountCents: intent.amount_cents,
    currency: intent.currency,
    observedAt: new Date().toISOString(),
  };
}

/**
 * Map submit adapter outcome → uniform internal result.
 * timeout/unknown → UNKNOWN (never SUCCESS).
 */
export function normalizeSubmitResult(
  intent: PayoutIntentRow,
  providerId: string,
  result: PayoutProviderSubmitResult,
): NormalizedProviderResult {
  const base = baseFromIntent(intent, providerId);
  if (result.outcome === 'success') {
    return {
      ...base,
      status: 'confirmed_success',
      providerReference: result.externalRef?.trim() || `ref:${intent.idempotency_key}`,
    };
  }
  if (result.outcome === 'initiated') {
    return {
      ...base,
      status: 'initiated',
      providerReference: result.externalRef?.trim() || `ref:${intent.idempotency_key}`,
      note: 'awaiting_confirmation',
    };
  }
  if (result.outcome === 'failure') {
    return {
      ...base,
      status: 'failed',
      providerReference:
        (typeof intent.meta.provider_reference === 'string'
          ? intent.meta.provider_reference
          : null) || `failed:${intent.idempotency_key}`,
      failureCode: result.reason ?? 'provider_failure',
    };
  }
  // timeout
  return {
    ...base,
    status: 'unknown',
    providerReference:
      (typeof intent.meta.provider_reference === 'string'
        ? intent.meta.provider_reference
        : null) || null,
    failureCode: result.reason ?? 'provider_timeout',
    note: 'timeout_is_unknown_not_failure',
  };
}

export function normalizeReconcileResult(
  intent: PayoutIntentRow,
  providerId: string,
  result: PayoutProviderReconcileResult,
): NormalizedProviderResult {
  const base = baseFromIntent(intent, providerId);
  const priorRef =
    typeof intent.meta.provider_reference === 'string'
      ? intent.meta.provider_reference
      : null;
  if (result.outcome === 'success') {
    return {
      ...base,
      status: 'confirmed_success',
      providerReference: result.externalRef?.trim() || priorRef || `ref:${intent.idempotency_key}`,
    };
  }
  if (result.outcome === 'failure') {
    return {
      ...base,
      status: 'confirmed_failure',
      providerReference: priorRef || `reconcile_fail:${intent.idempotency_key}`,
      failureCode: result.reason ?? 'provider_reconcile_failure',
    };
  }
  return {
    ...base,
    status: 'unknown',
    providerReference: priorRef,
    failureCode: result.reason ?? 'still_unknown',
    note: 'reconcile_still_unknown',
  };
}

/**
 * Build confirmation evidence for applyProviderConfirmation.
 * Returns null when status is not a confirmable terminal provider outcome.
 */
export function normalizedToConfirmationEvidence(
  normalized: NormalizedProviderResult,
  intent: PayoutIntentRow,
  actorId?: string | null,
): ProviderConfirmationEvidence | null {
  if (
    normalized.status !== 'confirmed_success' &&
    normalized.status !== 'confirmed_failure' &&
    normalized.status !== 'failed'
  ) {
    return null;
  }
  if (!normalized.providerReference?.trim()) return null;
  return {
    intentId: intent.id,
    rewardId: intent.reward_id,
    amountCents: normalized.amountCents,
    currency: normalized.currency,
    idempotencyKey: normalized.idempotencyKey,
    provider: normalized.provider || intent.provider,
    providerReference: normalized.providerReference,
    outcome:
      normalized.status === 'confirmed_success'
        ? 'confirmed_success'
        : 'confirmed_failure',
    confirmedAt: normalized.observedAt,
    actorId: actorId ?? null,
  };
}
