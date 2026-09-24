import { createServerClient } from '@/lib/supabase/server';
import { buildOfferSearchOrFilter } from '@/lib/offers/inferOfferTags';
import { sanitizeSearchQuery } from '@/lib/offers/searchQuery';

export type PublicSearchHit = {
  id: string;
  title: string;
  price: number;
  original_price: number | null;
  image_url: string | null;
  image_urls: string[] | null;
  msi_months: number | null;
  bank_coupon: string | null;
  store: string | null;
  offer_url: string | null;
  description: string | null;
  hunter_comment: string | null;
  steps: string | null;
  conditions: string | null;
  coupons: string | null;
  created_at: string | null;
  created_by: string | null;
  up_votes: number;
  down_votes: number;
  score: number;
  ranking_momentum: number;
  rank?: number;
};

const SELECT_COLUMNS =
  'id, title, price, original_price, image_url, image_urls, msi_months, bank_coupon, store, offer_url, description, hunter_comment, steps, conditions, coupons, created_at, created_by';

function asHit(row: Record<string, unknown>, rank?: number): PublicSearchHit {
  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    price: Number(row.price ?? 0),
    original_price: row.original_price != null ? Number(row.original_price) : null,
    image_url: (row.image_url as string | null) ?? null,
    image_urls: Array.isArray(row.image_urls) ? (row.image_urls as string[]) : null,
    msi_months: row.msi_months != null ? Number(row.msi_months) : null,
    bank_coupon: (row.bank_coupon as string | null) ?? null,
    store: (row.store as string | null) ?? null,
    offer_url: (row.offer_url as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    hunter_comment: (row.hunter_comment as string | null) ?? null,
    steps: (row.steps as string | null) ?? null,
    conditions: (row.conditions as string | null) ?? null,
    coupons: (row.coupons as string | null) ?? null,
    created_at: (row.created_at as string | null) ?? null,
    created_by: row.created_by != null ? String(row.created_by) : null,
    up_votes: 0,
    down_votes: 0,
    score: 0,
    ranking_momentum: rank != null ? rank : 0,
    rank,
  };
}

async function searchWithIlike(input: {
  query: string;
  limit: number;
  categories: string[] | null;
  store: string | null;
}): Promise<PublicSearchHit[]> {
  const supabase = createServerClient();
  const nowISO = new Date().toISOString();
  const orFilter = buildOfferSearchOrFilter(input.query);
  if (!orFilter) return [];

  let query = supabase
    .from('offers')
    .select(SELECT_COLUMNS)
    .in('status', ['approved', 'published'])
    .is('deleted_at', null)
    .or(`expires_at.is.null,expires_at.gte.${nowISO}`)
    .or(orFilter)
    .order('created_at', { ascending: false })
    .limit(input.limit);

  if (input.store) query = query.eq('store', input.store);
  if (input.categories && input.categories.length > 0) query = query.in('category', input.categories);

  const { data, error } = await query;
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((row) => asHit(row));
}

export async function searchPublicOffers(input: {
  query: string;
  limit: number;
  categories?: string[] | null;
  store?: string | null;
}): Promise<{ hits: PublicSearchHit[]; engine: 'fts' | 'ilike' | 'empty' }> {
  const query = sanitizeSearchQuery(input.query);
  const limit = Math.min(50, Math.max(1, input.limit));
  if (query.length < 2) return { hits: [], engine: 'empty' };

  const categories = input.categories && input.categories.length > 0 ? input.categories : null;
  const store = input.store?.trim() || null;
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc('search_public_offers', {
    p_query: query,
    p_limit: limit,
    p_offset: 0,
    p_categories: categories,
    p_store: store,
  });

  if (!error && Array.isArray(data) && data.length > 0) {
    return {
      hits: (data as Record<string, unknown>[]).map((row) =>
        asHit(row, typeof row.rank === 'number' ? row.rank : undefined)
      ),
      engine: 'fts',
    };
  }

  const fallback = await searchWithIlike({ query, limit, categories, store });
  return { hits: fallback, engine: fallback.length > 0 ? 'ilike' : 'empty' };
}
