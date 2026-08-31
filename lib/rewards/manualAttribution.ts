import type { SupabaseClient } from '@supabase/supabase-js';
import { writeRewardAuditLog } from '@/lib/rewards/audit';
import { createRewardFromLedgerEntry } from '@/lib/rewards/rewardsEngine';
import type { AffiliateNetworkId } from '@/lib/rewards/adapters/types';

export type ManualAttributionResult =
  | { ok: true; rewardId: string }
  | { ok: false; error: string; status: number };

async function verifyOfferOwner(
  supabase: SupabaseClient,
  offerId: string,
): Promise<{ offerId: string; creatorId: string } | null> {
  const { data, error } = await supabase
    .from('offers')
    .select('id, created_by, status')
    .eq('id', offerId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { id: string; created_by?: string; status?: string };
  if (!row.created_by) return null;
  if (row.status !== 'approved' && row.status !== 'published') return null;
  return { offerId: row.id, creatorId: row.created_by };
}

/**
 * Atribución manual staff: offer_id obligatorio; creator_id se deriva de offers.created_by.
 * Nunca confía en creator_id del cliente.
 */
export async function assignManualLedgerAttribution(
  supabase: SupabaseClient,
  input: {
    ledgerEntryId: string;
    offerId: string;
    actorId: string;
    reason?: string | null;
  },
): Promise<ManualAttributionResult> {
  const reason = input.reason?.trim() || 'manual_staff_attribution';
  const now = new Date().toISOString();

  const { data: ledger, error: ledgerErr } = await supabase
    .from('affiliate_ledger_entries')
    .select(
      'id, network, amount_cents, status, external_ref, notes, meta, created_at, tracking_tag, offer_id, creator_id',
    )
    .eq('id', input.ledgerEntryId)
    .maybeSingle();

  if (ledgerErr || !ledger) {
    return { ok: false, error: 'Comisión no encontrada', status: 404 };
  }

  const row = ledger as {
    id: string;
    network: AffiliateNetworkId;
    amount_cents: number;
    status: string;
    external_ref?: string | null;
    notes?: string | null;
    meta?: Record<string, unknown> | null;
    created_at?: string | null;
    tracking_tag?: string | null;
  };

  if (row.status === 'void' || row.status === 'reversed') {
    return { ok: false, error: 'No se puede atribuir una comisión void/reversed', status: 400 };
  }

  const { data: existingReward } = await supabase
    .from('creator_rewards')
    .select('id')
    .eq('ledger_entry_id', row.id)
    .maybeSingle();
  if (existingReward?.id) {
    return { ok: false, error: 'Ya existe una recompensa para esta comisión', status: 409 };
  }

  const verified = await verifyOfferOwner(supabase, input.offerId);
  if (!verified) {
    return { ok: false, error: 'Oferta inválida o no aprobada', status: 400 };
  }

  const prevMeta =
    row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta)
      ? (row.meta as Record<string, unknown>)
      : {};

  await supabase
    .from('affiliate_ledger_entries')
    .update({
      offer_id: verified.offerId,
      creator_id: verified.creatorId,
      attribution_method: 'manual',
      attribution_confidence: 'high',
      attributable: true,
      meta: {
        ...prevMeta,
        manual_attribution: {
          operator_id: input.actorId,
          attributed_at: now,
          reason,
          offer_id: verified.offerId,
          creator_id: verified.creatorId,
        },
      },
    })
    .eq('id', row.id);

  await writeRewardAuditLog(supabase, {
    eventType: 'manual_attribution_assigned',
    actorId: input.actorId,
    entityType: 'affiliate_ledger_entry',
    entityId: row.id,
    previousState: null,
    newState: 'manual',
    metadata: {
      offer_id: verified.offerId,
      creator_id: verified.creatorId,
      reason,
      attributed_at: now,
    },
  });

  const result = await createRewardFromLedgerEntry(
    supabase,
    {
      id: row.id,
      network: row.network,
      amount_cents: Number(row.amount_cents),
      status: row.status,
      external_ref: row.external_ref,
      notes: row.notes,
      meta: {
        ...prevMeta,
        manual_attribution: {
          operator_id: input.actorId,
          attributed_at: now,
          reason,
        },
      },
      created_at: row.created_at,
      offer_id: verified.offerId,
      sub_id_raw: null,
      product_hint: row.external_ref,
    },
    { manualStaffConfirmed: true, actorId: input.actorId },
  );

  if (!result.created) {
    return { ok: false, error: result.reason, status: 400 };
  }

  return { ok: true, rewardId: result.rewardId };
}
