import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ALL_CATEGORIES } from '@/lib/categories';
import { AFFILIATE_DISCLOSURE_ES } from '@/lib/commissions/programStatus';
import { resolveCampaignKey } from '@/lib/attribution/channels';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Ofertas',
};

export default async function CampaignLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const campaign = resolveCampaignKey(slug);
  if (!campaign) notFound();
  const category = ALL_CATEGORIES.find((item) => item.value === campaign);
  const home = `/?utm_source=landing&utm_medium=landing&utm_campaign=${campaign}`;
  const categoryHref = category
    ? `/categoria/${category.value}?utm_source=landing&utm_medium=landing&utm_campaign=${campaign}`
    : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600">Campaña</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100 sm:text-3xl">
        {category ? `Ofertas de ${category.label}` : 'Ofertas de esta campaña'}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
        Las ofertas salen del mismo feed de Aventa. El enlace conserva la campaña para saber qué pieza trajo el clic.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link href={home} className="rounded-xl bg-violet-600 px-4 py-3 text-center text-sm font-semibold text-white">
          Ver ofertas
        </Link>
        {categoryHref ? (
          <Link href={categoryHref} className="rounded-xl border border-gray-200 px-4 py-3 text-center text-sm font-semibold dark:border-gray-700">
            Ver {category?.label}
          </Link>
        ) : null}
      </div>
      <p className="mt-8 text-xs leading-relaxed text-gray-500">{AFFILIATE_DISCLOSURE_ES}</p>
    </main>
  );
}
