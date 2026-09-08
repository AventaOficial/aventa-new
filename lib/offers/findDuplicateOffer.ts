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

/**
 * pending/approved/published sin borrar y sin caducar.
 * Caducadas (expires_at < now) no bloquean al hunter; pending sin expiry sí.
 */
export function offerRowBlocksHunterDuplicate(
  row: {
    status?: string | null;
    deleted_at?: string | null;
    expires_at?: string | null;
  },
  now: Date = new Date()
): boolean {
  if (row.deleted_at) return false;
  const status = row.status ?? '';
  if (status !== 'pending' && status !== 'approved' && status !== 'published') return false;
  const exp = row.expires_at;
  if (typeof exp === 'string' && exp.trim()) {
    const ts = Date.parse(exp);
    if (Number.isFinite(ts) && ts < now.getTime()) return false;
  }
  return true;
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
    .select('id, status, deleted_at, expires_at')
    .eq('product_fingerprint', fingerprint)
    .in('status', ['pending', 'approved', 'published'])
    .is('deleted_at', null)
    .limit(5);

  if (!fpError && Array.isArray(byFp)) {
    const hit = byFp.find((row) => offerRowBlocksHunterDuplicate(row as Record<string, unknown>));
    if (hit?.id) {
      return { id: hit.id as string, status: (hit as { status?: string | null }).status ?? null };
    }
  }

  const { data: exactRows } = await supabase
    .from('offers')
    .select('id, status, deleted_at, expires_at')
    .eq('offer_url', normalizedOfferUrl)
    .in('status', ['pending', 'approved', 'published'])
    .is('deleted_at', null)
    .limit(5);

  const exact = (exactRows ?? []).find((row) =>
    offerRowBlocksHunterDuplicate(row as Record<string, unknown>)
  );
  if (exact?.id) {
    return { id: exact.id as string, status: (exact as { status?: string | null }).status ?? null };
  }

  const { data: candidates, error } = await supabase
    .from('offers')
    .select('id, status, offer_url, deleted_at, expires_at')
    .in('status', ['pending', 'approved', 'published'])
    .is('deleted_at', null)
    .not('offer_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(400);

  if (error || !candidates?.length) return null;

  for (const row of candidates) {
    const url = (row as { offer_url?: string | null }).offer_url;
    if (!url) continue;
    if (!offerRowBlocksHunterDuplicate(row as Record<string, unknown>)) continue;
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

/**
 * Libera el UNIQUE de un fingerprint solo si la fila activa ya caducó.
 * No toca pending vivos. No borra filas.
 */
export async function releaseExpiredFingerprintSlot(
  supabase: SupabaseClient,
  fingerprint: string,
  now: Date = new Date()
): Promise<boolean> {
  if (!fingerprint) return false;
  const { data, error } = await supabase
    .from('offers')
    .select('id, status, expires_at, deleted_at')
    .eq('product_fingerprint', fingerprint)
    .in('status', ['pending', 'approved', 'published'])
    .is('deleted_at', null)
    .limit(5);
  if (error || !data?.length) return false;

  const expired = data.filter((row) => !offerRowBlocksHunterDuplicate(row as Record<string, unknown>, now));
  if (expired.length === 0) return false;

  let released = false;
  for (const row of expired) {
    const id = (row as { id?: string }).id;
    if (!id) continue;
    const { error: updError } = await supabase
      .from('offers')
      .update({ status: 'expired' })
      .eq('id', id)
      .in('status', ['approved', 'published']);
    if (!updError) released = true;
  }
  return released;
}

export function isProductFingerprintColumnMissing(
  error: { message?: string; code?: string } | null | undefined,
): boolean {
  return hasMissingColumn(error ?? null, 'product_fingerprint');
}
