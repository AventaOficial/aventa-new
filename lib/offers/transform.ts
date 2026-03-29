import { normalizeVoteCounts } from '@/lib/offers/scoring';

/** Modelo único para cards/modal en feed, tienda, categoría, favoritos e inicio. */
export type CardOfferAuthor = {
  username: string;
  avatar_url?: string | null;
  leaderBadge?: string | null;
  creatorMlTag?: string | null;
  /** UUID del creador; necesario para el slug público igual que `profiles.slug`. */
  userId?: string | null;
};

export type CardOffer = {
  id: string;
  title: string;
  brand: string;
  originalPrice: number;
  discountPrice: number;
  discount: number;
  description?: string;
  steps?: string;
  conditions?: string;
  coupons?: string;
  upvotes: number;
  downvotes: number;
  offerUrl: string;
  image?: string;
  imageUrls?: string[];
  msiMonths?: number | null;
  bankCoupon?: string | null;
  votes: { up: number; down: number; score: number };
  author: CardOfferAuthor;
  ranking_momentum: number;
  ranking_blend?: number;
  createdAt?: string | null;
};

type ProfilesJoin =
  | { display_name: string | null; avatar_url: string | null; leader_badge?: string | null; ml_tracking_tag?: string | null }
  | { display_name: string | null; avatar_url: string | null; leader_badge?: string | null; ml_tracking_tag?: string | null }[]
  | null
  | undefined;

/** Fila vista ranked, favoritos (offers.*) o similar. */
export type RankedOfferSource = {
  id: string;
  title: string;
  price: number;
  original_price?: number | null;
  store?: string | null;
  offer_url?: string | null;
  description?: string | null;
  image_url?: string | null;
  image_urls?: string[] | null;
  up_votes?: number | null;
  down_votes?: number | null;
  upvotes_count?: number | null;
  downvotes_count?: number | null;
  score?: number | null;
  msi_months?: number | null;
  bank_coupon?: string | null;
  steps?: string | null;
  conditions?: string | null;
  coupons?: string | null;
  created_at?: string | null;
  created_by?: string | null;
  ranking_momentum?: number | null;
  ranking_blend?: number | null;
  profiles?: ProfilesJoin;
};

export type FeedApiItemShape = {
  id: string;
  title: string;
  price: number;
  original_price: number | null;
  created_at: string;
  score: number;
  up_votes?: number;
  down_votes?: number;
  ranking_blend?: number | null;
  ranking_momentum?: number | null;
  images?: string[];
  bank_coupon?: string | null;
  store?: string | null;
  author?: {
    display_name?: string | null;
    avatar_url?: string | null;
    leader_badge?: string | null;
    ml_tracking_tag?: string | null;
  };
  created_by?: string | null;
};

function unwrapProfiles(profiles: ProfilesJoin, createdBy: string | null | undefined): CardOfferAuthor {
  const prof = Array.isArray(profiles) ? profiles[0] : profiles;
  return {
    username: prof?.display_name?.trim() || 'Usuario',
    avatar_url: prof?.avatar_url ?? null,
    leaderBadge: (prof as { leader_badge?: string | null } | undefined)?.leader_badge ?? null,
    creatorMlTag: (prof as { ml_tracking_tag?: string | null } | undefined)?.ml_tracking_tag ?? null,
    userId: createdBy ?? null,
  };
}

/**
 * Score: preferir columna de BD/vista si viene; si no, misma fórmula que la vista (up*2 - down).
 */
export function resolveVotesFromSource(row: RankedOfferSource): { up: number; down: number; score: number } {
  const up = Number(row.up_votes ?? row.upvotes_count ?? 0) || 0;
  const down = Number(row.down_votes ?? row.downvotes_count ?? 0) || 0;
  if (row.ranking_momentum != null && row.ranking_momentum !== ('' as unknown)) {
    const m = Number(row.ranking_momentum);
    if (!Number.isNaN(m)) return { up, down, score: m };
  }
  if (row.score != null && row.score !== ('' as unknown)) {
    const s = Number(row.score);
    if (!Number.isNaN(s)) return { up, down, score: s };
  }
  return normalizeVoteCounts(up, down);
}

function mapRankedToCard(row: RankedOfferSource): CardOffer {
  const originalPrice = Number(row.original_price) || 0;
  const discountPrice = Number(row.price) || 0;
  const discount =
    originalPrice > 0 ? Math.round((1 - discountPrice / originalPrice) * 100) : 0;
  const { up, down, score } = resolveVotesFromSource(row);
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
    imageUrls: Array.isArray(row.image_urls) ? row.image_urls : undefined,
    msiMonths: row.msi_months != null ? Number(row.msi_months) : undefined,
    bankCoupon: row.bank_coupon?.trim() || undefined,
    description: row.description?.trim() || undefined,
    steps: row.steps?.trim() || undefined,
    conditions: row.conditions?.trim() || undefined,
    coupons: row.coupons?.trim() || undefined,
    votes: { up, down, score },
    author: unwrapProfiles(row.profiles, row.created_by ?? null),
    ranking_momentum: Number(row.ranking_momentum) || 0,
    ranking_blend: row.ranking_blend != null ? Number(row.ranking_blend) : undefined,
    createdAt: row.created_at ?? null,
  };
}

function isFeedApiItem(x: RankedOfferSource | FeedApiItemShape): x is FeedApiItemShape {
  return 'images' in x && 'author' in x;
}

function mapFeedApiToCard(item: FeedApiItemShape): CardOffer {
  const originalPrice = item.original_price ?? 0;
  const discountPrice = item.price ?? 0;
  const discount = originalPrice > 0 ? Math.round((1 - discountPrice / originalPrice) * 100) : 0;
  const fromCounts = normalizeVoteCounts(item.up_votes ?? 0, item.down_votes ?? 0);
  const up = fromCounts.up;
  const down = fromCounts.down;
  let score = fromCounts.score;
  if (item.ranking_momentum != null && item.ranking_momentum !== ('' as unknown)) {
    const m = Number(item.ranking_momentum);
    if (!Number.isNaN(m)) score = m;
  } else if (typeof item.score === 'number' && !Number.isNaN(item.score)) {
    score = item.score;
  }
  const images = Array.isArray(item.images) ? item.images : [];
  const image = images[0] ?? null;
  const a = item.author;
  const author: CardOfferAuthor = {
    username: a?.display_name?.trim() || 'Usuario',
    avatar_url: a?.avatar_url ?? null,
    leaderBadge: a?.leader_badge ?? null,
    creatorMlTag: a?.ml_tracking_tag ?? null,
    userId: item.created_by ?? null,
  };
  return {
    id: item.id ?? '',
    title: item.title ?? '',
    brand: item.store ?? '',
    originalPrice,
    discountPrice,
    discount,
    upvotes: up,
    downvotes: down,
    offerUrl: '',
    image: image ?? undefined,
    imageUrls: images.length > 0 ? images : undefined,
    bankCoupon: item.bank_coupon?.trim() || undefined,
    votes: { up, down, score },
    author,
    ranking_momentum: item.ranking_momentum != null ? Number(item.ranking_momentum) : score,
    ranking_blend: item.ranking_blend != null ? Number(item.ranking_blend) : score,
    createdAt: item.created_at ?? null,
  };
}

/** Única entrada para filas Supabase/vista o ítems del API /api/feed/home. */
export function mapOfferToCard(row: RankedOfferSource | FeedApiItemShape): CardOffer {
  if (isFeedApiItem(row)) return mapFeedApiToCard(row);
  return mapRankedToCard(row);
}

