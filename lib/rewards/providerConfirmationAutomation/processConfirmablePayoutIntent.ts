/**
 * M5.6 — processConfirmablePayoutIntent
 *
 * SUBMITTED | UNKNOWN
 *   → provider.reconcile()
 *   → normalize
 *   → applyProviderConfirmation (SOLE PAID authority)
 *
 * Never: provider.submit, direct creator_rewards UPDATE, reward_payouts.
 * Never: UNKNOWN → artificial SUCCESS.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isRewardsProgramActive } from '@/lib/rewards/programStatus';
import { writeRewardAuditLog } from '@/lib/rewards/audit';
import {
  loadPayoutIntent,
  applyProviderConfirmation,
  createSandboxPayoutProvider,
  normalizeReconcileResult,
  normalizedToConfirmationEvidence,
  type PayoutProvider,
  type SandboxProviderOptions,
} from '@/lib/rewards/payoutIntent';
import { isMoneyPathFrozen } from '@/lib/server/moneyPathFreeze';
import { classifyConfirmReject, isConfirmableIntentStatus } from './classify';
import type { ProcessConfirmablePayoutResult } from './types';

export type ProcessConfirmablePayoutOptions = {
  actorId?: string | null;
  provider?: PayoutProvider;
  sandboxOptions?: SandboxProviderOptions;
  source?: ProcessConfirmablePayoutResult['source'];
};

function empty(
  intentId: string,
  patch: Partial<ProcessConfirmablePayoutResult>,
): ProcessConfirmablePayoutResult {
  return {
    intentId,
    rewardId: null,
    outcome: 'rejected',
    reason: 'intent_not_found',
    intentStatus: null,
    rewardStatus: null,
    idempotencyKey: null,
    providerId: null,
    providerReference: null,
    reused: false,
    paid: false,
    source: 'automation',
    ...patch,
  };
}

async function loadRewardStatus(
  supabase: SupabaseClient,
  rewardId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('creator_rewards')
    .select('id, status')
    .eq('id', rewardId)
    .maybeSingle();
  return (data as { status?: string } | null)?.status ?? null;
}

export async function processConfirmablePayoutIntent(
  supabase: SupabaseClient,
  intentId: string,
  options: ProcessConfirmablePayoutOptions = {},
): Promise<ProcessConfirmablePayoutResult> {
  const id = intentId.trim();
  const source = options.source ?? 'automation';
  if (!id) return empty(id, { source });

  if (!isRewardsProgramActive()) {
    const deferred = empty(id, {
      outcome: 'deferred',
      reason: 'program_inactive',
      source,
    });
    await writeRewardAuditLog(supabase, {
      eventType: 'provider_confirmation_deferred',
      actorId: options.actorId ?? null,
      entityType: 'payout_intent',
      entityId: id,
      previousState: null,
      newState: 'deferred',
      metadata: { reason: 'program_inactive', source: 'm56_provider_confirmation' },
    });
    return deferred;
  }

  if (isMoneyPathFrozen()) {
    return empty(id, {
      outcome: 'deferred',
      reason: 'money_path_frozen',
      source,
    });
  }

  const before = await loadPayoutIntent(supabase, id);
  if (!before) return empty(id, { reason: 'intent_not_found', source });

  if (before.status === 'SUCCEEDED') {
    const rewardStatus = await loadRewardStatus(supabase, before.reward_id);
    return empty(id, {
      rewardId: before.reward_id,
      outcome: 'reused',
      reason: 'already_succeeded',
      intentStatus: before.status,
      rewardStatus,
      idempotencyKey: before.idempotency_key,
      providerReference:
        typeof before.meta.provider_reference === 'string'
          ? before.meta.provider_reference
          : null,
      reused: true,
      paid: rewardStatus === 'PAID',
      source,
    });
  }

  if (before.status === 'FAILED' || before.status === 'CANCELLED') {
    return empty(id, {
      rewardId: before.reward_id,
      outcome: 'rejected',
      reason: 'already_terminal',
      intentStatus: before.status,
      idempotencyKey: before.idempotency_key,
      source,
    });
  }

  if (before.status === 'RESERVED') {
    return empty(id, {
      rewardId: before.reward_id,
      outcome: 'rejected',
      reason: 'confirmation_not_allowed',
      intentStatus: before.status,
      idempotencyKey: before.idempotency_key,
      source,
    });
  }

  if (!isConfirmableIntentStatus(before.status, before.meta)) {
    return empty(id, {
      rewardId: before.reward_id,
      outcome: 'rejected',
      reason: 'not_confirmable',
      intentStatus: before.status,
      idempotencyKey: before.idempotency_key,
      source,
    });
  }

  const sandboxOptions: SandboxProviderOptions = {
    reconcile: 'unknown',
    ...options.sandboxOptions,
  };
  const provider =
    options.provider ?? createSandboxPayoutProvider(sandboxOptions);

  // 1) Reconcile only — never submit
  const raw = await provider.reconcile(before);
  const normalized = normalizeReconcileResult(before, provider.id, raw);

  // 2) Still unknown → no economic transition
  if (normalized.status === 'unknown' || normalized.status === 'unavailable' || normalized.status === 'malformed') {
    await writeRewardAuditLog(supabase, {
      eventType: 'provider_confirmation_still_unknown',
      actorId: options.actorId ?? null,
      entityType: 'payout_intent',
      entityId: id,
      previousState: before.status,
      newState: before.status,
      metadata: {
        idempotency_key: before.idempotency_key,
        normalized_status: normalized.status,
        note: 'unknown_neq_success',
        source: 'm56_provider_confirmation',
        via: source,
      },
    });
    return {
      intentId: id,
      rewardId: before.reward_id,
      outcome: before.status === 'SUBMITTED' ? 'still_submitted' : 'still_unknown',
      reason: 'reconcile_still_unknown',
      intentStatus: before.status,
      rewardStatus: await loadRewardStatus(supabase, before.reward_id),
      idempotencyKey: before.idempotency_key,
      providerId: provider.id,
      providerReference: normalized.providerReference,
      reused: false,
      paid: false,
      source,
    };
  }

  // 3) Build evidence from normalized result — identity from intent
  const evidence = normalizedToConfirmationEvidence(
    normalized,
    before,
    options.actorId,
  );
  if (!evidence) {
    return empty(id, {
      rewardId: before.reward_id,
      outcome: 'invalid_evidence',
      reason: 'evidence_missing',
      intentStatus: before.status,
      idempotencyKey: before.idempotency_key,
      providerId: provider.id,
      source,
    });
  }

  // 4) SOLE economic authority
  const applied = await applyProviderConfirmation(supabase, evidence);

  if (!applied.ok) {
    const classified = classifyConfirmReject(applied.reason);
    await writeRewardAuditLog(supabase, {
      eventType: 'provider_confirmation_rejected',
      actorId: options.actorId ?? null,
      entityType: 'payout_intent',
      entityId: id,
      previousState: before.status,
      newState: before.status,
      metadata: {
        reason: applied.reason,
        message: applied.message ?? null,
        class: classified.class,
        source: 'm56_provider_confirmation',
        via: source,
        note: 'applyProviderConfirmation_authority',
      },
    });
    return empty(id, {
      rewardId: before.reward_id,
      outcome: classified.class,
      reason: applied.reason,
      intentStatus: before.status,
      idempotencyKey: before.idempotency_key,
      providerId: provider.id,
      providerReference: evidence.providerReference,
      source,
    });
  }

  const after = applied.intent;
  const rewardStatus = await loadRewardStatus(supabase, after.reward_id);
  const paid = after.status === 'SUCCEEDED' && rewardStatus === 'PAID';

  let outcome: ProcessConfirmablePayoutResult['outcome'] = 'reused';
  let reason = 'confirmation_applied';
  if (applied.reused && after.status === 'SUCCEEDED') {
    outcome = 'reused';
    reason = 'already_applied';
  } else if (after.status === 'SUCCEEDED') {
    outcome = 'paid';
    reason = 'confirmed_success';
  } else if (after.status === 'FAILED') {
    outcome = 'failed';
    reason = 'confirmed_failure';
  }

  await writeRewardAuditLog(supabase, {
    eventType:
      outcome === 'paid'
        ? 'provider_confirmation_paid'
        : outcome === 'failed'
          ? 'provider_confirmation_failed'
          : 'provider_confirmation_reused',
    actorId: options.actorId ?? null,
    entityType: 'payout_intent',
    entityId: id,
    previousState: before.status,
    newState: after.status,
    metadata: {
      idempotency_key: after.idempotency_key,
      provider_reference: evidence.providerReference,
      outcome,
      paid,
      reward_status: rewardStatus,
      reused: Boolean(applied.reused),
      source: 'm56_provider_confirmation',
      via: source,
      authority: 'applyProviderConfirmation',
    },
  });

  return {
    intentId: id,
    rewardId: after.reward_id,
    outcome,
    reason,
    intentStatus: after.status,
    rewardStatus,
    idempotencyKey: after.idempotency_key,
    providerId: provider.id,
    providerReference: evidence.providerReference,
    reused: Boolean(applied.reused),
    paid,
    source,
  };
}
