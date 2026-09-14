import type { SupabaseClient } from '@supabase/supabase-js';
import type { ModerationOutcomeOfferSnapshot } from './contract';

const OUTCOME_OFFER_SELECT =
  'id, created_at, image_url, price, original_price, offer_url, link_mod_ok, moderator_comment, description, bot_meta, created_by';

/**
 * Carga snapshot mínimo para outcomes. Fail-soft → null.
 */
export async function loadOfferSnapshotForOutcome(
  supabase: SupabaseClient,
  offerId: string,
  extras?: { is_bot?: boolean | null; is_duplicate?: boolean | null },
): Promise<ModerationOutcomeOfferSnapshot | null> {
  try {
    const { data, error } = await supabase
      .from('offers')
      .select(OUTCOME_OFFER_SELECT)
      .eq('id', offerId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as Record<string, unknown>;
    return {
      id: String(row.id),
      created_at: (row.created_at as string | null) ?? null,
      image_url: (row.image_url as string | null) ?? null,
      price: typeof row.price === 'number' ? row.price : row.price != null ? Number(row.price) : null,
      original_price:
        typeof row.original_price === 'number'
          ? row.original_price
          : row.original_price != null
            ? Number(row.original_price)
            : null,
      offer_url: (row.offer_url as string | null) ?? null,
      link_mod_ok: (row.link_mod_ok as boolean | null) ?? null,
      is_bot: extras?.is_bot ?? null,
      moderator_comment: (row.moderator_comment as string | null) ?? null,
      description: (row.description as string | null) ?? null,
      bot_meta: row.bot_meta,
      is_duplicate: extras?.is_duplicate ?? null,
    };
  } catch {
    return null;
  }
}
