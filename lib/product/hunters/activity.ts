import { configuredBotUserIds } from '@/lib/bots/ingest/isBotUserId';
import { createServerClient } from '@/lib/supabase/server';
import { SUPPLY_HUNTER_CODE } from './identity';

export type HunterOfferPreview = {
  id: string;
  title: string;
  store: string | null;
  category: string | null;
};

export type HunterActivity = {
  foundCount: number;
  offers: HunterOfferPreview[];
  categories: { name: string; count: number }[];
  stores: { name: string; count: number }[];
};

function tally(values: Array<string | null>): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const name = value?.trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));
}

/**
 * Ofertas publicadas del Hunter de suministro.
 * Sin autores máquina configurados, o si la lectura falla, no hay métrica: no se inventa un cero.
 * Otros codes todavía no tienen un vínculo de autor; el perfil los omite.
 */
export async function loadHunterActivity(code: string): Promise<HunterActivity | null> {
  if (code !== SUPPLY_HUNTER_CODE) return null;
  const ids = configuredBotUserIds();
  if (ids.length === 0) return null;
  try {
    const supabase = createServerClient();
    const filter = supabase.from('offers').select('id', { count: 'exact', head: true }).in('created_by', ids).in('status', ['approved', 'published']);
    const list = supabase
      .from('offers')
      .select('id, title, store, category')
      .in('created_by', ids)
      .in('status', ['approved', 'published'])
      .order('created_at', { ascending: false })
      .limit(12);
    const [counted, listed] = await Promise.all([filter, list]);
    if (counted.error || listed.error || !listed.data) return null;
    const offers = (listed.data as HunterOfferPreview[]).map((row) => ({
      id: String(row.id),
      title: String(row.title ?? ''),
      store: row.store ?? null,
      category: row.category ?? null,
    }));
    return {
      foundCount: counted.count ?? offers.length,
      offers,
      categories: tally(offers.map((offer) => offer.category)),
      stores: tally(offers.map((offer) => offer.store)),
    };
  } catch {
    return null;
  }
}
