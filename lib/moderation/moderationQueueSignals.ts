import type { SupabaseClient } from '@supabase/supabase-js';

/** Ofertas con reportes pendientes (offer_reports). */
export async function fetchPendingReportOfferIds(
  supabase: SupabaseClient,
  offerIds: string[]
): Promise<Set<string>> {
  if (offerIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('offer_reports')
    .select('offer_id')
    .eq('status', 'pending')
    .in('offer_id', offerIds);

  if (error) {
    if (error.message.toLowerCase().includes('offer_reports')) return new Set();
    throw new Error(error.message);
  }

  return new Set(
    (data ?? [])
      .map((r) => (r as { offer_id?: string }).offer_id)
      .filter((id): id is string => Boolean(id))
  );
}

/** Creadores con ban activo. */
export async function fetchBannedCreatorIds(
  supabase: SupabaseClient,
  creatorIds: string[]
): Promise<Set<string>> {
  if (creatorIds.length === 0) return new Set();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('user_bans')
    .select('user_id')
    .in('user_id', creatorIds)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`);

  if (error) throw new Error(error.message);

  return new Set(
    (data ?? [])
      .map((r) => (r as { user_id?: string }).user_id)
      .filter((id): id is string => Boolean(id))
  );
}

export async function fetchOfferModerationSignals(
  supabase: SupabaseClient,
  offerId: string,
  createdBy: string | null | undefined
): Promise<{ authorBanned: boolean; hasPendingReport: boolean }> {
  const [reportIds, bannedIds] = await Promise.all([
    fetchPendingReportOfferIds(supabase, [offerId]),
    createdBy
      ? fetchBannedCreatorIds(supabase, [createdBy])
      : Promise.resolve(new Set<string>()),
  ]);

  return {
    authorBanned: Boolean(createdBy && bannedIds.has(createdBy)),
    hasPendingReport: reportIds.has(offerId),
  };
}
