/**
 * Quién retiene la identidad de un producto en `offer_batch_items`, y si ese registro sigue vivo.
 *
 * El índice offer_batch_items_open_identity_uidx cuenta APPROVED como abierto, pero APPROVED solo
 * significa "creó una oferta". La oferta manda: si moderación la rechazó o se borró, el ítem ya no
 * retiene nada (el contrato del lote: "un rechazo o una publicación permiten reintentar").
 * check_offer_exists y createOfferBatch usan esta misma clasificación.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { OPEN_ACQUISITION_ITEM_STATUSES } from '@/lib/offers/batch/contract';

/** Mismos estados que idx_offers_active_ingestion_identity: una sola oferta activa por identidad. */
export const ACTIVE_OFFER_STATUSES = ['pending', 'approved', 'published'] as const;

export type IdentityHolderState = 'in_review' | 'published' | 'stale';

export type IdentityHolderRow = { id: string; status: string; offer_id: string | null };
export type HolderOfferRow = { id: string; status: string | null; deleted_at: string | null };

export function isActiveOffer(offer: Pick<HolderOfferRow, 'status' | 'deleted_at'>): boolean {
  return !offer.deleted_at && (ACTIVE_OFFER_STATUSES as readonly string[]).includes(offer.status ?? '');
}

export function classifyIdentityHolder(item: IdentityHolderRow, offer: HolderOfferRow | null): IdentityHolderState {
  if (item.status !== 'APPROVED') return 'in_review';
  // Sin oferta legible no se libera nada: preferimos un falso "en revisión" a un duplicado.
  if (!offer) return 'in_review';
  if (!isActiveOffer(offer)) return 'stale';
  return offer.status === 'pending' ? 'in_review' : 'published';
}

export type ClassifiedHolder = { item: IdentityHolderRow; state: IdentityHolderState };

/** Lectura acotada por el índice único: a lo sumo un ítem abierto por identidad. */
export async function findIdentityHolders(
  supabase: SupabaseClient,
  identityKey: string,
): Promise<{ ok: true; holders: ClassifiedHolder[] } | { ok: false }> {
  const { data: items, error } = await supabase
    .from('offer_batch_items')
    .select('id, status, offer_id')
    .eq('identity_key', identityKey)
    .in('status', [...OPEN_ACQUISITION_ITEM_STATUSES])
    .limit(5);
  if (error) return { ok: false };
  const rows = (items ?? []) as IdentityHolderRow[];
  const offerIds = rows.map((r) => r.offer_id).filter((id): id is string => Boolean(id));
  const offers = new Map<string, HolderOfferRow>();
  if (offerIds.length > 0) {
    const { data, error: offersError } = await supabase.from('offers').select('id, status, deleted_at').in('id', offerIds);
    if (offersError) return { ok: false };
    for (const o of (data ?? []) as HolderOfferRow[]) offers.set(o.id, o);
  }
  return {
    ok: true,
    holders: rows.map((item) => ({ item, state: classifyIdentityHolder(item, item.offer_id ? offers.get(item.offer_id) ?? null : null) })),
  };
}

/**
 * Libera un ítem APPROVED cuya oferta ya no está activa. Condicional sobre el estado: si otro
 * proceso ya lo liberó o lo cambió, no toca nada. La unicidad la sigue garantizando el índice.
 */
export async function releaseStaleHolder(supabase: SupabaseClient, itemId: string, now: Date = new Date()): Promise<boolean> {
  const at = now.toISOString();
  const { error } = await supabase
    .from('offer_batch_items')
    .update({ status: 'REJECTED', rejection_reason: 'offer_no_longer_active', rejected_at: at, updated_at: at })
    .eq('id', itemId)
    .eq('status', 'APPROVED');
  return !error;
}
