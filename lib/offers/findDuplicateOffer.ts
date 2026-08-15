import type { SupabaseClient } from '@supabase/supabase-js';
import { offerUrlFingerprint, offerUrlsAreSameProduct } from '@/lib/offers/offerUrlFingerprint';

export type DuplicateOfferMatch = {
  id: string;
  status: string | null;
};

/**
 * Busca una oferta activa/pending que ya apunte al mismo producto (fingerprint).
 * No considera rejected ni soft-deleted.
 */
export async function findDuplicateOfferByUrl(
  supabase: SupabaseClient,
  normalizedOfferUrl: string,
): Promise<DuplicateOfferMatch | null> {
  const fingerprint = offerUrlFingerprint(normalizedOfferUrl);
  if (!fingerprint || !normalizedOfferUrl.trim()) return null;

  // Match exacto primero (mismo string guardado)
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

  // Candidatos recientes con URL (ventana acotada para no escanear toda la tabla en MVP)
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
