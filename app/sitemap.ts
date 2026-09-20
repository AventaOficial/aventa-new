import type { MetadataRoute } from 'next';
import {
  getSitemapStatic,
  getSitemapCategories,
  getSitemapStores,
  getSitemapOffers,
} from '@/lib/sitemap';

/** Prefer runtime/ISR so preview builds without service-role still succeed. */
export const revalidate = 3600;

/**
 * Single sitemap for now. When URLs exceed SITEMAP_INDEX_THRESHOLD (50k),
 * consider switching to a sitemap index that references:
 * - /sitemaps/offers-1.xml, /sitemaps/offers-2.xml, ...
 * - /sitemaps/categories.xml
 * - /sitemaps/stores.xml
 * (and static URLs in the index or a /sitemaps/static.xml)
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [staticUrls, categoryUrls, storeUrls, offerUrls] = await Promise.all([
    Promise.resolve(getSitemapStatic()),
    Promise.resolve(getSitemapCategories()),
    getSitemapStores(),
    getSitemapOffers(),
  ]);

  return [...staticUrls, ...categoryUrls, ...storeUrls, ...offerUrls];
}
