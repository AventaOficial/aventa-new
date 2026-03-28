import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createServerClient } from '@/lib/supabase/server';
import { storeSlugToName } from '@/lib/slug';
import Link from 'next/link';
import ClientLayout from '@/app/ClientLayout';
import TiendaOfferList from './TiendaOfferList';
import { mapOfferToCard, type RankedOfferSource } from '@/lib/offers/transform';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://aventaofertas.com';

async function getStores(): Promise<string[]> {
  const supabase = createServerClient();
  const now = new Date().toISOString();
  const { data } = await supabase
    .from('ofertas_ranked_general')
    .select('store')
    .or('status.eq.approved,status.eq.published')
    .or(`expires_at.is.null,expires_at.gte.${now}`)
    .limit(2000);
  const stores = [...new Set((data ?? []).map((r) => r?.store).filter((s): s is string => Boolean(s?.trim())))].sort(
    (a, b) => a.localeCompare(b, 'es')
  );
  return stores;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const stores = await getStores();
  const storeName = storeSlugToName(slug, stores);
  if (!storeName) return { title: 'Tienda | AVENTA' };

  const title = `Ofertas en ${storeName} | AVENTA`;
  const description = `Las mejores ofertas y descuentos en ${storeName}. Encontradas por la comunidad.`;

  return {
    title,
    description,
    alternates: { canonical: `${BASE_URL}/tienda/${slug}` },
    openGraph: { title, description, url: `${BASE_URL}/tienda/${slug}`, siteName: 'AVENTA', type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function TiendaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const stores = await getStores();
  const storeName = storeSlugToName(slug, stores);
  if (!storeName) notFound();

  const supabase = createServerClient();
  const now = new Date().toISOString();

  const { data: rows, error } = await supabase
    .from('ofertas_ranked_general')
    .select('id, title, price, original_price, image_url, image_urls, msi_months, bank_coupon, store, offer_url, description, created_at, created_by, up_votes, down_votes, score, ranking_momentum, ranking_blend, profiles:public_profiles_view!created_by(display_name, avatar_url, leader_badge, ml_tracking_tag)')
    .eq('store', storeName)
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
            <span className="text-gray-700 dark:text-gray-300">{storeName}</span>
          </nav>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Ofertas en {storeName}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            Ofertas y descuentos encontrados por la comunidad en {storeName}.
          </p>

          {offers.length === 0 ? (
            <p className="py-12 text-center text-gray-500 dark:text-gray-400">
              Aún no hay ofertas de esta tienda.
            </p>
          ) : (
            <TiendaOfferList offers={offers} />
          )}

          <div className="mt-8">
            <Link
              href="/"
              className="text-sm font-medium text-violet-600 dark:text-violet-400 hover:underline"
            >
              ← Ver todas las ofertas
            </Link>
          </div>
        </section>
      </div>
    </ClientLayout>
  );
}
