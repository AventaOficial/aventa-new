/**
 * M5.5 — processReservedPayoutSubmit
 * RESERVED → provider.submit → INITIATED/SUBMITTED | UNKNOWN | FAILED → STOP
 * Default sandbox scenario: initiated (awaiting confirmation — NO PAID).
 * UNKNOWN intents are rejected here (must use processUnknownPayoutReconcile).
 * Never calls applyProviderConfirmation for success path via default automation.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isRewardsProgramActive } from '@/lib/rewards/programStatus';
import { writeRewardAuditLog } from '@/lib/rewards/audit';
import {
  loadPayoutIntent,
  executeProviderSubmit,
  createSandboxPayoutProvider,
  type PayoutProvider,
  type SandboxProviderOptions,
} from '@/lib/rewards/payoutIntent';
import { classifySubmitReject } from './classify';
import type { ProcessReservedPayoutSubmitResult } from './types';

export type ProcessReservedPayoutSubmitOptions = {
  actorId?: string | null;
  /** Inject for tests / canary. */
  provider?: PayoutProvider;
  /**
   * Sandbox options when resolving/injecting sandbox.
   * Automation default: submit=initiated (stop before PAID).
   */
  sandboxOptions?: SandboxProviderOptions;
  /**
   * When true (default), force sandbox initiated unless provider injected.
   * Prevents accidental immediate_success → PAID in cron.
   */
  stopBeforePaid?: boolean;
};

function emptyResult(
  intentId: string,
  patch: Partial<ProcessReservedPayoutSubmitResult>,
): ProcessReservedPayoutSubmitResult {
  return {
    intentId,
    rewardId: null,
    outcome: 'rejected',
    reason: 'intent_not_found',
    intentStatus: null,
    idempotencyKey: null,
    providerId: null,
    reused: false,
    providerSubmitInvoked: false,
    terminal: true,
    paid: false,
    ...patch,
  };
}

export async function processReservedPayoutSubmit(
  supabase: SupabaseClient,
  intentId: string,
  options: ProcessReservedPayoutSubmitOptions = {},
): Promise<ProcessReservedPayoutSubmitResult> {
  const id = intentId.trim();
  if (!id) {
    return emptyResult(id, { reason: 'intent_not_found' });
  }

  if (!isRewardsProgramActive()) {
    const deferred = emptyResult(id, {
      outcome: 'deferred',
      reason: 'program_inactive',
      terminal: false,
    });
    await writeRewardAuditLog(supabase, {
      eventType: 'reserved_payout_submit_deferred',
      actorId: options.actorId ?? null,
      entityType: 'payout_intent',
      entityId: id,
      previousState: null,
      newState: 'deferred',
      metadata: { reason: 'program_inactive', source: 'm55_reserved_payout_submit' },
    });
    return deferred;
  }

  const before = await loadPayoutIntent(supabase, id);
  if (!before) {
    return emptyResult(id, { reason: 'intent_not_found' });
  }

  if (before.status === 'UNKNOWN') {
    const rejected = emptyResult(id, {
      rewardId: before.reward_id,
      outcome: 'rejected',
      reason: 'use_reconcile_for_unknown',
      intentStatus: before.status,
      idempotencyKey: before.idempotency_key,
      terminal: true,
    });
    await writeRewardAuditLog(supabase, {
      eventType: 'reserved_payout_submit_rejected',
      actorId: options.actorId ?? null,
      entityType: 'payout_intent',
      entityId: id,
      previousState: 'UNKNOWN',
      newState: 'rejected',
      metadata: {
        reason: 'use_reconcile_for_unknown',
        note: 'UNKNOWN_neq_resubmit_permission',
        source: 'm55_reserved_payout_submit',
      },
    });
    return rejected;
  }

  if (
    before.status === 'SUCCEEDED' ||
    before.status === 'FAILED' ||
    before.status === 'CANCELLED'
  ) {
    return emptyResult(id, {
      rewardId: before.reward_id,
      outcome: 'rejected',
      reason: 'already_terminal',
      intentStatus: before.status,
      idempotencyKey: before.idempotency_key,
      terminal: true,
    });
  }

  if (before.status === 'SUBMITTED') {
    // Replay / concurrent loser — no second provider.submit
    const reused = emptyResult(id, {
      rewardId: before.reward_id,
      outcome: 'reused',
      reason: 'already_submitted',
      intentStatus: before.status,
      idempotencyKey: before.idempotency_key,
      reused: true,
      providerSubmitInvoked: false,
      terminal: true,
      paid: false,
    });
    await writeRewardAuditLog(supabase, {
      eventType: 'reserved_payout_submit_reused',
      actorId: options.actorId ?? null,
      entityType: 'payout_intent',
      entityId: id,
      previousState: 'SUBMITTED',
      newState: 'SUBMITTED',
      metadata: {
        idempotency_key: before.idempotency_key,
        source: 'm55_reserved_payout_submit',
        provider_submit_invoked: false,
      },
    });
    return reused;
  }

  if (before.status !== 'RESERVED') {
    return emptyResult(id, {
      rewardId: before.reward_id,
      outcome: 'rejected',
      reason: 'invalid_transition',
      intentStatus: before.status,
      idempotencyKey: before.idempotency_key,
    });
  }

  const stopBeforePaid = options.stopBeforePaid !== false;
  const sandboxOptions: SandboxProviderOptions = {
    submit: stopBeforePaid ? 'initiated' : undefined,
    ...options.sandboxOptions,
    ...(stopBeforePaid && !options.sandboxOptions?.submit
      ? { submit: 'initiated' as const }
      : {}),
  };
  // Force initiated when stopBeforePaid unless caller explicitly set a non-success scenario
  if (stopBeforePaid) {
    const s = options.sandboxOptions?.submit;
    if (!s || s === 'immediate_success') {
      sandboxOptions.submit = 'initiated';
    } else {
      sandboxOptions.submit = s;
    }
  }

  const provider =
    options.provider ??
    createSandboxPayoutProvider(sandboxOptions);

  const exec = await executeProviderSubmit(supabase, {
    intentId: id,
    actorId: options.actorId,
    provider,
    sandboxOptions,
  });

  const after = exec.ok
    ? exec.intentResult.intent
    : (await loadPayoutIntent(supabase, id)) ?? before;

  const paid = after.status === 'SUCCEEDED';
  // CAS winner invoked provider when we started RESERVED and ended non-reused path
  const providerSubmitInvoked =
    exec.ok && !exec.intentResult.reused && before.status === 'RESERVED';

  if (!exec.ok) {
    const classified = classifySubmitReject(exec.reason);
    const result = emptyResult(id, {
      rewardId: before.reward_id,
      outcome: classified.class,
      reason: exec.reason,
      intentStatus: after.status,
      idempotencyKey: before.idempotency_key,
      providerId: provider.id,
      terminal: classified.terminal,
      paid: false,
      providerSubmitInvoked: before.status === 'RESERVED' && after.status !== 'RESERVED',
    });
    await writeRewardAuditLog(supabase, {
      eventType: 'reserved_payout_submit_rejected',
      actorId: options.actorId ?? null,
      entityType: 'payout_intent',
      entityId: id,
      previousState: before.status,
      newState: after.status,
      metadata: {
        reason: exec.reason,
        source: 'm55_reserved_payout_submit',
        paid: false,
      },
    });
    return result;
  }

  let outcome: ProcessReservedPayoutSubmitResult['outcome'] = 'submitted';
  let reason = 'provider_submit_ok';
  if (exec.intentResult.reused) {
    outcome = 'reused';
    reason = 'intent_reused';
  } else if (after.status === 'UNKNOWN') {
    outcome = 'unknown';
    reason = 'provider_timeout_or_unknown';
  } else if (after.status === 'FAILED') {
    outcome = 'failed';
    reason = 'provider_confirmed_failure';
  } else if (after.status === 'SUBMITTED') {
    outcome = 'submitted';
    reason = after.meta.awaiting_confirmation
      ? 'awaiting_confirmation_not_paid'
      : 'submitted';
  } else if (after.status === 'SUCCEEDED') {
    // Should not happen under stopBeforePaid + initiated; record honestly
    outcome = 'submitted';
    reason = 'succeeded_via_provider_success';
  }

  const result: ProcessReservedPayoutSubmitResult = {
    intentId: id,
    rewardId: after.reward_id,
    outcome,
    reason,
    intentStatus: after.status,
    idempotencyKey: after.idempotency_key,
    providerId: exec.providerId,
    reused: Boolean(exec.intentResult.reused),
    providerSubmitInvoked,
    terminal:
      after.status === 'FAILED' ||
      after.status === 'SUCCEEDED' ||
      after.status === 'SUBMITTED' ||
      after.status === 'UNKNOWN',
    paid,
  };

  await writeRewardAuditLog(supabase, {
    eventType:
      outcome === 'reused'
        ? 'reserved_payout_submit_reused'
        : outcome === 'unknown'
          ? 'reserved_payout_submit_unknown'
          : 'reserved_payout_submit_ok',
    actorId: options.actorId ?? null,
    entityType: 'payout_intent',
    entityId: id,
    previousState: before.status,
    newState: after.status,
    metadata: {
      idempotency_key: after.idempotency_key,
      outcome,
      reason,
      provider_submit_invoked: providerSubmitInvoked,
      paid,
      source: 'm55_reserved_payout_submit',
      note: 'stop_before_paid_confirmation_authority_unchanged',
    },
  });

  return result;
}
