import type { SupabaseClient } from '@supabase/supabase-js';
import { offerUrlFingerprint, offerUrlsAreSameProduct } from '@/lib/offers/offerUrlFingerprint';

export type DuplicateOfferMatch = {
  id: string;
  status: string | null;
  /** Por qué el duplicado bloquea. Diagnóstico de cola: no cambia la decisión de insert. */
  kind: DuplicateOfferKind;
  ageHours: number | null;
  /** Precio de la fila que bloquea. Solo para medir supply desperdiciada. */
  price: number | null;
};

/**
 * Un duplicado no es un solo caso. Separarlos para saber si la cola pending
 * está drenando o el hunter reencuentra siempre lo mismo.
 *
 * - `pending_fresh`: pending reciente, moderación aún no lo ha visto.
 * - `pending_stale`: pending sin moderar más allá del cooldown → cola atascada.
 * - `live`: approved/published vigente. Reencontrarlo es esperado.
 * - `expired`: el UNIQUE lo retenía una fila ya caducada.
 * - `unknown`: sin created_at utilizable, o carrera TOCTOU.
 *
 * No existe `rejected`: desde FASE 4 las rechazadas no bloquean, así que un candidato
 * nunca choca contra ellas. Un contador `duplicateRejected` sería siempre 0.
 */
export type DuplicateOfferKind = 'pending_fresh' | 'pending_stale' | 'live' | 'expired' | 'unknown';

/** Un pending del bot sin moderar en 3 días es cola atascada, no descubrimiento nuevo. */
export const PENDING_STALE_AFTER_HOURS = 72;

export function duplicateRowAgeHours(
  row: { created_at?: string | null },
  now: Date = new Date()
): number | null {
  const created = row.created_at;
  if (typeof created !== 'string' || !created.trim()) return null;
  const ts = Date.parse(created);
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, Math.round(((now.getTime() - ts) / 3_600_000) * 10) / 10);
}

/**
 * Clasifica el duplicado que bloquea el insert. Solo lectura: no borra ni
 * modifica la oferta viva. `pending_stale` es una señal de drenaje, no una acción.
 */
export function classifyDuplicateOfferRow(
  row: { status?: string | null; created_at?: string | null },
  now: Date = new Date()
): DuplicateOfferKind {
  const status = row.status ?? '';
  if (status !== 'pending') return 'live';
  const ageHours = duplicateRowAgeHours(row, now);
  if (ageHours == null) return 'unknown';
  return ageHours >= PENDING_STALE_AFTER_HOURS ? 'pending_stale' : 'pending_fresh';
}

function toMatch(
  row: { id?: unknown; status?: string | null; created_at?: string | null; price?: unknown },
  now: Date = new Date()
): DuplicateOfferMatch {
  const price = typeof row.price === 'number' && Number.isFinite(row.price) ? row.price : null;
  return {
    id: row.id as string,
    status: row.status ?? null,
    kind: classifyDuplicateOfferRow(row, now),
    ageHours: duplicateRowAgeHours(row, now),
    price,
  };
}

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

  const now = new Date();

  const { data: byFp, error: fpError } = await supabase
    .from('offers')
    .select('id, status, deleted_at, expires_at, created_at, price')
    .eq('product_fingerprint', fingerprint)
    .in('status', ['pending', 'approved', 'published'])
    .is('deleted_at', null)
    .limit(5);

  if (!fpError && Array.isArray(byFp)) {
    const hit = byFp.find((row) => offerRowBlocksHunterDuplicate(row as Record<string, unknown>, now));
    if (hit?.id) return toMatch(hit as Record<string, unknown>, now);
  }

  const { data: exactRows } = await supabase
    .from('offers')
    .select('id, status, deleted_at, expires_at, created_at, price')
    .eq('offer_url', normalizedOfferUrl)
    .in('status', ['pending', 'approved', 'published'])
    .is('deleted_at', null)
    .limit(5);

  const exact = (exactRows ?? []).find((row) =>
    offerRowBlocksHunterDuplicate(row as Record<string, unknown>, now)
  );
  if (exact?.id) return toMatch(exact as Record<string, unknown>, now);

  const { data: candidates, error } = await supabase
    .from('offers')
    .select('id, status, offer_url, deleted_at, expires_at, created_at, price')
    .in('status', ['pending', 'approved', 'published'])
    .is('deleted_at', null)
    .not('offer_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(400);

  if (error || !candidates?.length) return null;

  for (const row of candidates) {
    const url = (row as { offer_url?: string | null }).offer_url;
    if (!url) continue;
    if (!offerRowBlocksHunterDuplicate(row as Record<string, unknown>, now)) continue;
    if (offerUrlsAreSameProduct(normalizedOfferUrl, url)) {
      return toMatch(row as Record<string, unknown>, now);
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
