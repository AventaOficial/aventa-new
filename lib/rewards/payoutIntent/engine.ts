/**
 * M4.1 Payout Intent engine.
 * Never calls execute_reward_payout / never inserts reward_payouts.
 * SUCCESS is the only path that marks creator_rewards PAID.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isMoneyPathFrozen } from '@/lib/server/moneyPathFreeze';
import { writeRewardAuditLog } from '@/lib/rewards/audit';
import { evaluatePayoutIntentEligibility } from './eligibility';
import { buildPayoutIntentIdempotencyKey } from './idempotency';
import {
  buildConfirmedMeta,
  buildInitiatedMeta,
  validateProviderConfirmation,
  type ProviderConfirmationEvidence,
} from './confirmation';
import type {
  PayoutIntentProviderId,
  PayoutIntentRejectReason,
  PayoutIntentRow,
  PayoutIntentStatus,
  PayoutProvider,
} from './types';
import { PAYOUT_INTENT_PROVIDER_STUB } from './types';

export type PayoutIntentOpResult =
  | { ok: true; intent: PayoutIntentRow; reused?: boolean }
  | { ok: false; reason: PayoutIntentRejectReason; message?: string };

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '23505') return true;
  const msg = (error.message ?? '').toLowerCase();
  return msg.includes('duplicate key') || msg.includes('unique constraint');
}

function isMissingTable(error: { message?: string } | null): boolean {
  const msg = (error?.message ?? '').toLowerCase();
  // Do NOT match mere presence of "payout_intents" — unique violations name the constraint.
  return (
    (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('could not find the table')) &&
    msg.includes('payout_intents')
  );
}

function mapRow(data: Record<string, unknown>): PayoutIntentRow {
  return {
    id: String(data.id),
    reward_id: String(data.reward_id),
    creator_id: String(data.creator_id),
    amount_cents: Number(data.amount_cents),
    currency: String(data.currency ?? 'MXN'),
    status: data.status as PayoutIntentStatus,
    idempotency_key: String(data.idempotency_key),
    provider: String(data.provider ?? PAYOUT_INTENT_PROVIDER_STUB),
    meta: (data.meta as Record<string, unknown>) ?? {},
    reserved_at: String(data.reserved_at ?? data.created_at),
    submitted_at: (data.submitted_at as string | null) ?? null,
    resolved_at: (data.resolved_at as string | null) ?? null,
    created_at: String(data.created_at),
    updated_at: String(data.updated_at ?? data.created_at),
  };
}

const INTENT_SELECT =
  'id, reward_id, creator_id, amount_cents, currency, status, idempotency_key, provider, meta, reserved_at, submitted_at, resolved_at, created_at, updated_at';

export async function loadPayoutIntent(
  supabase: SupabaseClient,
  intentId: string,
): Promise<PayoutIntentRow | null> {
  const { data, error } = await supabase
    .from('payout_intents')
    .select(INTENT_SELECT)
    .eq('id', intentId)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}

export async function loadPayoutIntentByReward(
  supabase: SupabaseClient,
  rewardId: string,
): Promise<PayoutIntentRow | null> {
  const { data, error } = await supabase
    .from('payout_intents')
    .select(INTENT_SELECT)
    .eq('reward_id', rewardId)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}

async function casIntentStatus(
  supabase: SupabaseClient,
  intentId: string,
  from: PayoutIntentStatus[],
  to: PayoutIntentStatus,
  patch: Record<string, unknown> = {},
): Promise<PayoutIntentRow | null> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('payout_intents')
    .update({
      status: to,
      updated_at: now,
      ...patch,
    })
    .eq('id', intentId)
    .in('status', from)
    .select(INTENT_SELECT)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}

/**
 * Reserve / claim intent for a reward. Idempotent under UNIQUE(reward_id).
 */
export async function reservePayoutIntent(
  supabase: SupabaseClient,
  input: {
    rewardId: string;
    provider?: PayoutIntentProviderId;
    actorId?: string | null;
    /** Test/guard: expected amount must match reward share. */
    expectedAmountCents?: number;
    expectedCurrency?: string;
    expectedCreatorId?: string;
  },
): Promise<PayoutIntentOpResult> {
  if (isMoneyPathFrozen()) {
    return { ok: false, reason: 'money_path_frozen' };
  }

  const eligibility = await evaluatePayoutIntentEligibility(supabase, input.rewardId);
  if (!eligibility.ok) return { ok: false, reason: eligibility.reason };

  const reward = eligibility.reward;
  if (
    input.expectedAmountCents != null &&
    input.expectedAmountCents !== reward.creator_share_cents
  ) {
    return { ok: false, reason: 'amount_mismatch' };
  }
  if (
    input.expectedCurrency != null &&
    input.expectedCurrency.trim().toUpperCase() !== reward.currency
  ) {
    return { ok: false, reason: 'currency_mismatch' };
  }
  if (input.expectedCreatorId != null && input.expectedCreatorId !== reward.creator_id) {
    return { ok: false, reason: 'creator_mismatch' };
  }

  const existing = await loadPayoutIntentByReward(supabase, reward.id);
  if (existing) {
    return { ok: true, intent: existing, reused: true };
  }

  const idempotencyKey = buildPayoutIntentIdempotencyKey(reward.id);
  const provider = (input.provider ?? PAYOUT_INTENT_PROVIDER_STUB).trim() || PAYOUT_INTENT_PROVIDER_STUB;
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('payout_intents')
    .insert({
      reward_id: reward.id,
      creator_id: reward.creator_id,
      amount_cents: reward.creator_share_cents,
      currency: reward.currency,
      status: 'RESERVED',
      idempotency_key: idempotencyKey,
      provider,
      meta: { ledger_entry_id: reward.ledger_entry_id },
      reserved_at: now,
      created_at: now,
      updated_at: now,
    })
    .select(INTENT_SELECT)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) {
      return { ok: false, reason: 'schema_missing', message: error.message };
    }
    if (isUniqueViolation(error)) {
      const raced = await loadPayoutIntentByReward(supabase, reward.id);
      if (raced) return { ok: true, intent: raced, reused: true };
    }
    return { ok: false, reason: 'insert_failed', message: error.message };
  }
  if (!data) return { ok: false, reason: 'insert_failed' };

  const intent = mapRow(data as Record<string, unknown>);
  await writeRewardAuditLog(supabase, {
    eventType: 'payout_intent_reserved',
    actorId: input.actorId ?? null,
    entityType: 'payout_intent',
    entityId: intent.id,
    previousState: null,
    newState: 'RESERVED',
    metadata: {
      reward_id: reward.id,
      idempotency_key: idempotencyKey,
      amount_cents: intent.amount_cents,
    },
  });

  return { ok: true, intent, reused: false };
}

export async function submitPayoutIntent(
  supabase: SupabaseClient,
  input: { intentId: string; provider: PayoutProvider; actorId?: string | null },
): Promise<PayoutIntentOpResult> {
  if (isMoneyPathFrozen()) {
    return { ok: false, reason: 'money_path_frozen' };
  }

  const loaded = await loadPayoutIntent(supabase, input.intentId);
  if (!loaded) return { ok: false, reason: 'intent_not_found' };

  if (loaded.status === 'SUCCEEDED' || loaded.status === 'FAILED') {
    return { ok: true, intent: loaded, reused: true };
  }
  if (loaded.status === 'UNKNOWN') {
    return { ok: false, reason: 'invalid_transition', message: 'use_reconcile_for_unknown' };
  }
  if (loaded.status === 'CANCELLED') {
    return { ok: false, reason: 'invalid_transition' };
  }

  // M5.5: already past RESERVED claim → never blind re-submit.
  // Crash recovery / ambiguity uses reconcilePayoutIntent (same key), not a second submit.
  if (loaded.status === 'SUBMITTED') {
    return { ok: true, intent: loaded, reused: true };
  }

  if (loaded.status !== 'RESERVED') {
    return { ok: false, reason: 'invalid_transition' };
  }

  const now = new Date().toISOString();
  // Single CAS: RESERVED → SUBMITTED + submit_dispatched. Only the winner may call provider.
  const moved = await casIntentStatus(supabase, loaded.id, ['RESERVED'], 'SUBMITTED', {
    submitted_at: now,
    provider: input.provider.id,
    meta: {
      ...loaded.meta,
      submit_dispatched: true,
      submit_dispatched_at: now,
    },
  });
  if (!moved) {
    const again = await loadPayoutIntent(supabase, loaded.id);
    if (!again) return { ok: false, reason: 'intent_not_found' };
    if (
      again.status === 'SUBMITTED' ||
      again.status === 'SUCCEEDED' ||
      again.status === 'FAILED' ||
      again.status === 'UNKNOWN'
    ) {
      return { ok: true, intent: again, reused: true };
    }
    return { ok: false, reason: 'invalid_transition' };
  }

  const intent = moved;
  await writeRewardAuditLog(supabase, {
    eventType: 'payout_intent_submitted',
    actorId: input.actorId ?? null,
    entityType: 'payout_intent',
    entityId: intent.id,
    previousState: 'RESERVED',
    newState: 'SUBMITTED',
    metadata: {
      idempotency_key: intent.idempotency_key,
      provider: input.provider.id,
      submit_dispatched: true,
      note: 'cas_winner_only_provider_submit',
    },
  });

  // Provider call — same idempotency_key; never regenerate. CAS winner only.
  const result = await input.provider.submit(intent);

  if (result.outcome === 'success') {
    return applyProviderConfirmation(supabase, {
      intentId: intent.id,
      rewardId: intent.reward_id,
      amountCents: intent.amount_cents,
      currency: intent.currency,
      idempotencyKey: intent.idempotency_key,
      provider: intent.provider,
      providerReference: result.externalRef?.trim() || `confirmed:${intent.idempotency_key}`,
      outcome: 'confirmed_success',
      actorId: input.actorId,
    });
  }
  if (result.outcome === 'failure') {
    const providerReference =
      (typeof intent.meta.provider_reference === 'string' && intent.meta.provider_reference.trim()) ||
      `failed:${intent.idempotency_key}`;
    return applyProviderConfirmation(supabase, {
      intentId: intent.id,
      rewardId: intent.reward_id,
      amountCents: intent.amount_cents,
      currency: intent.currency,
      idempotencyKey: intent.idempotency_key,
      provider: intent.provider,
      providerReference,
      outcome: 'confirmed_failure',
      actorId: input.actorId,
    });
  }
  if (result.outcome === 'initiated') {
    // Stay SUBMITTED — never assume completed merely because payout was attempted.
    const now = new Date().toISOString();
    const providerReference =
      result.externalRef?.trim() || `initiated:${intent.idempotency_key}`;
    const { data: patched } = await supabase
      .from('payout_intents')
      .update({
        updated_at: now,
        meta: buildInitiatedMeta(intent.meta, {
          providerReference,
          initiatedAt: now,
        }),
      })
      .eq('id', intent.id)
      .eq('status', 'SUBMITTED')
      .select(INTENT_SELECT)
      .maybeSingle();
    const out = patched ? mapRow(patched as Record<string, unknown>) : intent;
    await writeRewardAuditLog(supabase, {
      eventType: 'payout_intent_initiated',
      actorId: input.actorId ?? null,
      entityType: 'payout_intent',
      entityId: out.id,
      previousState: 'SUBMITTED',
      newState: 'SUBMITTED',
      metadata: {
        idempotency_key: out.idempotency_key,
        provider_reference: providerReference,
        note: 'awaiting_confirmation_not_paid',
      },
    });
    return { ok: true, intent: out };
  }
  return markPayoutIntentUnknown(supabase, {
    intentId: intent.id,
    actorId: input.actorId,
    reason: result.reason ?? 'provider_timeout',
  });
}

export async function markPayoutIntentUnknown(
  supabase: SupabaseClient,
  input: { intentId: string; actorId?: string | null; reason?: string | null },
): Promise<PayoutIntentOpResult> {
  const loaded = await loadPayoutIntent(supabase, input.intentId);
  if (!loaded) return { ok: false, reason: 'intent_not_found' };
  if (loaded.status === 'UNKNOWN') return { ok: true, intent: loaded, reused: true };
  if (loaded.status === 'SUCCEEDED' || loaded.status === 'FAILED' || loaded.status === 'CANCELLED') {
    return { ok: false, reason: 'already_resolved' };
  }

  const moved = await casIntentStatus(supabase, loaded.id, ['SUBMITTED', 'RESERVED'], 'UNKNOWN', {
    meta: { ...loaded.meta, unknown_reason: input.reason ?? 'unknown' },
  });
  if (!moved) {
    const again = await loadPayoutIntent(supabase, loaded.id);
    if (again?.status === 'UNKNOWN') return { ok: true, intent: again, reused: true };
    return { ok: false, reason: 'invalid_transition' };
  }

  await writeRewardAuditLog(supabase, {
    eventType: 'payout_intent_unknown',
    actorId: input.actorId ?? null,
    entityType: 'payout_intent',
    entityId: moved.id,
    previousState: loaded.status,
    newState: 'UNKNOWN',
    metadata: {
      idempotency_key: moved.idempotency_key,
      reason: input.reason ?? null,
      note: 'UNKNOWN_must_not_create_new_intent_or_key',
    },
  });

  return { ok: true, intent: moved };
}

/**
 * M4.3 confirmation boundary: verified provider evidence → SUCCESS/FAILURE once.
 * Validates identity (reward/amount/currency/key/provider_reference) fail-closed.
 * Idempotent on duplicate callback with same evidence.
 */
export async function applyProviderConfirmation(
  supabase: SupabaseClient,
  evidence: ProviderConfirmationEvidence,
): Promise<PayoutIntentOpResult> {
  if (isMoneyPathFrozen()) {
    return { ok: false, reason: 'money_path_frozen' };
  }

  const loaded = await loadPayoutIntent(supabase, evidence.intentId);
  if (!loaded) return { ok: false, reason: 'intent_not_found' };

  const validation = validateProviderConfirmation(loaded, evidence);
  if (!validation.ok) {
    return {
      ok: false,
      reason: validation.reason as PayoutIntentRejectReason,
      message: validation.message,
    };
  }

  if (loaded.status === 'SUCCEEDED') {
    if (evidence.outcome !== 'confirmed_success') {
      return { ok: false, reason: 'already_resolved' };
    }
    return { ok: true, intent: loaded, reused: true };
  }
  if (loaded.status === 'FAILED') {
    if (evidence.outcome !== 'confirmed_failure') {
      return { ok: false, reason: 'already_resolved' };
    }
    return { ok: true, intent: loaded, reused: true };
  }
  if (loaded.status === 'CANCELLED') {
    return { ok: false, reason: 'already_resolved' };
  }

  if (evidence.outcome === 'confirmed_failure') {
    return confirmPayoutIntentFailure(supabase, {
      intentId: loaded.id,
      actorId: evidence.actorId,
      reason: 'provider_confirmed_failure',
      providerReference: evidence.providerReference,
    });
  }

  return confirmPayoutIntentSuccess(supabase, {
    intentId: loaded.id,
    actorId: evidence.actorId,
    externalRef: evidence.providerReference,
    providerReference: evidence.providerReference,
  });
}

export async function confirmPayoutIntentSuccess(
  supabase: SupabaseClient,
  input: {
    intentId: string;
    actorId?: string | null;
    externalRef?: string | null;
    providerReference?: string | null;
  },
): Promise<PayoutIntentOpResult> {
  if (isMoneyPathFrozen()) {
    return { ok: false, reason: 'money_path_frozen' };
  }

  const loaded = await loadPayoutIntent(supabase, input.intentId);
  if (!loaded) return { ok: false, reason: 'intent_not_found' };
  if (loaded.status === 'SUCCEEDED') {
    return { ok: true, intent: loaded, reused: true };
  }
  if (loaded.status === 'FAILED' || loaded.status === 'CANCELLED') {
    return { ok: false, reason: 'already_resolved' };
  }
  if (loaded.status !== 'SUBMITTED' && loaded.status !== 'UNKNOWN') {
    return { ok: false, reason: 'invalid_transition' };
  }

  const now = new Date().toISOString();
  const providerReference =
    (input.providerReference ?? input.externalRef)?.trim() ||
    `confirmed:${loaded.idempotency_key}`;

  const { data: rewardRow } = await supabase
    .from('creator_rewards')
    .select('id, status, meta')
    .eq('id', loaded.reward_id)
    .maybeSingle();
  const prevMeta =
    rewardRow && typeof (rewardRow as { meta?: unknown }).meta === 'object'
      ? ((rewardRow as { meta: Record<string, unknown> }).meta ?? {})
      : {};

  // CAS reward first: AVAILABLE → PAID (no reward_payouts row — intent is authority here).
  const { data: paid, error: payErr } = await supabase
    .from('creator_rewards')
    .update({
      status: 'PAID',
      paid_at: now,
      updated_at: now,
      meta: {
        ...prevMeta,
        payout_intent_id: loaded.id,
        payout_idempotency_key: loaded.idempotency_key,
        provider: loaded.provider,
        provider_reference: providerReference,
        external_ref: providerReference,
      },
    })
    .eq('id', loaded.reward_id)
    .eq('status', 'AVAILABLE')
    .select('id, status')
    .maybeSingle();

  if (payErr) {
    return { ok: false, reason: 'mark_paid_failed', message: payErr.message };
  }

  if (!paid?.id) {
    // Already PAID by concurrent winner — still close intent if needed.
    const { data: existingReward } = await supabase
      .from('creator_rewards')
      .select('id, status')
      .eq('id', loaded.reward_id)
      .maybeSingle();
    if ((existingReward as { status?: string } | null)?.status !== 'PAID') {
      return { ok: false, reason: 'mark_paid_failed' };
    }
  }

  const moved = await casIntentStatus(
    supabase,
    loaded.id,
    ['SUBMITTED', 'UNKNOWN'],
    'SUCCEEDED',
    {
      resolved_at: now,
      meta: buildConfirmedMeta(loaded.meta, {
        providerReference,
        confirmedAt: now,
        outcome: 'confirmed_success',
      }),
    },
  );

  const intent =
    moved ??
    (await loadPayoutIntent(supabase, loaded.id));
  if (!intent || intent.status !== 'SUCCEEDED') {
    const again = await loadPayoutIntent(supabase, loaded.id);
    if (again?.status === 'SUCCEEDED') {
      return { ok: true, intent: again, reused: true };
    }
    return { ok: false, reason: 'update_failed' };
  }

  await writeRewardAuditLog(supabase, {
    eventType: 'payout_intent_succeeded',
    actorId: input.actorId ?? null,
    entityType: 'payout_intent',
    entityId: intent.id,
    previousState: loaded.status,
    newState: 'SUCCEEDED',
    metadata: {
      reward_id: intent.reward_id,
      idempotency_key: intent.idempotency_key,
      provider_reference: providerReference,
      confirmation: 'confirmed_success',
    },
  });
  await writeRewardAuditLog(supabase, {
    eventType: 'reward_paid',
    actorId: input.actorId ?? null,
    entityType: 'creator_reward',
    entityId: intent.reward_id,
    previousState: 'AVAILABLE',
    newState: 'PAID',
    metadata: {
      payout_intent_id: intent.id,
      idempotency_key: intent.idempotency_key,
      provider_reference: providerReference,
      via: 'payout_intent',
      legacy_rpc: false,
    },
  });

  return { ok: true, intent };
}

export async function confirmPayoutIntentFailure(
  supabase: SupabaseClient,
  input: {
    intentId: string;
    actorId?: string | null;
    reason?: string | null;
    providerReference?: string | null;
  },
): Promise<PayoutIntentOpResult> {
  const loaded = await loadPayoutIntent(supabase, input.intentId);
  if (!loaded) return { ok: false, reason: 'intent_not_found' };
  if (loaded.status === 'FAILED') return { ok: true, intent: loaded, reused: true };
  if (loaded.status === 'SUCCEEDED' || loaded.status === 'CANCELLED') {
    return { ok: false, reason: 'already_resolved' };
  }
  if (loaded.status !== 'SUBMITTED' && loaded.status !== 'UNKNOWN') {
    return { ok: false, reason: 'invalid_transition' };
  }

  const now = new Date().toISOString();
  const providerReference =
    input.providerReference?.trim() ||
    (typeof loaded.meta.provider_reference === 'string'
      ? loaded.meta.provider_reference
      : `failed:${loaded.idempotency_key}`);

  const moved = await casIntentStatus(
    supabase,
    loaded.id,
    ['SUBMITTED', 'UNKNOWN'],
    'FAILED',
    {
      resolved_at: now,
      meta: {
        ...buildConfirmedMeta(loaded.meta, {
          providerReference,
          confirmedAt: now,
          outcome: 'confirmed_failure',
        }),
        failure_reason: input.reason ?? null,
      },
    },
  );
  if (!moved) {
    const again = await loadPayoutIntent(supabase, loaded.id);
    if (again?.status === 'FAILED') return { ok: true, intent: again, reused: true };
    return { ok: false, reason: 'invalid_transition' };
  }

  await writeRewardAuditLog(supabase, {
    eventType: 'payout_intent_failed',
    actorId: input.actorId ?? null,
    entityType: 'payout_intent',
    entityId: moved.id,
    previousState: loaded.status,
    newState: 'FAILED',
    metadata: {
      idempotency_key: moved.idempotency_key,
      provider_reference: providerReference,
      reason: input.reason ?? null,
      reward_remains: 'AVAILABLE',
      confirmation: 'confirmed_failure',
    },
  });

  return { ok: true, intent: moved };
}

/**
 * Reconcile UNKNOWN (or still-ambiguous) intent. Never creates a new intent/key.
 * Provider success/failure must pass confirmation evidence validation.
 */
export async function reconcilePayoutIntent(
  supabase: SupabaseClient,
  input: { intentId: string; provider: PayoutProvider; actorId?: string | null },
): Promise<PayoutIntentOpResult> {
  if (isMoneyPathFrozen()) {
    return { ok: false, reason: 'money_path_frozen' };
  }

  const loaded = await loadPayoutIntent(supabase, input.intentId);
  if (!loaded) return { ok: false, reason: 'intent_not_found' };
  if (loaded.status === 'SUCCEEDED' || loaded.status === 'FAILED') {
    return { ok: true, intent: loaded, reused: true };
  }
  if (loaded.status !== 'UNKNOWN' && loaded.status !== 'SUBMITTED') {
    return { ok: false, reason: 'invalid_transition' };
  }

  const result = await input.provider.reconcile(loaded);
  if (result.outcome === 'success') {
    const providerReference =
      result.externalRef?.trim() ||
      (typeof loaded.meta.provider_reference === 'string'
        ? loaded.meta.provider_reference
        : `reconcile:${loaded.idempotency_key}`);
    return applyProviderConfirmation(supabase, {
      intentId: loaded.id,
      rewardId: loaded.reward_id,
      amountCents: loaded.amount_cents,
      currency: loaded.currency,
      idempotencyKey: loaded.idempotency_key,
      provider: loaded.provider,
      providerReference,
      outcome: 'confirmed_success',
      actorId: input.actorId,
    });
  }
  if (result.outcome === 'failure') {
    const providerReference =
      (typeof loaded.meta.provider_reference === 'string'
        ? loaded.meta.provider_reference
        : null) || `reconcile_fail:${loaded.idempotency_key}`;
    return applyProviderConfirmation(supabase, {
      intentId: loaded.id,
      rewardId: loaded.reward_id,
      amountCents: loaded.amount_cents,
      currency: loaded.currency,
      idempotencyKey: loaded.idempotency_key,
      provider: loaded.provider,
      providerReference,
      outcome: 'confirmed_failure',
      actorId: input.actorId,
    });
  }
  // Still unknown — keep UNKNOWN, same key. Never auto-SUCCESS.
  if (loaded.status === 'UNKNOWN') {
    return { ok: true, intent: loaded, reused: true };
  }
  return markPayoutIntentUnknown(supabase, {
    intentId: loaded.id,
    actorId: input.actorId,
    reason: result.reason ?? 'reconcile_still_unknown',
  });
}

export async function cancelPayoutIntent(
  supabase: SupabaseClient,
  input: { intentId: string; actorId?: string | null },
): Promise<PayoutIntentOpResult> {
  const loaded = await loadPayoutIntent(supabase, input.intentId);
  if (!loaded) return { ok: false, reason: 'intent_not_found' };
  if (loaded.status === 'CANCELLED') return { ok: true, intent: loaded, reused: true };
  // Only pre-provider reservation may cancel.
  if (loaded.status !== 'RESERVED') {
    return { ok: false, reason: 'invalid_transition' };
  }

  const moved = await casIntentStatus(supabase, loaded.id, ['RESERVED'], 'CANCELLED', {
    resolved_at: new Date().toISOString(),
  });
  if (!moved) return { ok: false, reason: 'invalid_transition' };

  await writeRewardAuditLog(supabase, {
    eventType: 'payout_intent_cancelled',
    actorId: input.actorId ?? null,
    entityType: 'payout_intent',
    entityId: moved.id,
    previousState: 'RESERVED',
    newState: 'CANCELLED',
    metadata: { idempotency_key: moved.idempotency_key },
  });

  return { ok: true, intent: moved };
}

/** Hard guard: this module must never invoke legacy SPEI RPC. */
export const PAYOUT_INTENT_LEGACY_RPC_FORBIDDEN = 'execute_reward_payout' as const;
