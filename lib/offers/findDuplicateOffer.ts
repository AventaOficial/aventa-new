import type { SupabaseClient } from '@supabase/supabase-js';
import { offerUrlFingerprint, offerUrlsAreSameProduct } from '@/lib/offers/offerUrlFingerprint';

export type DuplicateOfferMatch = {
  id: string;
  status: string | null;
};

/** Solo ASIN / item id. `url:` y `meli.la:` colapsan homes y shortlinks distintos. */
function isProductFingerprint(fp: string | null): boolean {
  if (!fp) return false;
  return fp.startsWith('amz:') || fp.startsWith('ml:');
}

/**
 * Busca una oferta activa/pending que ya apunte al mismo producto (fingerprint).
 * No considera rejected ni soft-deleted.
 * URLs débiles (home de tienda, búsquedas) no se tratan como duplicado.
 */
export async function findDuplicateOfferByUrl(
  supabase: SupabaseClient,
  normalizedOfferUrl: string,
): Promise<DuplicateOfferMatch | null> {
  if (!normalizedOfferUrl.trim()) return null;
  const fingerprint = offerUrlFingerprint(normalizedOfferUrl);
  if (!isProductFingerprint(fingerprint)) return null;

  const { data: exact } = await supabase
    .from('offers')
    .select('id, status, deleted_at')
    .eq('offer_url', normalizedOfferUrl)
    .in('status', ['pending', 'approved', 'published'])
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  if (exact?.id) {
    return { id: exact.id as string, status: (exact as { status?: string | null }).status ?? null };
  }

  const { data: candidates, error } = await supabase
    .from('offers')
    .select('id, status, offer_url, deleted_at')
    .in('status', ['pending', 'approved', 'published'])
    .is('deleted_at', null)
    .not('offer_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(400);

  if (error || !candidates?.length) return null;

  for (const row of candidates) {
    const url = (row as { offer_url?: string | null }).offer_url;
    if (!url) continue;
    if (offerUrlsAreSameProduct(normalizedOfferUrl, url)) {
      return {
        id: (row as { id: string }).id,
        status: (row as { status?: string | null }).status ?? null,
      };
    }
  }

  return null;
}
