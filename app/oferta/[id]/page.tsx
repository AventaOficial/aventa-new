import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createServerClient } from '@/lib/supabase/server';
import { ALL_CATEGORIES, normalizeCategoryForStorage } from '@/lib/categories';
import { slugifyStore } from '@/lib/slug';
import { extractOfferIdFromPathSegment, buildOfferPublicPath } from '@/lib/offerPath';
import { parseOfferScopeFromConditions } from '@/lib/offerScope';
import { formatStoreDisplayName } from '@/lib/formatStoreDisplay';
import { BOT_AUTHOR_DISPLAY_NAME, isBotUserId } from '@/lib/bots/ingest/isBotUserId';
import { isOfferExpiredByExpiresAt } from '@/lib/votes/offerVoteEligibility';
import { presentOfferFreshness } from '@/lib/offers/freshness/present';
import OfferPageContent from './OfferPageContent';
import { stringifyJsonLd } from '@/lib/seo/jsonLd';

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL || 'https://aventaofertas.com';

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
  created_at: string | null;
  created_by: string | null;
  expires_at: string | null;
  deleted_at: string | null;
  upvotes_count: number | null;
  downvotes_count: number | null;
  ranking_momentum: number | null;
  category: string | null;
  profiles?:
    | {
        display_name: string | null;
        avatar_url: string | null;
        leader_badge?: string | null;
        ml_tracking_tag?: string | null;
        amazon_tracking_tag?: string | null;
        slug?: string | null;
      }
    | {
        display_name: string | null;
        avatar_url: string | null;
        leader_badge?: string | null;
        ml_tracking_tag?: string | null;
        amazon_tracking_tag?: string | null;
        slug?: string | null;
      }[];
};

function categorySlugToLabel(slug: string): string {
  const c = ALL_CATEGORIES.find((x) => x.value === slug);
  return c?.label ?? slug;
}

async function getOffer(id: string) {
  const supabase = createServerClient();

  // Lifecycle (expires_at) ≠ accessibility: approved expired offers remain consultable.
  const { data, error } = await supabase
    .from('offers')
    .select(`
      id, title, price, original_price, image_url, image_urls, msi_months, bank_coupon,
      store, offer_url, description, steps, conditions, coupons, expires_at, deleted_at,
      created_at, created_by, upvotes_count, downvotes_count, ranking_momentum, category,
      profiles!created_by(display_name, avatar_url, leader_badge, ml_tracking_tag, amazon_tracking_tag, slug)
    `)
    .eq('id', id)
    .eq('status', 'approved')
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as OfferRow;
}

async function loadOfferHealth(id: string): Promise<{ status: string; last_checked_at: string | null } | null> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('offer_health_state')
      .select('status, last_checked_at')
      .eq('offer_id', id)
      .maybeSingle();
    if (error || !data) return null;
    return data as { status: string; last_checked_at: string | null };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id: rawSegment } = await params;
  const id = extractOfferIdFromPathSegment(rawSegment);
  if (!id) return { title: 'Oferta no encontrada | AVENTA' };
  const offer = await getOffer(id);
  if (!offer) return { title: 'Oferta no encontrada | AVENTA', robots: { index: false, follow: false } };
  if (offer.deleted_at) return { title: 'Oferta no encontrada | AVENTA', robots: { index: false, follow: false } };

  const health = await loadOfferHealth(id);
  const freshness = presentOfferFreshness({
    expiresAt: offer.expires_at,
    deletedAt: offer.deleted_at,
    healthStatus: health?.status ?? null,
    lastCheckedAt: health?.last_checked_at ?? null,
  });

  const title = `${offer.title} | AVENTA`;
  const store = formatStoreDisplayName(offer.store) || 'Tienda';
  const desc =
    offer.description?.trim()?.slice(0, 155) ||
    `Oferta en ${store}. ${offer.original_price ? `Precio ${offer.price}` : ''}`;

  const canonical = `${BASE_URL}${buildOfferPublicPath(id, offer.title)}`;
  const ogGenerated = `${BASE_URL}${buildOfferPublicPath(id, offer.title)}/opengraph-image`;

  return {
    title,
    description: desc,
    alternates: { canonical },
    robots: freshness.indexable
      ? { index: true, follow: true }
      : { index: false, follow: true },
    openGraph: {
      title,
      description: desc,
      url: canonical,
      siteName: 'AVENTA',
      type: 'website',
      images: [{ url: ogGenerated, width: 1200, height: 630, alt: offer.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: desc,
      images: [ogGenerated],
    },
  };
}

export default async function OfertaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawSegment } = await params;
  const id = extractOfferIdFromPathSegment(rawSegment);
  if (!id) notFound();
  const offer = await getOffer(id);
  if (!offer || offer.deleted_at) notFound();
  const health = await loadOfferHealth(id);
  const freshness = presentOfferFreshness({
    expiresAt: offer.expires_at,
    deletedAt: offer.deleted_at,
    healthStatus: health?.status ?? null,
    lastCheckedAt: health?.last_checked_at ?? null,
  });

  const canonicalPath = buildOfferPublicPath(id, offer.title);
  if (rawSegment !== canonicalPath.replace(/^\/oferta\//, '')) {
    redirect(canonicalPath);
  }

  const prof = Array.isArray(offer.profiles) ? offer.profiles[0] : offer.profiles;
  const botAuthor = isBotUserId(offer.created_by);
  const author = {
    username: botAuthor
      ? BOT_AUTHOR_DISPLAY_NAME
      : prof?.display_name?.trim() || 'Usuario',
    avatar_url: botAuthor ? null : (prof?.avatar_url ?? null),
    leaderBadge: botAuthor
      ? null
      : ((prof as { leader_badge?: string | null })?.leader_badge ?? null),
    creatorMlTag: (prof as { ml_tracking_tag?: string | null })?.ml_tracking_tag ?? null,
    creatorAmazonTag: (prof as { amazon_tracking_tag?: string | null })?.amazon_tracking_tag ?? null,
    userId: offer.created_by,
    slug: botAuthor ? null : ((prof as { slug?: string | null })?.slug?.trim() || null),
    isBot: botAuthor,
  };

  const originalPrice = Number(offer.original_price) || 0;
  const discountPrice = Number(offer.price) || 0;
  const discount =
    originalPrice > 0 ? Math.round((1 - discountPrice / originalPrice) * 100) : 0;
  const up = offer.upvotes_count ?? 0;
  const down = offer.downvotes_count ?? 0;
  const momentum =
    offer.ranking_momentum != null && !Number.isNaN(Number(offer.ranking_momentum))
      ? Number(offer.ranking_momentum)
      : 2 * (up - down);
  const categoryMacro = normalizeCategoryForStorage(offer.category);
  const categorySlugForUrl = categoryMacro && ALL_CATEGORIES.some((c) => c.value === categoryMacro) ? categoryMacro : (categoryMacro || undefined);
  const storeSlug = slugifyStore(offer.store);
  const isExpired = isOfferExpiredByExpiresAt(offer.expires_at);

  const offerPayload = {
    id: offer.id,
    title: offer.title,
    brand: formatStoreDisplayName(offer.store) || offer.store || '',
    originalPrice,
    discountPrice,
    discount,
    description: offer.description?.trim() || undefined,
    steps: offer.steps?.trim() || undefined,
    conditions: offer.conditions?.trim() || undefined,
    coupons: offer.coupons?.trim() || undefined,
    offerUrl: offer.offer_url?.trim() ?? '',
    image: offer.image_url ?? undefined,
    imageUrls: Array.isArray(offer.image_urls) ? offer.image_urls : undefined,
    msiMonths: offer.msi_months ?? undefined,
    bankCoupon: offer.bank_coupon?.trim() || undefined,
    upvotes: up,
    downvotes: down,
    votes: { up, down, score: momentum },
    author,
    createdAt: offer.created_at ?? null,
    expiresAt: offer.expires_at ?? null,
    isExpired,
    freshness,
    categorySlug: categorySlugForUrl,
    categoryLabel: categorySlugForUrl ? categorySlugToLabel(categorySlugForUrl) : undefined,
    storeSlug: storeSlug || undefined,
    storeName: formatStoreDisplayName(offer.store) || offer.store?.trim() || undefined,
    offerScope: parseOfferScopeFromConditions(offer.conditions),
  };

  const totalVotes = up + down;
  const ratingValue = totalVotes > 0 ? Math.min(5, Math.max(1, 1 + (4 * (up / totalVotes)))) : undefined;

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: offer.title,
    description: (offer.description?.trim() || offer.title).slice(0, 500),
    image: offer.image_url ? (offer.image_url.startsWith('http') ? offer.image_url : new URL(offer.image_url, BASE_URL).toString()) : undefined,
    offers: {
      '@type': 'Offer',
      url: `${BASE_URL}${canonicalPath}`,
      price: discountPrice,
      priceCurrency: 'MXN',
      availability: freshness.schemaAvailability,
      seller: {
        '@type': 'Organization',
        name: formatStoreDisplayName(offer.store) || offer.store?.trim() || 'Tienda',
      },
    },
    ...(totalVotes > 0 &&
      typeof ratingValue === 'number' && {
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: Math.round(ratingValue * 10) / 10,
          bestRating: 5,
          worstRating: 1,
          ratingCount: totalVotes,
        },
      }),
  };

  return (
    <main className="min-h-screen bg-[#F5F5F7] dark:bg-[#0a0a0a] text-[#1d1d1f] dark:text-[#fafafa]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: stringifyJsonLd(structuredData) }}
      />
      <OfferPageContent offer={offerPayload} />
    </main>
  );
}
