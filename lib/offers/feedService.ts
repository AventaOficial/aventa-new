import { createServerClient } from '@/lib/supabase/server';
import { homeFeedCategoryInList, homeFeedCreatedAtIsoMin } from '@/lib/offers/homeFeedFilters';

export type FeedOfferAuthor = {
  display_name: string;
  avatar_url: string | null;
  leader_badge: string | null;
  ml_tracking_tag: string | null;
  slug: string | null;
};

export type FeedOffer = {
  id: string;
  title: string;
  price: number;
  original_price: number | null;
  created_at: string;
  score: number;
  up_votes: number;
  down_votes: number;
  ranking_blend: number | null;
  ranking_momentum: number | null;
  images: string[];
  bank_coupon: string | null;
  store: string | null;
  category: string | null;
  slug: string;
  created_by: string | null;
  author: FeedOfferAuthor;
};

type GetHomeFeedParams = {
  limit?: number;
  cursor?: string | null;
  type?: 'trending' | 'recent';
  /** Con `view`, el feed replica filtros del home (periodo, categoría, tienda). */
  view?: 'vitales' | 'top' | 'latest' | null;
  period?: 'day' | 'week' | 'month';
  category?: string | null;
  store?: string | null;
};

type GetHomeFeedSuccess = {
  success: true;
  data: FeedOffer[];
  nextCursor: string | null;
};

type GetHomeFeedError = {
  success: false;
  error: string;
};

export async function getHomeFeed({
  limit = 20,
  cursor = null,
  type = 'trending',
  view = null,
  period = 'day',
  category = null,
  store = null,
}: GetHomeFeedParams = {}): Promise<GetHomeFeedSuccess | GetHomeFeedError> {
  try {
    const supabase = createServerClient();
    const nowISO = new Date().toISOString();

    let query = supabase
      .from('ofertas_ranked_general')
      .select(
        'id, title, price, original_price, created_at, score, up_votes, down_votes, ranking_blend, ranking_momentum, image_url, image_urls, bank_coupon, store, category, created_by, profiles:public_profiles_view!created_by(display_name, avatar_url, leader_badge, ml_tracking_tag, slug)'
      )
      .not('created_at', 'is', null)
      .or('status.eq.approved,status.eq.published')
      .or(`expires_at.is.null,expires_at.gte.${nowISO}`);

    const useHomePipeline = view != null;

    if (useHomePipeline) {
      const floor = homeFeedCreatedAtIsoMin(period);
      query = query.gte('created_at', floor);
      if (store?.trim()) {
        query = query.eq('store', store.trim());
      }
      const catIn = homeFeedCategoryInList(view, category);
      if (catIn != null && catIn.length > 0) {
        query = query.in('category', catIn);
      }
      if (view === 'latest') {
        query = query.order('created_at', { ascending: false });
        if (cursor) {
          const cursorDate = new Date(cursor).toISOString();
          query = query.lt('created_at', cursorDate);
        }
      } else if (view === 'top') {
        query = query.gte('up_votes', 1).order('score_final', { ascending: false });
      } else {
        query = query.order('ranking_blend', { ascending: false });
      }
    } else {
      if (type === 'trending') {
        query = query.order('ranking_blend', { ascending: false });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      if (cursor && type === 'recent') {
        const cursorDate = new Date(cursor).toISOString();
        query = query.lt('created_at', cursorDate);
      }
    }

    const safeLimit = Math.min(Math.max(1, limit), 100);
    const { data, error } = await query.limit(safeLimit + 1);

    if (error) {
      console.error('[FEED API ERROR]', error);
      return { success: false, error: error.message };
    }

    const rows = data ?? [];
    const hasMore = rows.length > safeLimit;
    const slice = hasMore ? rows.slice(0, safeLimit) : rows;

    const offers: FeedOffer[] = slice.map((row: Record<string, unknown>) => {
      const imageUrl = row.image_url as string | null | undefined;
      const imageUrls = Array.isArray(row.image_urls) ? (row.image_urls as string[]) : [];
      const images = [imageUrl, ...imageUrls].filter((u): u is string => typeof u === 'string' && u.length > 0);
      const rawProf = row.profiles as
        | {
            display_name?: string | null;
            avatar_url?: string | null;
            leader_badge?: string | null;
            ml_tracking_tag?: string | null;
            slug?: string | null;
          }
        | {
            display_name?: string | null;
            avatar_url?: string | null;
            leader_badge?: string | null;
            ml_tracking_tag?: string | null;
            slug?: string | null;
          }[]
        | null
        | undefined;
      const prof = Array.isArray(rawProf) ? rawProf[0] : rawProf;
      const createdBy =
        row.created_by != null && String(row.created_by).trim() !== '' ? String(row.created_by) : null;

      return {
        id: String(row.id ?? ''),
        title: String(row.title ?? ''),
        price: Number(row.price ?? 0),
        original_price: row.original_price != null ? Number(row.original_price) : null,
        created_at: row.created_at != null ? new Date(row.created_at as string).toISOString() : '',
        score: Number(row.score ?? 0),
        up_votes: Number(row.up_votes ?? 0),
        down_votes: Number(row.down_votes ?? 0),
        ranking_blend: row.ranking_blend != null ? Number(row.ranking_blend) : null,
        ranking_momentum: row.ranking_momentum != null ? Number(row.ranking_momentum) : null,
        images,
        bank_coupon: row.bank_coupon != null ? String(row.bank_coupon) : null,
        store: row.store != null ? String(row.store) : null,
        category: row.category != null ? String(row.category) : null,
        slug: String(row.id ?? ''),
        created_by: createdBy,
        author: {
          display_name: prof?.display_name?.trim() || 'Usuario',
          avatar_url: prof?.avatar_url ?? null,
          leader_badge: prof?.leader_badge ?? null,
          ml_tracking_tag: prof?.ml_tracking_tag ?? null,
          slug: prof?.slug != null && String(prof.slug).trim() !== '' ? String(prof.slug).trim() : null,
        },
      };
    });

    const nextCursor = hasMore && slice.length > 0
      ? (slice[slice.length - 1] as Record<string, unknown>).created_at as string
      : null;

    return {
      success: true,
      data: offers,
      nextCursor,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[FEED API ERROR]', err);
    return { success: false, error: message };
  }
}
