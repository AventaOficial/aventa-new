import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Borra ofertas y filas dependientes (orden seguro para FKs típicas en AVENTA).
 * Pensado para ofertas en moderación / pruebas; no envía emails.
 */
export async function deleteOffersByIdsCascade(
  supabase: SupabaseClient,
  offerIds: string[]
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (offerIds.length === 0) return { ok: true };

  const { data: commentRows, error: commentSelectErr } = await supabase
    .from('comments')
    .select('id')
    .in('offer_id', offerIds);
  if (commentSelectErr) {
    return { ok: false, message: commentSelectErr.message };
  }
  const commentIds = ((commentRows ?? []) as { id: string }[]).map((r) => r.id);
  if (commentIds.length > 0) {
    const { error: clErr } = await supabase.from('comment_likes').delete().in('comment_id', commentIds);
    if (clErr) return { ok: false, message: clErr.message };
  }

  const tablesOfferId: { table: string }[] = [
    { table: 'comments' },
    { table: 'offer_votes' },
    { table: 'offer_favorites' },
    { table: 'offer_events' },
    { table: 'offer_reports' },
    { table: 'moderation_logs' },
  ];

  for (const { table } of tablesOfferId) {
    const { error } = await supabase.from(table).delete().in('offer_id', offerIds);
    if (error && !error.message.includes('does not exist')) {
      return { ok: false, message: `${table}: ${error.message}` };
    }
  }

  const { error: coErr } = await supabase.from('community_offers').delete().in('offer_id', offerIds);
  if (coErr) {
    const ign =
      (coErr as { code?: string }).code === '42P01' ||
      (coErr.message ?? '').toLowerCase().includes('does not exist');
    if (!ign) return { ok: false, message: `community_offers: ${coErr.message}` };
  }

  const { error: delOffersErr } = await supabase.from('offers').delete().in('id', offerIds);
  if (delOffersErr) {
    return { ok: false, message: delOffersErr.message };
  }

  return { ok: true };
}
