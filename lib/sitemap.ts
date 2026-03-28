import type { MetadataRoute } from 'next';
import { createServerClient } from '@/lib/supabase/server';
import { ALL_CATEGORIES } from '@/lib/categories';
import { slugifyStore } from '@/lib/slug';
import { buildOfferPublicPath } from '@/lib/offerPath';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://aventaofertas.com';

/** When total URLs exceed this, consider switching to a sitemap index (multiple sitemaps). */
export const SITEMAP_INDEX_THRESHOLD = 50_000;

/** Max offer URLs per single sitemap (sitemap spec recommends ≤ 50k). */
export const OFFERS_PAGE_SIZE = 10_000;

export function getSitemapStatic(): MetadataRoute.Sitemap {
  return [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: 'hourly', priority: 1 },
    { url: `${BASE_URL}/descubre`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/extension`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/privacy`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/terms`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
  ];
}

export function getSitemapCategories(): MetadataRoute.Sitemap {
  return ALL_CATEGORIES.map((c) => ({
    url: `${BASE_URL}/categoria/${c.value}`,
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }));
}

export async function getSitemapStores(): Promise<MetadataRoute.Sitemap> {
  const supabase = createServerClient();
  const now = new Date().toISOString();
  const { data: storeRows } = await supabase
    .from('ofertas_ranked_general')
    .select('store')
    .or('status.eq.approved,status.eq.published')
    .or(`expires_at.is.null,expires_at.gte.${now}`)
    .limit(2000);

  const storeNames = [...new Set((storeRows ?? []).map((r) => r?.store).filter((s): s is string => Boolean(s?.trim())))];
  const urls: MetadataRoute.Sitemap = [];
  for (const name of storeNames) {
    const slug = slugifyStore(name);
    if (slug) {
      urls.push({
        url: `${BASE_URL}/tienda/${slug}`,
        lastModified: new Date(),
        changeFrequency: 'daily',
        priority: 0.7,
      });
    }
  }
  return urls;
}

export async function getSitemapOffers(
  limit = OFFERS_PAGE_SIZE,
  offset = 0
): Promise<MetadataRoute.Sitemap> {
  const supabase = createServerClient();
  const now = new Date().toISOString();

  let query = supabase
    .from('offers')
    .select('id, title, updated_at, created_at')
    .eq('status', 'approved')
    .or(`expires_at.is.null,expires_at.gte.${now}`)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data: rows } = await query;

  return (rows ?? []).map((row: { id: string; title?: string | null; updated_at?: string | null; created_at?: string | null }) => ({
    url: `${BASE_URL}${buildOfferPublicPath(row.id, row.title ?? undefined)}`,
    lastModified: row.updated_at ? new Date(row.updated_at) : (row.created_at ? new Date(row.created_at) : new Date()),
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }));
}

/** Total count of approved non-expired offers (for future sitemap index). */
export async function getOffersCount(): Promise<number> {
  const supabase = createServerClient();
  const now = new Date().toISOString();
  const { count } = await supabase
    .from('offers')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'approved')
    .or(`expires_at.is.null,expires_at.gte.${now}`);
  return count ?? 0;
}
