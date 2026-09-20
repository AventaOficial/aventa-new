/**
 * M5.4 — processAvailableRewardPayoutIntent
 * AVAILABLE → reservePayoutIntent ONLY.
 * No submit. No provider execute. No PAID. No reward_payouts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isRewardsProgramActive } from '@/lib/rewards/programStatus';
import {
  reservePayoutIntent,
  PAYOUT_INTENT_PROVIDER_STUB,
} from '@/lib/rewards/payoutIntent';
import { writeRewardAuditLog } from '@/lib/rewards/audit';
import { classifyReserveReject } from './classify';
import type { ProcessAvailablePayoutIntentResult } from './types';

export async function processAvailableRewardPayoutIntent(
  supabase: SupabaseClient,
  rewardId: string,
  options?: { actorId?: string | null },
): Promise<ProcessAvailablePayoutIntentResult> {
  const id = rewardId.trim();
  if (!id) {
    return {
      rewardId: id,
      outcome: 'rejected',
      reason: 'reward_not_found',
      intentId: null,
      intentStatus: null,
      idempotencyKey: null,
      reused: false,
      terminal: true,
    };
  }

  if (!isRewardsProgramActive()) {
    const deferred: ProcessAvailablePayoutIntentResult = {
      rewardId: id,
      outcome: 'deferred',
      reason: 'program_inactive',
      intentId: null,
      intentStatus: null,
      idempotencyKey: null,
      reused: false,
      terminal: false,
    };
    await writeRewardAuditLog(supabase, {
      eventType: 'available_payout_intent_deferred',
      actorId: options?.actorId ?? null,
      entityType: 'creator_reward',
      entityId: id,
      previousState: null,
      newState: 'deferred',
      metadata: { reason: 'program_inactive', source: 'm54_available_payout_intent' },
    });
    return deferred;
  }

  // Stub provider id only — never resolve/execute real provider transport.
  const reserved = await reservePayoutIntent(supabase, {
    rewardId: id,
    provider: PAYOUT_INTENT_PROVIDER_STUB,
    actorId: options?.actorId ?? null,
  });

  if (reserved.ok) {
    const result: ProcessAvailablePayoutIntentResult = {
      rewardId: id,
      outcome: reserved.reused ? 'reused' : 'reserved',
      reason: reserved.reused ? 'intent_reused' : 'intent_reserved',
      intentId: reserved.intent.id,
      intentStatus: reserved.intent.status,
      idempotencyKey: reserved.intent.idempotency_key,
      reused: Boolean(reserved.reused),
      terminal: true, // claim exists — do not re-create
    };
    await writeRewardAuditLog(supabase, {
      eventType: reserved.reused
        ? 'available_payout_intent_reused'
        : 'available_payout_intent_reserved',
      actorId: options?.actorId ?? null,
      entityType: 'payout_intent',
      entityId: reserved.intent.id,
      previousState: null,
      newState: reserved.intent.status,
      metadata: {
        reward_id: id,
        idempotency_key: reserved.intent.idempotency_key,
        reused: Boolean(reserved.reused),
        source: 'm54_available_payout_intent',
        provider_executed: false,
        submitted: false,
      },
    });
    return result;
  }

  const classified = classifyReserveReject(reserved.reason);
  const result: ProcessAvailablePayoutIntentResult = {
    rewardId: id,
    outcome: classified.class,
    reason: reserved.reason,
    intentId: null,
    intentStatus: null,
    idempotencyKey: null,
    reused: false,
    terminal: classified.terminal,
  };
  await writeRewardAuditLog(supabase, {
    eventType: 'available_payout_intent_rejected',
    actorId: options?.actorId ?? null,
    entityType: 'creator_reward',
    entityId: id,
    previousState: null,
    newState: classified.class,
    metadata: {
      reason: reserved.reason,
      terminal: classified.terminal,
      source: 'm54_available_payout_intent',
      provider_executed: false,
    },
  });
  return result;
}
