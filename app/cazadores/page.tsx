import type { Metadata } from 'next';
import Link from 'next/link';
import ClientLayout from '@/app/ClientLayout';
import HunterEmptyState from '@/app/components/hunters/HunterEmptyState';
import HunterGrid from '@/app/components/hunters/HunterGrid';
import { loadPublicHunters } from '@/lib/product/hunters/load';
import { brandedTitle } from '@/lib/seo/brandedTitle';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://aventaofertas.com';
const DESCRIPTION =
  'Los Aventa Hunters son las identidades editoriales de Aventa. Cada uno caza un territorio distinto, con su voz y su especialidad.';

export const revalidate = 300;

export const metadata: Metadata = {
  ...brandedTitle('Aventa Hunters'),
  description: DESCRIPTION,
  alternates: { canonical: `${BASE_URL}/cazadores` },
  openGraph: { title: 'Aventa Hunters | AVENTA', description: DESCRIPTION, url: `${BASE_URL}/cazadores`, siteName: 'AVENTA', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Aventa Hunters | AVENTA', description: DESCRIPTION },
};

export default async function CazadoresPage() {
  const hunters = await loadPublicHunters();
  return (
    <ClientLayout>
      <main className="mx-auto w-full max-w-4xl px-4 py-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300">Aventa</p>
        <h1 className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">Hunters</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-600 dark:text-zinc-400">{DESCRIPTION}</p>
        <div className="mt-8">
          {hunters.length > 0 ? (
            <HunterGrid hunters={hunters} />
          ) : (
            <HunterEmptyState
              title="Todavía no hay Hunters publicados"
              body="Cuando Aventa presente a sus Hunters, van a vivir aquí. Cada uno con su especialidad y su voz."
            />
          )}
        </div>
        <p className="mt-8 text-xs text-gray-500 dark:text-zinc-500">
          Un Hunter no es una cuenta ni parte del equipo.{' '}
          <Link href="/descubre" className="font-medium text-violet-700 hover:underline dark:text-violet-300">
            Cómo funciona Aventa
          </Link>
        </p>
      </main>
    </ClientLayout>
  );
}
