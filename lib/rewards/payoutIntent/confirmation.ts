/**
 * M4.3 — Provider confirmation boundary.
 * Evidence lives on payout_intents.meta (canonical jsonb). No new DDL.
 * UNKNOWN / ambiguous never becomes SUCCESS without verified evidence.
 */

import type { PayoutIntentRow, PayoutIntentRejectReason } from './types';

export const CONFIRMATION_STATUSES = [
  'initiated',
  'confirmed_success',
  'confirmed_failure',
  'unknown',
] as const;

export type ConfirmationStatus = (typeof CONFIRMATION_STATUSES)[number];

/** Verifiable confirmation payload from provider/adapter (never free-text reward id). */
export type ProviderConfirmationEvidence = {
  intentId: string;
  rewardId: string;
  amountCents: number;
  currency: string;
  idempotencyKey: string;
  provider: string;
  /** Stable provider/SPEI reference for this claim. */
  providerReference: string;
  outcome: 'confirmed_success' | 'confirmed_failure';
  confirmedAt?: string | null;
  actorId?: string | null;
};

export type ConfirmationRejectReason =
  | PayoutIntentRejectReason
  | 'evidence_missing'
  | 'provider_reference_mismatch'
  | 'idempotency_key_mismatch'
  | 'reward_mismatch'
  | 'provider_mismatch'
  | 'confirmation_not_allowed';

export type ConfirmationValidation =
  | { ok: true }
  | { ok: false; reason: ConfirmationRejectReason; message?: string };

export function readConfirmationMeta(meta: Record<string, unknown>): {
  providerReference: string | null;
  initiatedAt: string | null;
  confirmedAt: string | null;
  confirmationStatus: ConfirmationStatus | null;
  awaitingConfirmation: boolean;
} {
  const providerReference =
    typeof meta.provider_reference === 'string'
      ? meta.provider_reference
      : typeof meta.initiated_external_ref === 'string'
        ? meta.initiated_external_ref
        : typeof meta.external_ref === 'string'
          ? meta.external_ref
          : null;
  const confirmationStatus =
    typeof meta.confirmation_status === 'string' &&
    (CONFIRMATION_STATUSES as readonly string[]).includes(meta.confirmation_status)
      ? (meta.confirmation_status as ConfirmationStatus)
      : null;
  return {
    providerReference,
    initiatedAt: typeof meta.initiated_at === 'string' ? meta.initiated_at : null,
    confirmedAt: typeof meta.confirmed_at === 'string' ? meta.confirmed_at : null,
    confirmationStatus,
    awaitingConfirmation: meta.awaiting_confirmation === true,
  };
}

export function buildInitiatedMeta(
  prev: Record<string, unknown>,
  input: { providerReference: string; initiatedAt: string },
): Record<string, unknown> {
  return {
    ...prev,
    provider_reference: input.providerReference,
    initiated_external_ref: input.providerReference,
    initiated_at: input.initiatedAt,
    confirmation_status: 'initiated' satisfies ConfirmationStatus,
    awaiting_confirmation: true,
  };
}

export function buildConfirmedMeta(
  prev: Record<string, unknown>,
  input: {
    providerReference: string;
    confirmedAt: string;
    outcome: 'confirmed_success' | 'confirmed_failure';
  },
): Record<string, unknown> {
  return {
    ...prev,
    provider_reference: input.providerReference,
    external_ref: input.providerReference,
    confirmed_at: input.confirmedAt,
    confirmation_status: input.outcome,
    awaiting_confirmation: false,
  };
}

/**
 * Fail-closed validation: confirmation must bind to the claimed intent identity.
 * Does not trust free-text; compares structured fields only.
 */
export function validateProviderConfirmation(
  intent: PayoutIntentRow,
  evidence: ProviderConfirmationEvidence,
): ConfirmationValidation {
  if (intent.status === 'FAILED' || intent.status === 'CANCELLED') {
    return { ok: false, reason: 'already_resolved' };
  }
  if (intent.status === 'RESERVED') {
    return {
      ok: false,
      reason: 'confirmation_not_allowed',
      message: 'must_be_submitted_or_unknown',
    };
  }
  if (intent.status !== 'SUBMITTED' && intent.status !== 'UNKNOWN' && intent.status !== 'SUCCEEDED') {
    return { ok: false, reason: 'invalid_transition' };
  }

  if (!evidence.providerReference?.trim()) {
    return { ok: false, reason: 'evidence_missing', message: 'provider_reference_required' };
  }
  if (evidence.intentId !== intent.id) {
    return { ok: false, reason: 'intent_not_found', message: 'intent_id_mismatch' };
  }
  if (evidence.rewardId !== intent.reward_id) {
    return { ok: false, reason: 'reward_mismatch' };
  }
  if (evidence.amountCents !== intent.amount_cents) {
    return { ok: false, reason: 'amount_mismatch' };
  }
  if (evidence.currency.trim().toUpperCase() !== intent.currency.trim().toUpperCase()) {
    return { ok: false, reason: 'currency_mismatch' };
  }
  if (evidence.idempotencyKey !== intent.idempotency_key) {
    return { ok: false, reason: 'idempotency_key_mismatch' };
  }
  if (evidence.provider.trim() && evidence.provider !== intent.provider) {
    return { ok: false, reason: 'provider_mismatch' };
  }

  const meta = readConfirmationMeta(intent.meta);
  // If already initiated with a provider_reference, confirmation must reuse it (no second identity).
  if (
    meta.providerReference &&
    meta.providerReference.trim() !== evidence.providerReference.trim()
  ) {
    return { ok: false, reason: 'provider_reference_mismatch' };
  }

  return { ok: true };
}
