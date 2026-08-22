import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createServerClient } from '@/lib/supabase/server';
import { ALL_CATEGORIES, getDbCategoryValuesForMacro } from '@/lib/categories';
import { findSubgroup, getSubgroupsForCategory } from '@/lib/categories/subgroups';
import Link from 'next/link';
import AppShell from '@/app/AppShell';
import CategoriaOfferList from '../CategoriaOfferList';
import CategorySubgroupNav from '@/app/components/CategorySubgroupNav';
import { mapOfferToCard, type RankedOfferSource } from '@/lib/offers/transform';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://aventaofertas.com';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; subslug: string }>;
}): Promise<Metadata> {
  const { slug, subslug } = await params;
  const cat = ALL_CATEGORIES.find((c) => c.value === slug);
  const sub = findSubgroup(slug, subslug);
  if (!cat || !sub) return { title: 'Categoría | AVENTA' };

  const title = `${sub.label} — ${cat.label} | AVENTA`;
  const description = `Ofertas de ${sub.label} en ${cat.label}. Descuentos verificados por la comunidad.`;

  return {
    title,
    description,
    alternates: { canonical: `${BASE_URL}/categoria/${slug}/${subslug}` },
    openGraph: {
      title,
      description,
      url: `${BASE_URL}/categoria/${slug}/${subslug}`,
      siteName: 'AVENTA',
      type: 'website',
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function CategoriaSubPage({
  params,
}: {
  params: Promise<{ slug: string; subslug: string }>;
}) {
  const { slug, subslug } = await params;
  const cat = ALL_CATEGORIES.find((c) => c.value === slug);
  const sub = findSubgroup(slug, subslug);
  if (!cat || !sub) notFound();

  const categoryValues = getDbCategoryValuesForMacro(slug);
  const tagFilter = [...new Set([sub.slug, ...sub.tags])];
  const supabase = createServerClient();
  const now = new Date().toISOString();

  let query = supabase
    .from('ofertas_ranked_general')
    .select(
      'id, title, price, original_price, image_url, image_urls, msi_months, bank_coupon, store, offer_url, description, coupons, created_at, created_by, up_votes, down_votes, score, ranking_momentum, ranking_blend, profiles:public_profiles_view!created_by(display_name, avatar_url, leader_badge, ml_tracking_tag, amazon_tracking_tag, slug)'
    )
    .in('category', categoryValues)
    .or('status.eq.approved,status.eq.published')
    .or(`expires_at.is.null,expires_at.gte.${now}`)
    .order('ranking_blend', { ascending: false })
    .limit(60);

  query = query.overlaps('tags', tagFilter);

  const { data: rows, error } = await query;
  if (error) notFound();

  const offers = (rows ?? []).map((r) => mapOfferToCard(r as RankedOfferSource));
  const subgroups = getSubgroupsForCategory(slug);

  return (
    <AppShell>
      <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#0a0a0a] text-[#1d1d1f] dark:text-[#fafafa]">
        <section className="max-w-4xl lg:max-w-5xl mx-auto px-4 md:px-8 pt-24 pb-32 md:pt-12 md:pb-12">
          <nav className="flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-6">
            <Link href="/" className="hover:text-violet-600 dark:hover:text-violet-400">
              Inicio
            </Link>
            <span aria-hidden>/</span>
            <Link href={`/categoria/${slug}`} className="hover:text-violet-600 dark:hover:text-violet-400">
              {cat.label}
            </Link>
            <span aria-hidden>/</span>
            <span className="text-gray-700 dark:text-gray-300">{sub.label}</span>
          </nav>

          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {sub.label}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Ofertas en {cat.label} · también en{' '}
            <Link href={`/tag/${sub.slug}`} className="text-violet-600 dark:text-violet-400 hover:underline">
              #{sub.slug}
            </Link>
          </p>

          <CategorySubgroupNav
            categorySlug={slug}
            categoryLabel={cat.label}
            subgroups={subgroups}
            activeSubslug={subslug}
          />

          {offers.length === 0 ? (
            <p className="py-12 text-center text-gray-500 dark:text-gray-400">
              Aún no hay ofertas con esta etiqueta en {cat.label}. Prueba otra subcategoría o vuelve pronto.
            </p>
          ) : (
            <CategoriaOfferList offers={offers} />
          )}
        </section>
      </div>
    </AppShell>
  );
}
