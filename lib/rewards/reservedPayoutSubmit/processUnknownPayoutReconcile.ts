/**
 * M5.5 — UNKNOWN reconcile automation.
 * NEVER calls provider.submit. Same intent + same idempotency_key.
 *
 * Default automation: observe / failure / still-unknown — does NOT auto-apply
 * confirmed_success → PAID (stopBeforePaid). Explicit applyPaid=true required
 * to run executeProviderReconcile success path (confirmation authority).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isRewardsProgramActive } from '@/lib/rewards/programStatus';
import { writeRewardAuditLog } from '@/lib/rewards/audit';
import {
  loadPayoutIntent,
  executeProviderReconcile,
  createSandboxPayoutProvider,
  type PayoutProvider,
  type SandboxProviderOptions,
} from '@/lib/rewards/payoutIntent';
import type { ProcessUnknownPayoutReconcileResult } from './types';

export type ProcessUnknownPayoutReconcileOptions = {
  actorId?: string | null;
  provider?: PayoutProvider;
  sandboxOptions?: SandboxProviderOptions;
  /**
   * When false (default for M5.5), success evidence is observed but NOT applied
   * via executeProviderReconcile (would PAID). Failure/unknown still applied.
   */
  applyPaid?: boolean;
};

function empty(
  intentId: string,
  patch: Partial<ProcessUnknownPayoutReconcileResult>,
): ProcessUnknownPayoutReconcileResult {
  return {
    intentId,
    rewardId: null,
    outcome: 'rejected',
    reason: 'intent_not_found',
    intentStatus: null,
    idempotencyKey: null,
    providerId: null,
    reused: false,
    paid: false,
    confirmationPending: false,
    ...patch,
  };
}

export async function processUnknownPayoutReconcile(
  supabase: SupabaseClient,
  intentId: string,
  options: ProcessUnknownPayoutReconcileOptions = {},
): Promise<ProcessUnknownPayoutReconcileResult> {
  const id = intentId.trim();
  if (!id) return empty(id, {});

  if (!isRewardsProgramActive()) {
    return empty(id, {
      outcome: 'deferred',
      reason: 'program_inactive',
    });
  }

  const before = await loadPayoutIntent(supabase, id);
  if (!before) return empty(id, { reason: 'intent_not_found' });

  if (before.status === 'SUCCEEDED' || before.status === 'FAILED') {
    return empty(id, {
      rewardId: before.reward_id,
      outcome: 'reused',
      reason: 'already_terminal',
      intentStatus: before.status,
      idempotencyKey: before.idempotency_key,
      reused: true,
      paid: before.status === 'SUCCEEDED',
    });
  }

  if (before.status !== 'UNKNOWN') {
    return empty(id, {
      rewardId: before.reward_id,
      outcome: 'rejected',
      reason: 'not_unknown',
      intentStatus: before.status,
      idempotencyKey: before.idempotency_key,
    });
  }

  const applyPaid = options.applyPaid === true;
  const sandboxOptions: SandboxProviderOptions = {
    reconcile: applyPaid ? 'success' : (options.sandboxOptions?.reconcile ?? 'unknown'),
    ...options.sandboxOptions,
  };

  // M5.5 stop-before-PAID: peek success evidence without applying confirmation.
  if (!applyPaid && (sandboxOptions.reconcile === 'success' || sandboxOptions.reconcile === 'duplicate')) {
    const provider =
      options.provider ?? createSandboxPayoutProvider(sandboxOptions);
    const peek = await provider.reconcile(before);
    const confirmationPending = peek.outcome === 'success';
    await writeRewardAuditLog(supabase, {
      eventType: 'unknown_payout_reconcile_evidence',
      actorId: options.actorId ?? null,
      entityType: 'payout_intent',
      entityId: id,
      previousState: 'UNKNOWN',
      newState: 'UNKNOWN',
      metadata: {
        idempotency_key: before.idempotency_key,
        peek_outcome: peek.outcome,
        external_ref:
          'externalRef' in peek && typeof peek.externalRef === 'string'
            ? peek.externalRef
            : null,
        confirmation_pending: confirmationPending,
        paid: false,
        note: 'M5.5_stop_before_paid_use_applyProviderConfirmation',
        source: 'm55_unknown_reconcile',
      },
    });
    return {
      intentId: id,
      rewardId: before.reward_id,
      outcome: 'evidence_observed',
      reason: confirmationPending
        ? 'reconcile_success_confirmation_pending'
        : 'reconcile_peek',
      intentStatus: 'UNKNOWN',
      idempotencyKey: before.idempotency_key,
      providerId: provider.id,
      reused: false,
      paid: false,
      confirmationPending,
    };
  }

  const provider =
    options.provider ?? createSandboxPayoutProvider(sandboxOptions);

  const exec = await executeProviderReconcile(supabase, {
    intentId: id,
    actorId: options.actorId,
    provider,
    sandboxOptions,
  });

  const after = exec.ok
    ? exec.intentResult.intent
    : (await loadPayoutIntent(supabase, id)) ?? before;

  const paid = after.status === 'SUCCEEDED';

  if (!exec.ok) {
    return empty(id, {
      rewardId: before.reward_id,
      outcome: 'rejected',
      reason: exec.reason,
      intentStatus: after.status,
      idempotencyKey: before.idempotency_key,
      providerId: provider.id,
      paid: false,
    });
  }

  let outcome: ProcessUnknownPayoutReconcileResult['outcome'] = 'still_unknown';
  let reason = 'still_unknown';
  if (exec.intentResult.reused && after.status === 'UNKNOWN') {
    outcome = 'still_unknown';
    reason = 'reconcile_still_unknown';
  } else if (after.status === 'FAILED') {
    outcome = 'reconciled_failed';
    reason = 'provider_confirmed_failure';
  } else if (after.status === 'SUCCEEDED') {
    outcome = 'reused';
    reason = 'reconciled_success_paid';
  } else if (after.status === 'UNKNOWN') {
    outcome = 'still_unknown';
    reason = 'reconcile_still_unknown';
  }

  await writeRewardAuditLog(supabase, {
    eventType: 'unknown_payout_reconcile_ok',
    actorId: options.actorId ?? null,
    entityType: 'payout_intent',
    entityId: id,
    previousState: before.status,
    newState: after.status,
    metadata: {
      idempotency_key: after.idempotency_key,
      outcome,
      paid,
      source: 'm55_unknown_reconcile',
      note: 'same_intent_same_idempotency_key_no_new_submit',
    },
  });

  return {
    intentId: id,
    rewardId: after.reward_id,
    outcome,
    reason,
    intentStatus: after.status,
    idempotencyKey: after.idempotency_key,
    providerId: exec.providerId,
    reused: Boolean(exec.intentResult.reused),
    paid,
    confirmationPending: false,
  };
}
