import { createServerClient } from '@/lib/supabase/server';

export type FeedOffer = {
  id: string;
  title: string;
  price: number;
  original_price: number | null;
  created_at: string;
  score: number;
  images: string[];
  store: string | null;
  category: string | null;
  slug: string;
};

type GetHomeFeedParams = {
  limit?: number;
  cursor?: string | null;
  type?: 'trending' | 'recent';
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
}: GetHomeFeedParams = {}): Promise<GetHomeFeedSuccess | GetHomeFeedError> {
  try {
    const supabase = createServerClient();
    const nowISO = new Date().toISOString();

    let query = supabase
      .from('ofertas_ranked_general')
      .select('id, title, price, original_price, created_at, score, image_url, image_urls, store, category')
      .not('created_at', 'is', null)
      .or('status.eq.approved,status.eq.published')
      .or(`expires_at.is.null,expires_at.gte.${nowISO}`);

    if (type === 'trending') {
      query = query.order('score', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    if (cursor && type === 'recent') {
      const cursorDate = new Date(cursor).toISOString();
      query = query.lt('created_at', cursorDate);
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

      return {
        id: String(row.id ?? ''),
        title: String(row.title ?? ''),
        price: Number(row.price ?? 0),
        original_price: row.original_price != null ? Number(row.original_price) : null,
        created_at: row.created_at != null ? new Date(row.created_at as string).toISOString() : '',
        score: Number(row.score ?? 0),
        images,
        store: row.store != null ? String(row.store) : null,
        category: row.category != null ? String(row.category) : null,
        slug: String(row.id ?? ''),
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
