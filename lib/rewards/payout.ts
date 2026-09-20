/**
 * Manual SPEI payout — claim authority is payout_intents (M4.2).
 * Legacy execute_reward_payout must not mark AVAILABLE→PAID.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { REWARDS_MIN_PAYOUT_CENTS } from '@/lib/rewards/config';
import { getUserRewardBalances } from '@/lib/rewards/rewardsEngine';
import {
  isMoneyPathFrozen,
  MONEY_PATH_FROZEN_CODE,
  MONEY_PATH_FROZEN_MESSAGE,
} from '@/lib/server/moneyPathFreeze';
import { writeRewardAuditLog } from '@/lib/rewards/audit';
import {
  loadPayoutIntentByReward,
  reservePayoutIntent,
  submitPayoutIntent,
} from '@/lib/rewards/payoutIntent/engine';
import {
  createManualSpeiProvider,
  type ManualSpeiProvider,
  type ManualSpeiSubmitScenario,
  PAYOUT_INTENT_PROVIDER_MANUAL_SPEI,
} from '@/lib/rewards/payoutIntent/manualSpeiProvider';
import type { PayoutProvider } from '@/lib/rewards/payoutIntent/types';

export type CreatePayoutInput = {
  userId: string;
  amountCents: number;
  speiReference: string;
  notes?: string | null;
  createdBy: string;
  rewardIds?: string[];
  /**
   * Injected provider (tests/staging). Default = stub success simulation.
   * Never a real bank SPEI in this phase.
   */
  provider?: PayoutProvider;
  /** Stub scenario when provider not injected. Default success. */
  stubScenario?: ManualSpeiSubmitScenario;
  /**
   * When true AND provider.recordsHistoricalPayout, insert reward_payouts
   * evidence after SUCCESS and set creator_rewards.payout_id.
   * Stub canary keeps this false → reward_payouts unchanged.
   */
  writeHistoricalPayoutRow?: boolean;
};

export type CreatePayoutResult =
  | { ok: true; payoutId: string; paidRewardIds: string[]; intentIds: string[] }
  | { ok: false; error: string; status: number; code?: string };

function mapIntentReject(reason: string): { error: string; status: number; code: string } {
  switch (reason) {
    case 'below_minimum_available':
      return {
        error: `Saldo disponible bajo el mínimo (${REWARDS_MIN_PAYOUT_CENTS / 100} MXN)`,
        status: 400,
        code: reason,
      };
    case 'amount_mismatch':
    case 'currency_mismatch':
      return {
        error: 'Selecciona recompensas que sumen exactamente el monto a pagar',
        status: 400,
        code: reason,
      };
    case 'reward_terminal':
      return { error: 'Recompensa ya terminal (PAID/CANCELLED/REVERSED)', status: 409, code: reason };
    case 'reward_not_available':
      return { error: 'Recompensa no disponible para pago', status: 409, code: reason };
    case 'money_path_frozen':
      return {
        error: `${MONEY_PATH_FROZEN_MESSAGE} [${MONEY_PATH_FROZEN_CODE}]`,
        status: 503,
        code: reason,
      };
    case 'legacy_payout_forbidden':
      return { error: 'RPC legacy deshabilitado; usar payout_intent', status: 503, code: reason };
    default:
      return { error: `No se pudo reclamar payout intent (${reason})`, status: 409, code: reason };
  }
}

function blockExistingIntent(status: string): CreatePayoutResult | null {
  if (status === 'RESERVED') return null; // reuse same claim
  if (status === 'SUCCEEDED') {
    return {
      ok: false,
      error: 'Recompensa ya tiene payout SUCCEEDED',
      status: 409,
      code: 'intent_succeeded',
    };
  }
  if (status === 'SUBMITTED') {
    return {
      ok: false,
      error: 'Ya existe un payout_intent SUBMITTED; no se puede reclamar de nuevo',
      status: 409,
      code: 'intent_submitted',
    };
  }
  if (status === 'UNKNOWN') {
    return {
      ok: false,
      error: 'payout_intent en UNKNOWN; requiere reconciliación (no segundo pago)',
      status: 409,
      code: 'intent_unknown',
    };
  }
  if (status === 'FAILED') {
    return {
      ok: false,
      error: 'payout_intent FAILED (terminal para claim manual; no segundo pago)',
      status: 409,
      code: 'intent_failed_terminal',
    };
  }
  if (status === 'CANCELLED') {
    return {
      ok: false,
      error: 'payout_intent CANCELLED; no se puede reclamar de nuevo',
      status: 409,
      code: 'intent_cancelled',
    };
  }
  return {
    ok: false,
    error: `payout_intent en estado bloqueante: ${status}`,
    status: 409,
    code: 'intent_blocked',
  };
}

async function maybeWriteHistoricalPayout(
  supabase: SupabaseClient,
  input: {
    userId: string;
    amountCents: number;
    speiReference: string;
    createdBy: string;
    notes?: string | null;
    rewardIds: string[];
    intentIds: string[];
    enabled: boolean;
  },
): Promise<string | null> {
  if (!input.enabled) return null;

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('reward_payouts')
    .insert({
      user_id: input.userId,
      amount_cents: input.amountCents,
      currency: 'MXN',
      status: 'completed',
      spei_reference: input.speiReference,
      paid_at: now,
      created_by: input.createdBy,
      notes: input.notes?.trim() || null,
      meta: {
        reward_ids: input.rewardIds,
        payout_intent_ids: input.intentIds,
        via: 'payout_intent',
        legacy_rpc: false,
      },
    })
    .select('id')
    .maybeSingle();

  if (error || !data?.id) {
    console.error('[rewards/payout] historical row failed', error?.message);
    return null;
  }

  const payoutId = String(data.id);
  await supabase
    .from('creator_rewards')
    .update({ payout_id: payoutId, updated_at: now })
    .in('id', input.rewardIds)
    .eq('status', 'PAID');

  return payoutId;
}

export async function createManualRewardPayout(
  supabase: SupabaseClient,
  input: CreatePayoutInput,
): Promise<CreatePayoutResult> {
  if (isMoneyPathFrozen()) {
    return {
      ok: false,
      error: `${MONEY_PATH_FROZEN_MESSAGE} [${MONEY_PATH_FROZEN_CODE}]`,
      status: 503,
      code: MONEY_PATH_FROZEN_CODE,
    };
  }

  const spei = input.speiReference?.trim();
  if (!spei || spei.length < 4) {
    return { ok: false, error: 'Referencia SPEI obligatoria', status: 400, code: 'invalid_spei' };
  }
  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
    return { ok: false, error: 'Monto inválido', status: 400, code: 'invalid_amount' };
  }

  const balances = await getUserRewardBalances(supabase, input.userId);
  if (balances.availableCents < REWARDS_MIN_PAYOUT_CENTS) {
    return {
      ok: false,
      error: `Saldo disponible bajo el mínimo (${REWARDS_MIN_PAYOUT_CENTS / 100} MXN)`,
      status: 400,
      code: 'below_minimum',
    };
  }
  if (input.amountCents > balances.availableCents) {
    return {
      ok: false,
      error: 'Monto superior al saldo disponible',
      status: 400,
      code: 'amount_exceeds_available',
    };
  }
  if (input.amountCents < REWARDS_MIN_PAYOUT_CENTS) {
    return {
      ok: false,
      error: `El mínimo de pago es ${REWARDS_MIN_PAYOUT_CENTS / 100} MXN`,
      status: 400,
      code: 'below_minimum',
    };
  }

  let rewardQuery = supabase
    .from('creator_rewards')
    .select('id, creator_share_cents, creator_id, status')
    .eq('creator_id', input.userId)
    .eq('status', 'AVAILABLE')
    .order('available_at', { ascending: true });

  if (input.rewardIds?.length) {
    rewardQuery = rewardQuery.in('id', input.rewardIds);
  }

  const { data: availableRewards, error: listErr } = await rewardQuery;
  if (listErr || !availableRewards?.length) {
    return {
      ok: false,
      error: 'No hay recompensas disponibles para pagar',
      status: 400,
      code: 'no_available_rewards',
    };
  }

  for (const row of availableRewards) {
    const ownerId = (row as { creator_id?: string }).creator_id;
    if (ownerId && ownerId !== input.userId) {
      return {
        ok: false,
        error: 'Recompensa de otro creador detectada',
        status: 400,
        code: 'creator_mismatch',
      };
    }
  }

  let remaining = input.amountCents;
  const toPay: string[] = [];
  for (const row of availableRewards) {
    const cents = Number((row as { creator_share_cents?: number }).creator_share_cents ?? 0);
    if (cents <= 0) continue;
    if (remaining <= 0) break;
    toPay.push((row as { id: string }).id);
    remaining -= cents;
  }

  const selectedTotal = (availableRewards as Array<{ id: string; creator_share_cents: number }>)
    .filter((r) => toPay.includes(r.id))
    .reduce((s, r) => s + Number(r.creator_share_cents ?? 0), 0);

  if (selectedTotal !== input.amountCents) {
    return {
      ok: false,
      error: 'Selecciona recompensas que sumen exactamente el monto a pagar',
      status: 400,
      code: 'amount_mismatch',
    };
  }

  // Hard guard: never call legacy RPC from this path.
  const provider: PayoutProvider =
    input.provider ??
    createManualSpeiProvider({
      submit: input.stubScenario ?? 'success',
      speiReference: spei,
      recordsHistoricalPayout: false,
    });

  const manual = provider as ManualSpeiProvider;
  const batchId = `manual_batch:${toPay.slice().sort().join(',')}`;

  const reservedIds: string[] = [];
  for (const rewardId of toPay) {
    const existing = await loadPayoutIntentByReward(supabase, rewardId);
    if (existing) {
      const blocked = blockExistingIntent(existing.status);
      if (blocked) return blocked;
    }

    const reserved = await reservePayoutIntent(supabase, {
      rewardId,
      provider: PAYOUT_INTENT_PROVIDER_MANUAL_SPEI,
      actorId: input.createdBy,
      expectedCreatorId: input.userId,
    });
    if (!reserved.ok) {
      return { ok: false, ...mapIntentReject(reserved.reason) };
    }
    // Race: another worker may have moved past RESERVED
    if (reserved.intent.status !== 'RESERVED') {
      const blocked = blockExistingIntent(reserved.intent.status);
      if (blocked) return blocked;
    }
    reservedIds.push(reserved.intent.id);
  }

  const paidRewardIds: string[] = [];
  const intentIds: string[] = [];

  for (const intentId of reservedIds) {
    const submitted = await submitPayoutIntent(supabase, {
      intentId,
      provider,
      actorId: input.createdBy,
    });
    if (!submitted.ok) {
      return { ok: false, ...mapIntentReject(submitted.reason) };
    }

    intentIds.push(submitted.intent.id);

    if (submitted.intent.status === 'SUCCEEDED') {
      paidRewardIds.push(submitted.intent.reward_id);
      await writeRewardAuditLog(supabase, {
        eventType: 'manual_spei_via_intent',
        actorId: input.createdBy,
        entityType: 'payout_intent',
        entityId: submitted.intent.id,
        previousState: 'SUBMITTED',
        newState: 'SUCCEEDED',
        metadata: {
          spei_reference: spei,
          batch_id: batchId,
          reward_id: submitted.intent.reward_id,
          legacy_rpc: false,
          notes: input.notes?.trim() || null,
        },
      });
      continue;
    }

    if (submitted.intent.status === 'FAILED') {
      return {
        ok: false,
        error: 'Pago manual fallido (intent FAILED; reward sigue AVAILABLE)',
        status: 409,
        code: 'intent_failed',
      };
    }
    if (submitted.intent.status === 'UNKNOWN') {
      return {
        ok: false,
        error: 'Pago manual en UNKNOWN; requiere reconciliación (no PAID)',
        status: 409,
        code: 'intent_unknown',
      };
    }
    if (submitted.intent.status === 'SUBMITTED') {
      return {
        ok: false,
        error: 'Pago manual iniciado; pendiente de confirmación (no PAID)',
        status: 409,
        code: 'intent_initiated',
      };
    }
    return {
      ok: false,
      error: `Estado de intent inesperado: ${submitted.intent.status}`,
      status: 500,
      code: 'unexpected_intent_status',
    };
  }

  if (paidRewardIds.length !== toPay.length) {
    return {
      ok: false,
      error: 'No se pagaron todas las recompensas seleccionadas',
      status: 500,
      code: 'partial_paid',
    };
  }

  const writeHistory =
    input.writeHistoricalPayoutRow === true &&
    typeof manual.recordsHistoricalPayout === 'boolean' &&
    manual.recordsHistoricalPayout === true;

  const historicalId = await maybeWriteHistoricalPayout(supabase, {
    userId: input.userId,
    amountCents: input.amountCents,
    speiReference: spei,
    createdBy: input.createdBy,
    notes: input.notes,
    rewardIds: paidRewardIds,
    intentIds,
    enabled: writeHistory,
  });

  // payoutId: historical row when written; otherwise lead intent id (claim authority).
  const payoutId = historicalId ?? intentIds[0]!;

  return { ok: true, payoutId, paidRewardIds, intentIds };
}

/** Guard exported for tests — app path must never invoke this RPC name. */
export const LEGACY_EXECUTE_REWARD_PAYOUT_RPC = 'execute_reward_payout' as const;
