/**
 * M4.4 — Admin confirmation/reconcile domain (no HTTP, no auth).
 * Sole economic transition: applyProviderConfirmation.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  applyProviderConfirmation,
  loadPayoutIntent,
  type PayoutIntentOpResult,
  type PayoutIntentRow,
} from '@/lib/rewards/payoutIntent';
import type { ProviderConfirmationEvidence } from '@/lib/rewards/payoutIntent/confirmation';
import { writeRewardAuditLog } from '@/lib/rewards/audit';

export type AdminPayoutConfirmOperation = 'confirm' | 'reconcile';

export type AdminPayoutConfirmInput = {
  operation: AdminPayoutConfirmOperation;
  payoutIntentId: string;
  provider: string;
  providerReference: string;
  idempotencyKey: string;
  amountCents: number;
  currency: string;
  outcome: 'confirmed_success' | 'confirmed_failure';
  /** Always from authenticated session — never from request body. */
  actorId: string;
};

export type AdminPayoutConfirmResult =
  | {
      ok: true;
      code: 'SUCCESS' | 'ALREADY_APPLIED';
      intent: PayoutIntentRow;
      rewardId: string;
      rewardStatus: string | null;
    }
  | {
      ok: false;
      code:
        | 'INVALID_EVIDENCE'
        | 'INVALID_TRANSITION'
        | 'NOT_FOUND'
        | 'CONFLICT'
        | 'FORBIDDEN_SELF'
        | 'MONEY_PATH_FROZEN'
        | 'UNKNOWN_REQUIRES_RECONCILIATION'
        | 'FAILED';
      status: number;
      error: string;
      reason?: string;
    };

function mapReject(
  reason: string,
  message?: string,
): Extract<AdminPayoutConfirmResult, { ok: false }> {
  switch (reason) {
    case 'intent_not_found':
      return { ok: false, code: 'NOT_FOUND', status: 404, error: 'payout_intent no encontrado', reason };
    case 'money_path_frozen':
      return {
        ok: false,
        code: 'MONEY_PATH_FROZEN',
        status: 503,
        error: 'Money path congelado',
        reason,
      };
    case 'already_resolved':
      return {
        ok: false,
        code: 'INVALID_TRANSITION',
        status: 409,
        error: 'Intent terminal; no se puede confirmar',
        reason,
      };
    case 'invalid_transition':
    case 'confirmation_not_allowed':
      return {
        ok: false,
        code: 'INVALID_TRANSITION',
        status: 409,
        error: message ?? 'Transición inválida',
        reason,
      };
    case 'amount_mismatch':
    case 'currency_mismatch':
    case 'idempotency_key_mismatch':
    case 'provider_reference_mismatch':
    case 'provider_mismatch':
    case 'reward_mismatch':
    case 'evidence_missing':
      return {
        ok: false,
        code: 'INVALID_EVIDENCE',
        status: 400,
        error: `Evidencia inválida (${reason})`,
        reason,
      };
    case 'mark_paid_failed':
    case 'update_failed':
      return {
        ok: false,
        code: 'CONFLICT',
        status: 409,
        error: 'Conflicto al aplicar confirmación',
        reason,
      };
    default:
      return {
        ok: false,
        code: 'FAILED',
        status: 400,
        error: message ?? `Confirmación rechazada (${reason})`,
        reason,
      };
  }
}

/**
 * Load intent, forbid self-confirm, build evidence, applyProviderConfirmation.
 */
export async function adminConfirmPayoutIntent(
  supabase: SupabaseClient,
  input: AdminPayoutConfirmInput,
): Promise<AdminPayoutConfirmResult> {
  if (input.operation !== 'confirm' && input.operation !== 'reconcile') {
    return {
      ok: false,
      code: 'INVALID_EVIDENCE',
      status: 400,
      error: 'operation debe ser confirm|reconcile',
    };
  }

  const intent = await loadPayoutIntent(supabase, input.payoutIntentId);
  if (!intent) {
    return mapReject('intent_not_found');
  }

  // Creator cannot confirm their own payout (even if they somehow have admin role).
  if (intent.creator_id === input.actorId) {
    await writeRewardAuditLog(supabase, {
      eventType: 'payout_confirm_forbidden_self',
      actorId: input.actorId,
      entityType: 'payout_intent',
      entityId: intent.id,
      previousState: intent.status,
      newState: intent.status,
      metadata: {
        operation: input.operation,
        note: 'creator_cannot_confirm_own_payout',
      },
    });
    return {
      ok: false,
      code: 'FORBIDDEN_SELF',
      status: 403,
      error: 'No puedes confirmar tu propio payout',
    };
  }

  // UNKNOWN + confirm without going through reconcile semantics: still allowed if evidence
  // is valid (same applyProviderConfirmation). Document operation in audit only.
  if (intent.status === 'UNKNOWN' && input.operation === 'confirm') {
    // Prefer explicit reconcile for UNKNOWN — still accept valid evidence via confirm
    // but surface code hint when evidence would be missing is handled by engine.
  }

  const evidence: ProviderConfirmationEvidence = {
    intentId: intent.id,
    rewardId: intent.reward_id,
    amountCents: input.amountCents,
    currency: input.currency,
    idempotencyKey: input.idempotencyKey,
    provider: input.provider,
    providerReference: input.providerReference,
    outcome: input.outcome,
    actorId: input.actorId,
  };

  const result: PayoutIntentOpResult = await applyProviderConfirmation(supabase, evidence);

  if (!result.ok) {
    // Hint when UNKNOWN and invalid evidence
    if (intent.status === 'UNKNOWN' && result.reason !== 'intent_not_found') {
      const mapped = mapReject(result.reason, result.message);
      if (mapped.code === 'INVALID_EVIDENCE') {
        return {
          ...mapped,
          code: 'INVALID_EVIDENCE',
          error: `UNKNOWN requiere evidencia válida (${result.reason})`,
        };
      }
      return mapped;
    }
    return mapReject(result.reason, result.message);
  }

  await writeRewardAuditLog(supabase, {
    eventType:
      input.operation === 'reconcile'
        ? 'admin_payout_reconcile'
        : 'admin_payout_confirm',
    actorId: input.actorId,
    entityType: 'payout_intent',
    entityId: result.intent.id,
    previousState: intent.status,
    newState: result.intent.status,
    metadata: {
      operation: input.operation,
      outcome: input.outcome,
      provider: input.provider,
      provider_reference: input.providerReference,
      idempotency_key: input.idempotencyKey,
      amount_cents: input.amountCents,
      currency: input.currency,
      reused: result.reused === true,
      via: 'applyProviderConfirmation',
    },
  });

  const { data: reward } = await supabase
    .from('creator_rewards')
    .select('id, status')
    .eq('id', result.intent.reward_id)
    .maybeSingle();

  return {
    ok: true,
    code: result.reused ? 'ALREADY_APPLIED' : 'SUCCESS',
    intent: result.intent,
    rewardId: result.intent.reward_id,
    rewardStatus: (reward as { status?: string } | null)?.status ?? null,
  };
}
