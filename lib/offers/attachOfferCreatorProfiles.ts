import type { SupabaseClient } from '@supabase/supabase-js';

export type OfferCreatorProfile = {
  display_name: string | null;
  avatar_url: string | null;
  leader_badge?: string | null;
  ml_tracking_tag?: string | null;
  amazon_tracking_tag?: string | null;
  slug?: string | null;
};

type RowWithAuthor = { created_by?: string | null };

/**
 * Adjunta `profiles` (vista pública) por `created_by` para filas que no vienen de un join Supabase.
 * La búsqueda RPC/ilike solo devuelve `created_by`; sin esto la card muestra «Usuario lo encontró».
 */
export async function attachOfferCreatorProfiles<T extends RowWithAuthor>(
  supabase: Pick<SupabaseClient, 'from'>,
  rows: readonly T[],
): Promise<Array<T & { profiles: OfferCreatorProfile | null }>> {
  const authorIds = [
    ...new Set(rows.map((r) => r.created_by?.trim()).filter((id): id is string => Boolean(id))),
  ];
  const byId = new Map<string, OfferCreatorProfile>();
  if (authorIds.length > 0) {
    const { data, error } = await supabase
      .from('public_profiles_view')
      .select('id, display_name, avatar_url, leader_badge, ml_tracking_tag, amazon_tracking_tag, slug')
      .in('id', authorIds);
    if (error) {
      console.error('[search] creator profiles unavailable', error.message);
    } else {
      for (const row of (data ?? []) as { id: string } & OfferCreatorProfile[]) {
        byId.set(row.id, {
          display_name: row.display_name,
          avatar_url: row.avatar_url,
          leader_badge: row.leader_badge ?? null,
          ml_tracking_tag: row.ml_tracking_tag ?? null,
          amazon_tracking_tag: row.amazon_tracking_tag ?? null,
          slug: row.slug ?? null,
        });
      }
    }
  }
  return rows.map((row) => ({
    ...row,
    profiles: row.created_by?.trim() ? byId.get(row.created_by.trim()) ?? null : null,
  }));
}
