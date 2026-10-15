import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveIngestionIdentity } from '@/lib/offers/ingestion/identity';
import { isPublicCatalogOffer } from '@/lib/offers/publicCatalogGate';
import { offerBatchIdentityKey } from '@/lib/offers/batchPaste/extractOfferUrls';
import { ACTIVE_OFFER_STATUSES, findIdentityHolders } from '@/lib/offers/batch/identityHolder';
import { normalizeCandidateUrl } from '@/lib/mcp/candidates';
import type { McpOutcome } from '@/lib/mcp/submissions';

type CatalogRow = {
  status: string | null;
  deleted_at: string | null;
  offer_url: string | null;
  bot_meta: unknown;
  expires_at: string | null;
  price: number | null;
};

const COLUMNS = 'status, deleted_at, offer_url, bot_meta, expires_at, price';

/**
 * published: oferta activa visible en el catálogo.
 * in_review: oferta pendiente o candidato en proceso; submit respondería ALREADY_IN_REVIEW o duplicado.
 * not_visible: oferta activa que no se muestra (vencida u oculta); igual bloquea una oferta nueva.
 * none: nada activo; se puede enviar.
 */
export type OfferExistenceStatus = 'published' | 'in_review' | 'not_visible' | 'none';

export type CheckOfferExistsResult = {
  /** Sólo catálogo público (approved/published, no borrada, no vencida). */
  exists: boolean;
  status: OfferExistenceStatus;
  /** Por qué coincidió: identidad del producto (ID de tienda o URL canónica) o la URL exacta. */
  matchedBy: 'product_identity' | 'url' | null;
  /** false si submit_deal_candidates lo rechazaría como duplicado o en revisión. */
  canSubmit: boolean;
  /** Hubo una propuesta rechazada del mismo producto. Solo enviar si la promoción es nueva. */
  previouslyRejected: boolean;
  /** Precio publicado en catálogo para esta identidad (sin ids). Usa get_price_reference para comparar tu precio. */
  catalogPrice: number | null;
};

function isLiveCatalogRow(row: CatalogRow, now: Date): boolean {
  if (!isPublicCatalogOffer(row)) return false;
  if (row.expires_at) {
    const t = Date.parse(row.expires_at);
    if (Number.isFinite(t) && t <= now.getTime()) return false;
  }
  return true;
}

function catalogPriceFromRows(rows: CatalogRow[], now: Date): number | null {
  const live = rows.filter((r) => isLiveCatalogRow(r, now));
  const prices = live
    .map((r) => (typeof r.price === 'number' && Number.isFinite(r.price) && r.price > 0 ? r.price : null))
    .filter((n): n is number => n != null);
  if (prices.length === 0) return null;
  return Math.min(...prices);
}

function result(
  status: OfferExistenceStatus,
  matchedBy: CheckOfferExistsResult['matchedBy'],
  previouslyRejected = false,
  catalogPrice: number | null = null,
): CheckOfferExistsResult {
  return {
    exists: status === 'published',
    status,
    matchedBy,
    canSubmit: status === 'none',
    previouslyRejected,
    catalogPrice: status === 'published' ? catalogPrice : null,
  };
}

const INTERNAL = { ok: false as const, code: 'INTERNAL_ERROR' as const, message: 'No se pudo consultar el catálogo.' };

/**
 * check_offer_exists: misma normalización e identidades que submit_deal_candidates.
 * Mira las ofertas activas (identidad del writer) y quién retiene la identidad del lote.
 * Es una consulta previa: la autoridad sigue siendo submit (índices únicos). No hace fetch.
 */
export async function checkOfferExists(
  supabase: SupabaseClient,
  rawUrl: unknown,
  now: Date = new Date(),
): Promise<McpOutcome<CheckOfferExistsResult>> {
  const normalized = normalizeCandidateUrl(rawUrl);
  if (!normalized.ok) {
    if (normalized.code === 'UNSUPPORTED_HOST') return { ok: true, data: { ...result('none', null), canSubmit: false } };
    return { ok: false, code: 'INVALID_INPUT', message: 'url debe ser https de una tienda soportada.' };
  }
  const identity = resolveIngestionIdentity(normalized.url);
  const lookups: Array<[column: string, value: string, matchedBy: 'product_identity' | 'url']> = [];
  if (identity.key) lookups.push(['ingestion_identity_key', identity.key, 'product_identity']);
  if (identity.productFingerprint) lookups.push(['product_fingerprint', identity.productFingerprint, 'product_identity']);
  lookups.push(['offer_url', normalized.url, 'url']);

  for (const [column, value, matchedBy] of lookups) {
    const { data, error } = await supabase
      .from('offers')
      .select(COLUMNS)
      .eq(column, value)
      .in('status', [...ACTIVE_OFFER_STATUSES])
      .is('deleted_at', null)
      .limit(5);
    if (error) return INTERNAL;
    const active = (data ?? []) as CatalogRow[];
    if (active.some((r) => isLiveCatalogRow(r, now))) {
      return { ok: true, data: result('published', matchedBy, false, catalogPriceFromRows(active, now)) };
    }
    if (active.some((r) => r.status === 'pending')) return { ok: true, data: result('in_review', matchedBy) };
    if (active.length > 0) return { ok: true, data: result('not_visible', matchedBy) };
  }

  const holders = await findIdentityHolders(supabase, offerBatchIdentityKey(normalized.url));
  if (!holders.ok) return INTERNAL;
  if (holders.holders.some((h) => h.state === 'published')) return { ok: true, data: result('not_visible', 'product_identity') };
  if (holders.holders.some((h) => h.state === 'in_review')) return { ok: true, data: result('in_review', 'product_identity') };

  let previouslyRejected = holders.holders.some((h) => h.state === 'stale');
  if (!previouslyRejected) {
    const [column, value] = lookups[0];
    const { data, error } = await supabase.from('offers').select('id').eq(column, value).eq('status', 'rejected').limit(1);
    if (error) return INTERNAL;
    previouslyRejected = (data ?? []).length > 0;
  }
  return { ok: true, data: result('none', null, previouslyRejected) };
}
