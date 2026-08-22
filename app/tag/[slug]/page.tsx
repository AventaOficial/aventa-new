import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createServerClient } from '@/lib/supabase/server';
import Link from 'next/link';
import AppShell from '@/app/AppShell';
import CategoriaOfferList from '@/app/categoria/[slug]/CategoriaOfferList';
import { findSubgroupBySlug } from '@/lib/categories/subgroups';
import { slugifyTag } from '@/lib/offers/tagSlug';
import { mapOfferToCard, type RankedOfferSource } from '@/lib/offers/transform';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://aventaofertas.com';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tag = slugifyTag(slug);
  if (!tag) return { title: 'Tag | AVENTA' };

  const hit = findSubgroupBySlug(tag);
  const label = hit?.subgroup.label ?? tag.replace(/-/g, ' ');
  const title = `Ofertas #${tag} | AVENTA`;
  const description = `Todas las ofertas etiquetadas como ${label}.`;

  return {
    title,
    description,
    alternates: { canonical: `${BASE_URL}/tag/${tag}` },
    openGraph: { title, description, url: `${BASE_URL}/tag/${tag}`, siteName: 'AVENTA', type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function TagPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tag = slugifyTag(slug);
  if (!tag) notFound();

  const hit = findSubgroupBySlug(tag);
  const label = hit?.subgroup.label ?? tag.replace(/-/g, ' ');

  const supabase = createServerClient();
  const now = new Date().toISOString();

  const { data: rows, error } = await supabase
    .from('ofertas_ranked_general')
    .select(
      'id, title, price, original_price, image_url, image_urls, msi_months, bank_coupon, store, offer_url, description, coupons, created_at, created_by, up_votes, down_votes, score, ranking_momentum, ranking_blend, profiles:public_profiles_view!created_by(display_name, avatar_url, leader_badge, ml_tracking_tag, amazon_tracking_tag, slug)'
    )
    .contains('tags', [tag])
    .or('status.eq.approved,status.eq.published')
    .or(`expires_at.is.null,expires_at.gte.${now}`)
    .order('ranking_blend', { ascending: false })
    .limit(60);

  if (error) notFound();
  const offers = (rows ?? []).map((r) => mapOfferToCard(r as RankedOfferSource));

  return (
    <AppShell>
      <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#0a0a0a] text-[#1d1d1f] dark:text-[#fafafa]">
        <section className="max-w-4xl lg:max-w-5xl mx-auto px-4 md:px-8 pt-24 pb-32 md:pt-12 md:pb-12">
          <nav className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-6">
            <Link href="/" className="hover:text-violet-600 dark:hover:text-violet-400">
              Inicio
            </Link>
            <span aria-hidden>/</span>
            <span className="text-gray-700 dark:text-gray-300">#{tag}</span>
          </nav>

          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            #{tag}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8 capitalize">{label}</p>

          {hit ? (
            <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
              También en{' '}
              <Link
                href={`/categoria/${hit.category}/${hit.subgroup.slug}`}
                className="font-medium text-violet-600 dark:text-violet-400 hover:underline"
              >
                {hit.subgroup.label} ({hit.category})
              </Link>
            </p>
          ) : null}

          {offers.length === 0 ? (
            <p className="py-12 text-center text-gray-500 dark:text-gray-400">
              Aún no hay ofertas con esta etiqueta.
            </p>
          ) : (
            <CategoriaOfferList offers={offers} />
          )}
        </section>
      </div>
    </AppShell>
  );
}
