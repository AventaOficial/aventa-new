import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createServerClient } from '@/lib/supabase/server';
import { ALL_CATEGORIES, getDbCategoryValuesForMacro } from '@/lib/categories';
import Link from 'next/link';
import ClientLayout from '@/app/ClientLayout';
import CategoriaOfferList from './CategoriaOfferList';
import { mapOfferToCard, type RankedOfferSource } from '@/lib/offers/transform';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://aventaofertas.com';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const cat = ALL_CATEGORIES.find((c) => c.value === slug);
  if (!cat) return { title: 'Categoría | AVENTA' };

  const title = `Ofertas de ${cat.label} | AVENTA`;
  const description = cat.subtitle
    ? `Las mejores ofertas en ${cat.label}. ${cat.subtitle}.`
    : `Ofertas y descuentos en ${cat.label}.`;

  return {
    title,
    description,
    alternates: { canonical: `${BASE_URL}/categoria/${slug}` },
    openGraph: { title, description, url: `${BASE_URL}/categoria/${slug}`, siteName: 'AVENTA', type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function CategoriaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cat = ALL_CATEGORIES.find((c) => c.value === slug);
  if (!cat) notFound();

  const categoryValues = getDbCategoryValuesForMacro(slug);
  const supabase = createServerClient();
  const now = new Date().toISOString();

  const { data: rows, error } = await supabase
    .from('ofertas_ranked_general')
    .select('id, title, price, original_price, image_url, image_urls, msi_months, bank_coupon, store, offer_url, description, created_at, created_by, up_votes, down_votes, score, ranking_momentum, ranking_blend, profiles:public_profiles_view!created_by(display_name, avatar_url, leader_badge, ml_tracking_tag)')
    .in('category', categoryValues)
    .or('status.eq.approved,status.eq.published')
    .or(`expires_at.is.null,expires_at.gte.${now}`)
    .order('ranking_blend', { ascending: false })
    .limit(60);

  if (error) notFound();
  const offers = (rows ?? []).map((r) => mapOfferToCard(r as RankedOfferSource));

  return (
    <ClientLayout>
      <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#0a0a0a] text-[#1d1d1f] dark:text-[#fafafa]">
        <section className="max-w-4xl lg:max-w-5xl mx-auto px-4 md:px-8 pt-24 pb-32 md:pt-12 md:pb-12">
          <nav className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-6">
            <Link href="/" className="hover:text-violet-600 dark:hover:text-violet-400">Inicio</Link>
            <span aria-hidden>/</span>
            <span className="text-gray-700 dark:text-gray-300">{cat.label}</span>
          </nav>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Ofertas en {cat.label}
          </h1>
          {cat.subtitle && (
            <p className="text-gray-600 dark:text-gray-400 mb-8">{cat.subtitle}</p>
          )}

          {offers.length === 0 ? (
            <p className="py-12 text-center text-gray-500 dark:text-gray-400">
              Aún no hay ofertas en esta categoría.
            </p>
          ) : (
            <CategoriaOfferList offers={offers} />
          )}

          <div className="mt-8 flex flex-wrap gap-2">
            {ALL_CATEGORIES.filter((c) => c.value !== slug).map((c) => (
              <Link
                key={c.value}
                href={`/categoria/${c.value}`}
                className="text-sm font-medium px-4 py-2 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-violet-100 dark:hover:bg-violet-900/30 hover:text-violet-700 dark:hover:text-violet-300"
              >
                {c.label}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </ClientLayout>
  );
}
