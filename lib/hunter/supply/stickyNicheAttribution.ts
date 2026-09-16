/**
 * Atribución niche → product_id SOLO con datos existentes (offers.category + URL).
 * Fail-closed: sin categoría de oferta → el SKU no entra a ningún pool sticky de nicho.
 * No inventa belleza/electrónica a partir de título o precio.
 */

import { createServerClient } from '@/lib/supabase/server';
import { normalizeMlProductId } from '@/lib/bots/ingest/mlPriceEngine';
import { resolveMercadoLibreItem } from '@/lib/offers/resolveMercadoLibreItem';
import { nicheProfileById, type NicheHunterProfile } from './nicheProfiles';

export type StickyNicheAttribution = {
  nicheId: string;
  productIds: Set<string>;
  /** store/seller conocido por offer (minúsculas); vacío si ausente. */
  storeByProduct: Map<string, string>;
  /** category Aventa observada en offer. */
  categoryByProduct: Map<string, string>;
  offerRowsScanned: number;
  reasonIfEmpty: string | null;
};

function extractProductIdFromOfferUrl(raw: string | null | undefined): string | null {
  const url = (raw ?? '').trim();
  if (!url) return null;
  const resolved = resolveMercadoLibreItem(url);
  const fromItem = normalizeMlProductId(resolved?.itemId ?? null);
  if (fromItem) return fromItem;
  const fromCatalog = normalizeMlProductId(resolved?.catalogProductId ?? null);
  if (fromCatalog) return fromCatalog;
  // Fallback: MLM… embebido en path/query (sin inventar).
  const m = url.toUpperCase().match(/\b(ML[A-Z]{0,3}\d{6,})\b/);
  return m ? normalizeMlProductId(m[1]!) : null;
}

export function nicheCategoriesForSticky(niche: NicheHunterProfile): string[] {
  return niche.categories.map((c) => c.trim().toLowerCase()).filter(Boolean);
}

/**
 * Carga product_ids atribuibles al nicho vía offers.category ∈ niche.categories.
 */
export async function loadStickyProductAllowlistForNiche(opts: {
  nicheId: string;
  supabase?: ReturnType<typeof createServerClient> | null;
  limitOffers?: number;
}): Promise<StickyNicheAttribution> {
  const empty = (reason: string): StickyNicheAttribution => ({
    nicheId: opts.nicheId,
    productIds: new Set(),
    storeByProduct: new Map(),
    categoryByProduct: new Map(),
    offerRowsScanned: 0,
    reasonIfEmpty: reason,
  });

  const niche = nicheProfileById(opts.nicheId);
  if (!niche) return empty('unknown_niche');

  const cats = nicheCategoriesForSticky(niche);
  if (cats.length === 0) return empty('niche_has_no_categories');

  let client = opts.supabase ?? null;
  if (!client) {
    try {
      client = createServerClient();
    } catch {
      return empty('no_supabase');
    }
  }

  const limit = Math.min(8000, Math.max(100, opts.limitOffers ?? 4000));
  const { data, error } = await client
    .from('offers')
    .select('offer_url, original_offer_url, category, store')
    .in('category', cats)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return empty('offers_query_failed');

  const productIds = new Set<string>();
  const storeByProduct = new Map<string, string>();
  const categoryByProduct = new Map<string, string>();

  for (const row of data) {
    const category = String((row as { category?: string }).category ?? '')
      .trim()
      .toLowerCase();
    if (!cats.includes(category)) continue;

    const urls = [
      String((row as { offer_url?: string | null }).offer_url ?? ''),
      String((row as { original_offer_url?: string | null }).original_offer_url ?? ''),
    ];
    const store = String((row as { store?: string | null }).store ?? '')
      .trim()
      .toLowerCase();

    for (const u of urls) {
      const id = extractProductIdFromOfferUrl(u);
      if (!id) continue;
      productIds.add(id);
      if (!categoryByProduct.has(id)) categoryByProduct.set(id, category);
      if (store && !storeByProduct.has(id)) storeByProduct.set(id, store);
    }
  }

  return {
    nicheId: opts.nicheId,
    productIds,
    storeByProduct,
    categoryByProduct,
    offerRowsScanned: data.length,
    reasonIfEmpty: productIds.size === 0 ? 'no_offers_with_extractable_product_id' : null,
  };
}
