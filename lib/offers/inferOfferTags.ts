import { inferOfferAutogroup } from '@/lib/offers/inferOfferAutogroup';
import { slugifyTag } from '@/lib/offers/tagSlug';
import { getSearchTerms } from '@/lib/searchGroups';

export function inferOfferTags(input: {
  title: string;
  store?: string | null;
  category?: string | null;
  description?: string | null;
  extraTags?: string[];
}): string[] {
  return inferOfferAutogroup(input).tags;
}

/** Construye filtro `.or()` de PostgREST para búsqueda en feed (título, tienda, descripción, tags). */
export function buildOfferSearchOrFilter(rawQuery: string): string {
  const trimmed = rawQuery.trim();
  if (!trimmed) return '';

  const terms = getSearchTerms(trimmed);
  const allTerms = terms.length > 0 ? terms : [trimmed];
  const escape = (s: string) => s.replace(/%/g, '\\%').replace(/_/g, '\\_');
  const parts: string[] = [];
  const tagSlugs = new Set<string>();

  for (const t of allTerms) {
    const safe = escape(t);
    parts.push(`title.ilike.%${safe}%`, `store.ilike.%${safe}%`, `description.ilike.%${safe}%`);
    const slug = slugifyTag(t);
    if (slug.length >= 2) tagSlugs.add(slug);
  }

  const querySlug = slugifyTag(trimmed);
  if (querySlug.length >= 2) tagSlugs.add(querySlug);

  for (const slug of tagSlugs) {
    parts.push(`tags.cs.{${slug}}`);
  }

  return parts.join(',');
}
