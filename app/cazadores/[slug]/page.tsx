import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ClientLayout from '@/app/ClientLayout';
import HunterProfile from '@/app/components/hunters/HunterProfile';
import { loadHunterActivity } from '@/lib/product/hunters/activity';
import { hunterAssets } from '@/lib/product/hunters/identity';
import { loadPublicHunterBySlug } from '@/lib/product/hunters/load';
import { brandedTitle } from '@/lib/seo/brandedTitle';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://aventaofertas.com';

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const hunter = await loadPublicHunterBySlug(slug);
  if (!hunter) return brandedTitle('Hunter');
  const title = `${hunter.displayName} · ${hunter.title}`;
  const description = hunter.shortBio || `${hunter.displayName}, Aventa Hunter de ${hunter.specialty}.`;
  const image = hunter.coverUrl ?? hunter.avatarUrl;
  const url = `${BASE_URL}/cazadores/${hunter.slug}`;
  return {
    ...brandedTitle(title),
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${title} | AVENTA`,
      description,
      url,
      siteName: 'AVENTA',
      type: 'profile',
      images: image ? [{ url: image }] : undefined,
    },
    twitter: { card: image ? 'summary_large_image' : 'summary', title: `${title} | AVENTA`, description },
  };
}

export default async function HunterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const hunter = await loadPublicHunterBySlug(slug);
  if (!hunter) notFound();
  const activity = await loadHunterActivity(hunter.code);

  return (
    <ClientLayout>
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <Link href="/cazadores" className="text-xs font-semibold text-violet-700 hover:underline dark:text-violet-300">
          Todos los Hunters
        </Link>
        <div className="mt-4">
          <HunterProfile hunter={hunter} assets={hunterAssets(hunter.code)} activity={activity} />
        </div>
      </main>
    </ClientLayout>
  );
}
