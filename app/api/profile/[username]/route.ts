import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

type OfferRow = {
  id: string;
  title: string;
  price: number;
  original_price: number;
  image_url: string | null;
  store: string | null;
  offer_url: string | null;
  description: string | null;
  created_at?: string | null;
  upvotes_count?: number | null;
  downvotes_count?: number | null;
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const username = (await params).username?.trim();
  if (!username) {
    return NextResponse.json({ error: 'Username required' }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data: profile, error: profileError } = await supabase
    .rpc('get_profile_by_slug', { slug: username })
    .maybeSingle();

  if (profileError) {
    console.error('[profile] get_profile_by_slug:', profileError.message);
    return NextResponse.json({ error: 'Error loading profile' }, { status: 500 });
  }

  if (!profile) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
  }

  const displayName = (profile as { display_name?: string | null }).display_name?.trim() || 'Usuario';

  const nowISO = new Date().toISOString();
  const profileId = (profile as { id: string }).id;
  const { data: rows, error: offersError } = await supabase
    .from('offers')
    .select(
      'id, title, price, original_price, image_url, store, offer_url, description, created_at, upvotes_count, downvotes_count'
    )
    .eq('created_by', profileId)
    .is('deleted_at', null)
    .or('status.eq.approved,status.eq.published')
    .or(`expires_at.is.null,expires_at.gte.${nowISO}`)
    .order('created_at', { ascending: false });

  if (offersError) {
    console.error('[profile] offers fetch:', offersError.message);
    return NextResponse.json({ error: 'Error loading offers' }, { status: 500 });
  }

  const author = { username: displayName, avatar_url: (profile as { avatar_url?: string | null }).avatar_url ?? null };
  let totalScore = 0;
  const offers = (rows ?? []).map((row: OfferRow) => {
    const up = row.upvotes_count ?? 0;
    const down = row.downvotes_count ?? 0;
    const score = up - down;
    totalScore += score;
    const originalPrice = Number(row.original_price) || 0;
    const discountPrice = Number(row.price) || 0;
    const discount =
      originalPrice > 0 ? Math.round((1 - discountPrice / originalPrice) * 100) : 0;
    return {
      id: row.id,
      title: row.title,
      brand: row.store ?? '',
      originalPrice,
      discountPrice,
      discount,
      upvotes: up,
      downvotes: down,
      offerUrl: row.offer_url?.trim() ?? '',
      image: row.image_url ? row.image_url : undefined,
      description: row.description?.trim() || undefined,
      votes: { up, down, score },
      author,
    };
  });

  return NextResponse.json({
    profile: { username: displayName, avatar_url: (profile as { avatar_url?: string | null }).avatar_url ?? null },
    offersCount: offers.length,
    totalScore,
    offers,
  });
}
