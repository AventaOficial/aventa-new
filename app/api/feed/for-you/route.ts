import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

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

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get('limit')) || DEFAULT_LIMIT, 24);
  const storeFilter = searchParams.get('store')?.trim() || null;
  const categoryFilter = searchParams.get('category')?.trim() || null;

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

  let userCategories = new Set<string>();
  let userStores = new Set<string>();

  if (affinityOfferIds.length > 0) {
    const { data: affinityOffers } = await supabase
      .from('offers')
      .select('category, store')
      .in('id', affinityOfferIds.slice(0, 50));
    for (const o of (affinityOffers ?? []) as { category: string | null; store: string | null }[]) {
      if (o.category) userCategories.add(o.category);
      if (o.store) userStores.add(o.store);
    }
  }

  // 2) Traer ofertas del feed (período reciente), orden por ranking_blend
  let query = supabase
    .from('ofertas_ranked_general')
    .select('id, title, price, original_price, image_url, image_urls, msi_months, store, offer_url, description, steps, conditions, coupons, created_at, created_by, up_votes, down_votes, score, score_final, ranking_momentum, ranking_blend, category, profiles:public_profiles_view!created_by(display_name, avatar_url, leader_badge, ml_tracking_tag)')
    .or('status.eq.approved,status.eq.published')
    .or(`expires_at.is.null,expires_at.gte.${nowISO}`)
    .gte('created_at', weekAgo)
    .order('ranking_blend', { ascending: false })
    .limit(FETCH_LIMIT);

  if (storeFilter) query = query.eq('store', storeFilter);
  if (categoryFilter) query = query.eq('category', categoryFilter);

  const { data: rows, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = (rows ?? []) as OfferRow[];

  // 3) Priorizar: misma categoría o tienda que sus favoritos/votos primero, luego ranking_blend
  const hasAffinity = userCategories.size > 0 || userStores.size > 0;
  const sorted = hasAffinity
    ? [...list].sort((a, b) => {
        const aMatch = (a.category && userCategories.has(a.category)) || (a.store && userStores.has(a.store));
        const bMatch = (b.category && userCategories.has(b.category)) || (b.store && userStores.has(b.store));
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
