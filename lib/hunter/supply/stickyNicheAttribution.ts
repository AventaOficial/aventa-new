/**
 * Atribución sticky desde Price Memory niche_id (provenance del Supply Engine).
 * NO usa offers.category. NO infiere por título.
 * Fail-closed: sin filas con niche_id = nicho → pool vacío.
 */

import { createServerClient } from '@/lib/supabase/server';
import { ML_PRICE_MARKETPLACE } from '@/lib/bots/ingest/mlPriceEngine';
import { nicheProfileById, type NicheHunterProfile } from './nicheProfiles';

export type StickyNicheAttribution = {
  nicheId: string;
  productIds: Set<string>;
  /** store/seller opcional (vacío — diversidad por store solo si se aporta después). */
  storeByProduct: Map<string, string>;
  categoryByProduct: Map<string, string>;
  offerRowsScanned: number;
  /** Filas de snapshots con niche_id = nicho (cobertura). */
  snapshotsWithNiche: number;
  reasonIfEmpty: string | null;
};

export function nicheCategoriesForSticky(niche: NicheHunterProfile): string[] {
  return niche.categories.map((c) => c.trim().toLowerCase()).filter(Boolean);
}

/**
 * Carga product_ids atribuibles al nicho vía product_price_snapshots.niche_id.
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
    snapshotsWithNiche: 0,
    reasonIfEmpty: reason,
  });

  const niche = nicheProfileById(opts.nicheId);
  if (!niche) return empty('unknown_niche');

  let client = opts.supabase ?? null;
  if (!client) {
    try {
      client = createServerClient();
    } catch {
      return empty('no_supabase');
    }
  }

  const limit = Math.min(8000, Math.max(100, opts.limitOffers ?? 5000));
  const { data, error } = await client
    .from('product_price_snapshots')
    .select('product_id')
    .eq('marketplace', ML_PRICE_MARKETPLACE)
    .eq('niche_id', opts.nicheId)
    .order('recorded_on', { ascending: false })
    .limit(limit);

  if (error || !data) return empty('snapshots_niche_query_failed');

  const productIds = new Set<string>();
  for (const row of data) {
    const id = String((row as { product_id: string }).product_id ?? '').trim();
    if (id) productIds.add(id);
  }

  return {
    nicheId: opts.nicheId,
    productIds,
    storeByProduct: new Map(),
    categoryByProduct: new Map(),
    offerRowsScanned: 0,
    snapshotsWithNiche: data.length,
    reasonIfEmpty: productIds.size === 0 ? 'no_snapshots_with_niche_id' : null,
  };
}
