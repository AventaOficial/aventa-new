import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { enforceRateLimit, getClientIp } from '@/lib/server/rateLimit';
import { normalizeVoteCounts } from '@/lib/offers/scoring';
import { parseOfferScopeFromConditions } from '@/lib/offerScope';
import { publicDisplayName } from '@/lib/profile/publicDisplayName';
import { filterPublicCatalogRows } from '@/lib/offers/publicCatalogGate';
import { loadAchievementShowcase } from '@/lib/achievements/showcase';
import { presentPublicProfile, type ProfileIdentityInput } from '@/lib/profile/visibility';

type OfferRow = {
  id: string;
  title: string;
  price: number;
  original_price: number;
  image_url: string | null;
  image_urls: string[] | null;
  store: string | null;
  offer_url: string | null;
  description: string | null;
  hunter_comment?: string | null;
  steps: string | null;
  conditions: string | null;
  msi_months?: number | null;
  bank_coupon?: string | null;
  coupons?: string | null;
  created_at?: string | null;
  expires_at?: string | null;
  upvotes_count?: number | null;
  downvotes_count?: number | null;
  ranking_momentum?: number | null;
};

type ProfileRpcRow = {
  id: string;
  display_name?: string | null;
  avatar_url?: string | null;
};

async function fetchProfileBySlug(
  supabase: ReturnType<typeof createServerClient>,
  username: string
): Promise<{ profile: ProfileRpcRow | null; error: { message: string } | null }> {
  const attempts: Array<Record<string, string>> = [{ p_slug: username }, { slug: username }];
  let lastError: { message: string } | null = null;

  for (const args of attempts) {
    const { data, error } = await supabase.rpc('get_profile_by_slug', args).maybeSingle();
    if (!error) {
      return { profile: (data as ProfileRpcRow | null) ?? null, error: null };
    }

    lastError = { message: error.message };
    const msg = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase();
    const looksLikeArgumentMismatch =
      msg.includes('function') || msg.includes('schema cache') || msg.includes('argument');
    if (!looksLikeArgumentMismatch) break;
  }

  return { profile: null, error: lastError };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const username = (await params).username?.trim();
  if (!username) {
    return NextResponse.json({ error: 'Username required' }, { status: 400 });
  }

  const rl = await enforceRateLimit(`prof:${getClientIp(_request)}`);
  if (!rl.success) return NextResponse.json({ error: 'Rate limit' }, { status: 429 });

  const supabase = createServerClient();
  const { profile, error: profileError } = await fetchProfileBySlug(supabase, username);

  if (profileError) {
    console.error('[profile] get_profile_by_slug:', profileError.message);
    return NextResponse.json({ error: 'Error loading profile' }, { status: 500 });
  }

  if (!profile) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
  }

  const displayName = publicDisplayName(
    (profile as { display_name?: string | null }).display_name,
    'Usuario',
  );

  const profileId = (profile as { id: string }).id;

  let identity: ProfileIdentityInput = {};
  const { data: identityRow, error: identityError } = await supabase
    .from('profiles')
    .select('bio, city, state, cover_url, show_location, show_activity, profile_visibility')
    .eq('id', profileId)
    .maybeSingle();
  if (!identityError && identityRow) {
    const row = identityRow as {
      bio?: string | null;
      city?: string | null;
      state?: string | null;
      cover_url?: string | null;
      show_location?: boolean | null;
      show_activity?: boolean | null;
      profile_visibility?: string | null;
    };
    identity = {
      bio: row.bio,
      city: row.city,
      state: row.state,
      coverUrl: row.cover_url,
      showLocation: row.show_location,
      showActivity: row.show_activity,
      profileVisibility: row.profile_visibility,
    };
  }
  const publicIdentity = presentPublicProfile(identity);

  let reputation_level = 1;
  let reputation_score = 0;
  try {
    const { data: rep } = await supabase
      .from('profiles')
      .select('reputation_level, reputation_score')
      .eq('id', profileId)
      .maybeSingle();
    if (rep) {
      reputation_level = Math.max(1, (rep as { reputation_level?: number }).reputation_level ?? 1);
      reputation_score = Math.max(0, (rep as { reputation_score?: number }).reputation_score ?? 0);
    }
  } catch {
    // columnas pueden no existir aún
  }

  const offerResult = publicIdentity.showActivity
    ? await supabase
        .from('offers')
        .select(
          'id, title, price, original_price, image_url, image_urls, store, offer_url, description, hunter_comment, steps, conditions, msi_months, bank_coupon, coupons, created_at, expires_at, upvotes_count, downvotes_count, ranking_momentum'
        )
        .eq('created_by', profileId)
        .is('deleted_at', null)
        .or('status.eq.approved,status.eq.published')
        .order('created_at', { ascending: false })
    : { data: [], error: null };
  const { data: rows, error: offersError } = offerResult;

  if (offersError) {
    console.error('[profile] offers fetch:', offersError.message);
    return NextResponse.json({ error: 'Error loading offers' }, { status: 500 });
  }

  const author = {
    username: displayName,
    avatar_url: (profile as { avatar_url?: string | null }).avatar_url ?? null,
    userId: profileId,
  };
  let totalScore = 0;
  let activeCount = 0;
  let expiredCount = 0;
  const nowMs = Date.now();

  const publicRows = filterPublicCatalogRows(
    (rows ?? []).map((row: OfferRow) => ({ ...row, status: 'approved' as const })),
  );

  const offers = publicRows.map((row: OfferRow) => {
    const { up, down, score: fallbackScore } = normalizeVoteCounts(row.upvotes_count, row.downvotes_count);
    const score =
      row.ranking_momentum != null && !Number.isNaN(Number(row.ranking_momentum))
        ? Number(row.ranking_momentum)
        : fallbackScore;
    totalScore += score;
    const originalPrice = Number(row.original_price) || 0;
    const discountPrice = Number(row.price) || 0;
    const discount =
      originalPrice > 0 ? Math.round((1 - discountPrice / originalPrice) * 100) : 0;
    const msiRaw = row.msi_months;
    const msiMonths =
      msiRaw != null && msiRaw !== ('' as unknown)
        ? Number(msiRaw)
        : undefined;
    const msiOk =
      msiMonths != null && Number.isFinite(msiMonths) && msiMonths >= 1 ? msiMonths : undefined;
    const imageUrls = Array.isArray(row.image_urls) ? row.image_urls : undefined;
    const expired =
      Boolean(row.expires_at) && new Date(row.expires_at as string).getTime() < nowMs;
    const dealStatus: 'approved' | 'expired' = expired ? 'expired' : 'approved';
    if (expired) expiredCount += 1;
    else activeCount += 1;

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
      imageUrls,
      description: row.description?.trim() || undefined,
      hunterComment: row.hunter_comment?.trim() || undefined,
      steps: row.steps?.trim() || undefined,
      conditions: row.conditions?.trim() || undefined,
      offerScope: parseOfferScopeFromConditions(row.conditions),
      createdAt: row.created_at ?? null,
      expiresAt: row.expires_at ?? null,
      dealStatus,
      msiMonths: msiOk,
      bankCoupon: row.bank_coupon?.trim() || undefined,
      coupons: row.coupons?.trim() || undefined,
      votes: { up, down, score },
      author,
    };
  });

  const showcase = publicIdentity.showActivity ? await loadAchievementShowcase(supabase, profileId) : [];

  return NextResponse.json({
    profile: {
      username: displayName,
      avatar_url: (profile as { avatar_url?: string | null }).avatar_url ?? null,
      reputation_level,
      reputation_score,
      bio: publicIdentity.bio,
      location: publicIdentity.location,
      cover_url: publicIdentity.coverUrl,
      is_private: publicIdentity.isPrivate,
      activity_visible: publicIdentity.showActivity,
    },
    offersCount: offers.length,
    activeCount,
    expiredCount,
    totalScore,
    offers,
    featuredAchievements: showcase,
  });
}
