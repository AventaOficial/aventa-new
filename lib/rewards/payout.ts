import type { SupabaseClient } from '@supabase/supabase-js';
import { REWARDS_MIN_PAYOUT_CENTS } from '@/lib/rewards/config';
import { getUserRewardBalances } from '@/lib/rewards/rewardsEngine';

export type CreatePayoutInput = {
  userId: string;
  amountCents: number;
  speiReference: string;
  notes?: string | null;
  createdBy: string;
  rewardIds?: string[];
};

export type CreatePayoutResult =
  | { ok: true; payoutId: string; paidRewardIds: string[] }
  | { ok: false; error: string; status: number };

function mapRpcError(message: string): { error: string; status: number } {
  const m = message.toLowerCase();
  if (m.includes('below_minimum_payout') || m.includes('available_below_minimum')) {
    return {
      error: `Saldo disponible bajo el mínimo (${REWARDS_MIN_PAYOUT_CENTS / 100} MXN)`,
      status: 400,
    };
  }
  if (m.includes('amount_exceeds_available')) {
    return { error: 'Monto superior al saldo disponible', status: 400 };
  }
  if (m.includes('amount_mismatch') || m.includes('invalid_reward_selection')) {
    return {
      error: 'Selecciona recompensas que sumen exactamente el monto a pagar',
      status: 400,
    };
  }
  if (m.includes('invalid_spei_reference')) {
    return { error: 'Referencia SPEI obligatoria', status: 400 };
  }
  if (m.includes('invalid_amount')) {
    return { error: 'Monto inválido', status: 400 };
  }
  if (m.includes('reward_ids_required')) {
    return { error: 'No hay recompensas disponibles para pagar', status: 400 };
  }
  if (m.includes('execute_reward_payout') || m.includes('does not exist')) {
    return {
      error: 'Falta migración execute_reward_payout. Ejecuta docs/supabase-migrations/20260830_rewards_v1_monetary_hardening.sql',
      status: 503,
    };
  }
  return { error: 'No se pudo registrar el pago', status: 500 };
}

export async function createManualRewardPayout(
  supabase: SupabaseClient,
  input: CreatePayoutInput,
): Promise<CreatePayoutResult> {
  const spei = input.speiReference?.trim();
  if (!spei || spei.length < 4) {
    return { ok: false, error: 'Referencia SPEI obligatoria', status: 400 };
  }
  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
    return { ok: false, error: 'Monto inválido', status: 400 };
  }

  const balances = await getUserRewardBalances(supabase, input.userId);
  if (balances.availableCents < REWARDS_MIN_PAYOUT_CENTS) {
    return {
      ok: false,
      error: `Saldo disponible bajo el mínimo (${REWARDS_MIN_PAYOUT_CENTS / 100} MXN)`,
      status: 400,
    };
  }
  if (input.amountCents > balances.availableCents) {
    return { ok: false, error: 'Monto superior al saldo disponible', status: 400 };
  }
  if (input.amountCents < REWARDS_MIN_PAYOUT_CENTS) {
    return {
      ok: false,
      error: `El mínimo de pago es ${REWARDS_MIN_PAYOUT_CENTS / 100} MXN`,
      status: 400,
    };
  }

  let rewardQuery = supabase
    .from('creator_rewards')
    .select('id, creator_share_cents, creator_id')
    .eq('creator_id', input.userId)
    .eq('status', 'AVAILABLE')
    .order('available_at', { ascending: true });

  if (input.rewardIds?.length) {
    rewardQuery = rewardQuery.in('id', input.rewardIds);
  }

  const { data: availableRewards, error: listErr } = await rewardQuery;
  if (listErr || !availableRewards?.length) {
    return { ok: false, error: 'No hay recompensas disponibles para pagar', status: 400 };
  }

  for (const row of availableRewards) {
    const ownerId = (row as { creator_id?: string }).creator_id;
    if (ownerId && ownerId !== input.userId) {
      return { ok: false, error: 'Recompensa de otro creador detectada', status: 400 };
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
    };
  }

  const { data, error } = await supabase.rpc('execute_reward_payout', {
    p_user_id: input.userId,
    p_amount_cents: input.amountCents,
    p_spei_reference: spei,
    p_created_by: input.createdBy,
    p_reward_ids: toPay,
    p_notes: input.notes?.trim() || null,
  });

  if (error) {
    console.error('[rewards/payout rpc]', error.message);
    const mapped = mapRpcError(error.message);
    return { ok: false, ...mapped };
  }

  const payload = data as {
    ok?: boolean;
    payout_id?: string;
    paid_reward_ids?: string[];
  } | null;

  if (!payload?.ok || !payload.payout_id) {
    return { ok: false, error: 'No se pudo registrar el pago', status: 500 };
  }

  const paidIds = Array.isArray(payload.paid_reward_ids)
    ? payload.paid_reward_ids.map(String)
    : toPay;

  return { ok: true, payoutId: payload.payout_id, paidRewardIds: paidIds };
}
