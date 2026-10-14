import { decodeHtmlAttributeEntities } from '@/lib/offers/htmlEntities';

/**
 * Título tal como se guarda: entidades HTML del scraping decodificadas (`16&#34;` → `16"`,
 * `iOS &amp; Android` → `iOS & Android`) y espacios colapsados.
 */
export function normalizeOfferTitle(raw: string): string {
  return decodeHtmlAttributeEntities(raw).replace(/\s+/g, ' ').trim();
}
