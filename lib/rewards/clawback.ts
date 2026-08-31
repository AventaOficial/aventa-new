import type { SupabaseClient } from '@supabase/supabase-js';
import { writeRewardAuditLog } from '@/lib/rewards/audit';

export type ClawbackResult =
  | { ok: true; adjustmentId: string }
  | { ok: false; error: string; status: number };

/**
 * Registra ajuste/clawback pendiente sobre reward PAID.
 * El reward permanece PAID; no se revierte silenciosamente.
 */
export async function createPaidRewardClawbackAdjustment(
  supabase: SupabaseClient,
  input: {
    rewardId: string;
    actorId: string;
    reason: string;
    ledgerEntryId?: string | null;
    speiClawbackReference?: string | null;
  },
): Promise<ClawbackResult> {
  const reason = input.reason?.trim();
  if (!reason || reason.length < 3) {
    return { ok: false, error: 'Motivo obligatorio', status: 400 };
  }

  const { data: reward, error: rewardErr } = await supabase
    .from('creator_rewards')
    .select(
      'id, status, creator_share_cents, ledger_entry_id, payout_id, creator_id, gross_commission_cents',
    )
    .eq('id', input.rewardId)
    .maybeSingle();

  if (rewardErr || !reward) {
    return { ok: false, error: 'Recompensa no encontrada', status: 404 };
  }

  const row = reward as {
    id: string;
    status: string;
    creator_share_cents: number;
    ledger_entry_id: string;
    payout_id?: string | null;
    creator_id: string;
    gross_commission_cents: number;
  };

  if (row.status !== 'PAID') {
    return {
      ok: false,
      error: 'Solo recompensas PAID requieren clawback explícito',
      status: 400,
    };
  }

  const { data: pending } = await supabase
    .from('reward_clawback_adjustments')
    .select('id')
    .eq('reward_id', row.id)
    .eq('status', 'pending')
    .maybeSingle();

  if (pending?.id) {
    return { ok: false, error: 'Ya existe un ajuste pendiente para esta recompensa', status: 409 };
  }

  const now = new Date().toISOString();
  const { data: inserted, error: insertErr } = await supabase
    .from('reward_clawback_adjustments')
    .insert({
      reward_id: row.id,
      ledger_entry_id: input.ledgerEntryId ?? row.ledger_entry_id,
      payout_id: row.payout_id ?? null,
      original_amount_cents: Number(row.creator_share_cents),
      adjustment_amount_cents: Number(row.creator_share_cents),
      currency: 'MXN',
      status: 'pending',
      reason,
      created_by: input.actorId,
      spei_clawback_reference: input.speiClawbackReference?.trim() || null,
      meta: {
        gross_commission_cents: row.gross_commission_cents,
        creator_id: row.creator_id,
      },
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    console.error('[rewards/clawback]', insertErr?.message);
    return { ok: false, error: 'No se pudo registrar el ajuste', status: 500 };
  }

  const adjustmentId = (inserted as { id: string }).id;

  await writeRewardAuditLog(supabase, {
    eventType: 'reward_clawback_pending',
    actorId: input.actorId,
    entityType: 'creator_reward',
    entityId: row.id,
    previousState: 'PAID',
    newState: 'PAID',
    metadata: {
      adjustment_id: adjustmentId,
      ledger_entry_id: input.ledgerEntryId ?? row.ledger_entry_id,
      original_amount_cents: row.creator_share_cents,
      adjustment_amount_cents: row.creator_share_cents,
      reason,
      payout_id: row.payout_id,
      spei_clawback_reference: input.speiClawbackReference ?? null,
      created_at: now,
    },
  });

  return { ok: true, adjustmentId };
}
