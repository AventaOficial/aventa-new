import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveIngestionIdentity } from '@/lib/offers/ingestion/identity';
import { isPublicCatalogOffer, PUBLIC_CATALOG_STATUSES } from '@/lib/offers/publicCatalogGate';
import { normalizeCandidateUrl } from '@/lib/mcp/candidates';
import type { McpOutcome } from '@/lib/mcp/submissions';

type CatalogRow = {
  status: string | null;
  deleted_at: string | null;
  offer_url: string | null;
  bot_meta: unknown;
  expires_at: string | null;
};

const COLUMNS = 'status, deleted_at, offer_url, bot_meta, expires_at';

function isLiveCatalogRow(row: CatalogRow, now: Date): boolean {
  if (!isPublicCatalogOffer(row)) return false;
  if (row.expires_at) {
    const t = Date.parse(row.expires_at);
    if (Number.isFinite(t) && t <= now.getTime()) return false;
  }
  return true;
}

/**
 * check_offer_exists: sólo catálogo público (approved/published, no borrada, no vencida).
 * Devuelve únicamente si existe. No hace fetch de la URL.
 */
export async function checkOfferExists(
  supabase: SupabaseClient,
  rawUrl: unknown,
  now: Date = new Date(),
): Promise<McpOutcome<{ exists: boolean }>> {
  const normalized = normalizeCandidateUrl(rawUrl);
  if (!normalized.ok) {
    if (normalized.code === 'UNSUPPORTED_HOST') return { ok: true, data: { exists: false } };
    return { ok: false, code: 'INVALID_INPUT', message: 'url debe ser https de una tienda soportada.' };
  }
  const identity = resolveIngestionIdentity(normalized.url);
  const lookups: Array<[column: string, value: string]> = [];
  if (identity.key) lookups.push(['ingestion_identity_key', identity.key]);
  if (identity.productFingerprint) lookups.push(['product_fingerprint', identity.productFingerprint]);
  lookups.push(['offer_url', normalized.url]);

  for (const [column, value] of lookups) {
    const { data, error } = await supabase
      .from('offers')
      .select(COLUMNS)
      .eq(column, value)
      .in('status', [...PUBLIC_CATALOG_STATUSES])
      .is('deleted_at', null)
      .limit(5);
    if (error) return { ok: false, code: 'INTERNAL_ERROR', message: 'No se pudo consultar el catálogo.' };
    if (((data ?? []) as CatalogRow[]).some((row) => isLiveCatalogRow(row, now))) {
      return { ok: true, data: { exists: true } };
    }
  }
  return { ok: true, data: { exists: false } };
}
