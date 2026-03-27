import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { getValidCategoryValuesForFeed, normalizeCategoryForStorage } from '@/lib/categories';

const DEFAULT_LIMIT = 12;
const FETCH_LIMIT = 60;

type OfferRow = {
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
  steps: string | null;
  conditions: string | null;
  coupons: string | null;
  created_at: string;
  created_by: string | null;
  up_votes: number | null;
  down_votes: number | null;
  score: number | null;
  score_final: number | null;
  ranking_momentum: number | null;
  ranking_blend: number | null;
  category: string | null;
  profiles?: unknown;
};

/**
 * GET: feed "Para ti" — ofertas priorizadas por afinidad (favoritos y votos del usuario).
 * Orden: primero ofertas de la misma categoría o tienda que las que ha guardado/votado, luego por ranking_blend.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const supabase = createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user?.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const rl = await enforceRateLimit(`feed:${user.id}`);
  if (!rl.success) return NextResponse.json({ error: 'Rate limit' }, { status: 429 });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get('limit')) || DEFAULT_LIMIT, 24);
  const storeFilter = searchParams.get('store')?.trim() || null;
  const categoryFilter = searchParams.get('category')?.trim() || null;
  const categoryFilterValues = categoryFilter ? getValidCategoryValuesForFeed(categoryFilter) : [];

  const now = new Date();
  const nowISO = now.toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // 1) Obtener offer_ids de favoritos y votos del usuario
  const [favRes, voteRes] = await Promise.all([
    supabase.from('offer_favorites').select('offer_id').eq('user_id', user.id),
    supabase.from('offer_votes').select('offer_id').eq('user_id', user.id),
  ]);
  const favoriteIds = new Set((favRes.data ?? []).map((r: { offer_id: string }) => r.offer_id));
  const votedIds = new Set((voteRes.data ?? []).map((r: { offer_id: string }) => r.offer_id));
  const affinityOfferIds = [...new Set([...favoriteIds, ...votedIds])];

  const userCategories = new Set<string>();
  const userStores = new Set<string>();

  if (affinityOfferIds.length > 0) {
    const { data: affinityOffers } = await supabase
      .from('offers')
      .select('category, store')
      .in('id', affinityOfferIds.slice(0, 50));
    for (const o of (affinityOffers ?? []) as { category: string | null; store: string | null }[]) {
      const normalized = normalizeCategoryForStorage(o.category);
      if (normalized) userCategories.add(normalized);
      if (o.store) userStores.add(o.store);
    }
  }

  // 2) Traer ofertas del feed. Intentar vista; si falla (ej. vista sin columnas en prod), usar tabla offers.
  let list: OfferRow[] = [];
  let query = supabase
    .from('ofertas_ranked_general')
    .select('id, title, price, original_price, image_url, image_urls, msi_months, bank_coupon, store, offer_url, description, steps, conditions, coupons, created_at, created_by, up_votes, down_votes, score, score_final, ranking_momentum, ranking_blend, category, profiles:public_profiles_view!created_by(display_name, avatar_url, leader_badge, ml_tracking_tag)')
    .or('status.eq.approved,status.eq.published')
    .or(`expires_at.is.null,expires_at.gte.${nowISO}`)
    .gte('created_at', weekAgo)
    .order('ranking_blend', { ascending: false })
    .limit(FETCH_LIMIT);

  if (storeFilter) query = query.eq('store', storeFilter);
  if (categoryFilterValues.length === 1) query = query.eq('category', categoryFilterValues[0]);
  else if (categoryFilterValues.length > 1) query = query.in('category', categoryFilterValues);

  const { data: viewRows, error: viewError } = await query;
  if (!viewError && viewRows?.length !== undefined) {
    list = viewRows as OfferRow[];
  } else {
    let offerQuery = supabase
      .from('offers')
      .select('id, title, price, original_price, image_url, image_urls, msi_months, bank_coupon, store, offer_url, description, steps, conditions, coupons, created_at, created_by, upvotes_count, downvotes_count, ranking_momentum, reputation_weighted_score, category')
      .or('status.eq.approved,status.eq.published')
      .or(`expires_at.is.null,expires_at.gte.${nowISO}`)
      .gte('created_at', weekAgo)
      .order('ranking_momentum', { ascending: false })
      .limit(FETCH_LIMIT);
    if (storeFilter) offerQuery = offerQuery.eq('store', storeFilter);
    if (categoryFilterValues.length === 1) offerQuery = offerQuery.eq('category', categoryFilterValues[0]);
    else if (categoryFilterValues.length > 1) offerQuery = offerQuery.in('category', categoryFilterValues);
    const { data: offerRows, error: offerError } = await offerQuery;
    if (offerError) {
      return NextResponse.json({ error: offerError.message }, { status: 500 });
    }
    const offers = (offerRows ?? []) as Array<Record<string, unknown> & { upvotes_count?: number; downvotes_count?: number; ranking_momentum?: number; reputation_weighted_score?: number }>;
    list = offers.map((o) => {
      const up = o.upvotes_count ?? 0;
      const down = o.downvotes_count ?? 0;
      const score = up * 2 - down;
      const blend = (o.ranking_momentum ?? 0) + (o.reputation_weighted_score ?? 0);
      return {
        ...o,
        up_votes: up,
        down_votes: down,
        score,
        score_final: score,
        ranking_blend: blend,
        profiles: null,
      } as unknown as OfferRow;
    });
  }


  // 3) Priorizar por tienda (y categoría si viene en la fila); luego ranking_blend
  const hasAffinity = userCategories.size > 0 || userStores.size > 0;
  const sorted = hasAffinity
    ? [...list].sort((a, b) => {
        const aCategory = normalizeCategoryForStorage((a as { category?: string | null }).category ?? null);
        const bCategory = normalizeCategoryForStorage((b as { category?: string | null }).category ?? null);
        const aMatch = (aCategory ? userCategories.has(aCategory) : false) || (a.store && userStores.has(a.store));
        const bMatch = (bCategory ? userCategories.has(bCategory) : false) || (b.store && userStores.has(b.store));
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
        const blendA = a.ranking_blend ?? 0;
        const blendB = b.ranking_blend ?? 0;
        return blendB - blendA;
      })
    : list;

  const result = sorted.slice(0, limit);
  return NextResponse.json({ offers: result });
}
