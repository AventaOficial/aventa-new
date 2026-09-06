import type { SupabaseClient } from '@supabase/supabase-js';
import { offerUrlFingerprint, offerUrlsAreSameProduct } from '@/lib/offers/offerUrlFingerprint';

export type DuplicateOfferMatch = {
  id: string;
  status: string | null;
};

/** Solo ASIN / item id. `url:` y `meli.la:` colapsan homes y shortlinks distintos. */
export function isStrongProductFingerprint(fp: string | null | undefined): fp is string {
  if (!fp) return false;
  return fp.startsWith('amz:') || fp.startsWith('ml:');
}

/** Fingerprint usable para UNIQUE / dedupe fuerte (null = no aplica constraint). */
export function strongProductFingerprintForUrl(normalizedOfferUrl: string): string | null {
  const fp = offerUrlFingerprint(normalizedOfferUrl);
  return isStrongProductFingerprint(fp) ? fp : null;
}

function hasMissingColumn(error: { message?: string; code?: string } | null, columnName: string): boolean {
  const msg = (error?.message ?? '').toLowerCase();
  return msg.includes(columnName.toLowerCase()) || msg.includes('does not exist');
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
  const fingerprint = strongProductFingerprintForUrl(normalizedOfferUrl);
  if (!fingerprint) return null;

  const { data: byFp, error: fpError } = await supabase
    .from('offers')
    .select('id, status, deleted_at')
    .eq('product_fingerprint', fingerprint)
    .in('status', ['pending', 'approved', 'published'])
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  if (!fpError && byFp?.id) {
    return { id: byFp.id as string, status: (byFp as { status?: string | null }).status ?? null };
  }

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

/** True si el error de insert es violación UNIQUE (carrera TOCTOU). */
export function isUniqueViolation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '23505') return true;
  const msg = (error.message ?? '').toLowerCase();
  return msg.includes('duplicate key') || msg.includes('unique constraint');
}

export function isProductFingerprintColumnMissing(
  error: { message?: string; code?: string } | null | undefined,
): boolean {
  return hasMissingColumn(error ?? null, 'product_fingerprint');
}
