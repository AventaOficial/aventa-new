import type { SupabaseClient } from '@supabase/supabase-js';
import { createInteractiveServerClient } from '@/lib/supabase/server';
import { buildOfferSearchOrFilter } from '@/lib/offers/inferOfferTags';
import { sanitizeSearchQuery } from '@/lib/offers/searchQuery';
import { loadMachineAuthorIds, machineAuthorNotInList } from '@/lib/offers/machineAuthors';
import { attachOfferCreatorProfiles } from '@/lib/offers/attachOfferCreatorProfiles';
import { withOfferHunterCodes } from '@/lib/offers/offerHunterCodes';
import { isSupplyHunterCode } from '@/lib/product/hunters/identity';
import { mergeNewestFirst } from '@/lib/offers/feedService';
import { isRecientesHunterCode, RECIENTES_HUNTER_CODES } from '@/lib/product/hunters/lane';
import {
  applySearchPriceAlternates,
  organizeSearchHits,
  type SearchPriceAlternate,
} from '@/lib/offers/organizeSearchHits';

export type PublicSearchHit = {
  id: string;
  title: string;
  price: number;
  original_price: number | null;
  image_url: string | null;
  image_urls: string[] | null;
  msi_months: number | null;
  bank_coupon: string | null;
  store: string | null;
  offer_url: string | null;
  description: string | null;
  hunter_comment: string | null;
  steps: string | null;
  conditions: string | null;
  coupons: string | null;
  created_at: string | null;
  created_by: string | null;
  up_votes: number;
  down_votes: number;
  score: number;
  /** Mismo campo que el feed (votos ponderados). null si no se pudo leer: nunca el rank de texto. */
  ranking_momentum: number | null;
  ranking_blend: number | null;
  rank?: number;
  profiles?: {
    display_name: string | null;
    avatar_url: string | null;
    leader_badge?: string | null;
    ml_tracking_tag?: string | null;
    amazon_tracking_tag?: string | null;
    slug?: string | null;
  } | null;
  hunter_code?: string | null;
  search_price_alternate?: SearchPriceAlternate | null;
};

export type SearchEngine = 'fts' | 'ilike' | 'empty' | 'unavailable';

const SELECT_COLUMNS =
  'id, title, price, original_price, image_url, image_urls, msi_months, bank_coupon, store, offer_url, description, hunter_comment, steps, conditions, coupons, created_at, created_by';

/** La RPC no filtra autores: en Recientes se piden más filas para llenar la página tras excluir Hunters. */
const RPC_MAX_LIMIT = 50;

function asHit(row: Record<string, unknown>, rank?: number): PublicSearchHit {
  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    price: Number(row.price ?? 0),
    original_price: row.original_price != null ? Number(row.original_price) : null,
    image_url: (row.image_url as string | null) ?? null,
    image_urls: Array.isArray(row.image_urls) ? (row.image_urls as string[]) : null,
    msi_months: row.msi_months != null ? Number(row.msi_months) : null,
    bank_coupon: (row.bank_coupon as string | null) ?? null,
    store: (row.store as string | null) ?? null,
    offer_url: (row.offer_url as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    hunter_comment: (row.hunter_comment as string | null) ?? null,
    steps: (row.steps as string | null) ?? null,
    conditions: (row.conditions as string | null) ?? null,
    coupons: (row.coupons as string | null) ?? null,
    created_at: (row.created_at as string | null) ?? null,
    created_by: row.created_by != null ? String(row.created_by) : null,
    up_votes: 0,
    down_votes: 0,
    score: 0,
    ranking_momentum: null,
    ranking_blend: null,
    rank,
  };
}

function isCommunityHit(hit: PublicSearchHit, machineAuthors: ReadonlySet<string>): boolean {
  const author = hit.created_by?.trim();
  return Boolean(author) && !machineAuthors.has(author!);
}

function passesRecientesSearchFilter(
  hit: PublicSearchHit,
  machineAuthors: ReadonlySet<string>,
  hunterCodes: ReadonlyMap<string, string>,
): boolean {
  if (!hit.created_by?.trim()) return false;
  if (isCommunityHit(hit, machineAuthors)) return true;
  return isRecientesHunterCode(hunterCodes.get(hit.id));
}

async function loadRecientesHunterCodes(
  supabase: SupabaseClient,
  hits: PublicSearchHit[],
  machineAuthors: readonly string[],
): Promise<Map<string, string>> {
  const excluded = new Set(machineAuthors);
  const ids = hits
    .filter((hit) => hit.created_by && excluded.has(hit.created_by.trim()))
    .map((hit) => hit.id);
  const codes = new Map<string, string>();
  if (ids.length === 0) return codes;
  const { data, error } = await supabase
    .from('offers')
    .select('id, hunter_code:bot_meta->>hunter_code')
    .in('id', ids);
  if (error || !Array.isArray(data)) return codes;
  for (const row of data as { id: string; hunter_code: unknown }[]) {
    if (isSupplyHunterCode(row.hunter_code)) codes.set(row.id, row.hunter_code);
  }
  return codes;
}

async function filterRecientesSearchHits(
  supabase: SupabaseClient,
  hits: PublicSearchHit[],
  machineAuthors: readonly string[],
): Promise<PublicSearchHit[]> {
  if (hits.length === 0) return hits;
  const excluded = new Set(machineAuthors);
  const hunterCodes = await loadRecientesHunterCodes(supabase, hits, machineAuthors);
  return hits.filter((hit) => passesRecientesSearchFilter(hit, excluded, hunterCodes));
}

async function searchRecientesHunterLane(
  supabase: SupabaseClient,
  input: {
    query: string;
    limit: number;
    categories: string[] | null;
    store: string | null;
  },
): Promise<PublicSearchHit[]> {
  const nowISO = new Date().toISOString();
  const orFilter = buildOfferSearchOrFilter(input.query);
  if (!orFilter) return [];

  let query = supabase
    .from('offers')
    .select(SELECT_COLUMNS)
    .in('status', ['approved', 'published'])
    .is('deleted_at', null)
    .or(`expires_at.is.null,expires_at.gte.${nowISO}`)
    .or(orFilter)
    .in('bot_meta->>hunter_code', [...RECIENTES_HUNTER_CODES]);

  if (input.store) query = query.eq('store', input.store);
  if (input.categories && input.categories.length > 0) query = query.in('category', input.categories);

  const { data, error } = await query.order('created_at', { ascending: false }).limit(input.limit);
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((row) => asHit(row));
}

async function mergeRecientesSearchPage(
  supabase: SupabaseClient,
  input: {
    query: string;
    limit: number;
    categories: string[] | null;
    store: string | null;
    machineAuthors: readonly string[];
    primary: PublicSearchHit[];
  },
): Promise<PublicSearchHit[]> {
  const lane = await searchRecientesHunterLane(supabase, {
    query: input.query,
    limit: input.limit,
    categories: input.categories,
    store: input.store,
  });
  const merged = mergeNewestFirst(
    input.primary.map((hit) => ({ ...hit, created_at: hit.created_at })),
    lane.map((hit) => ({ ...hit, created_at: hit.created_at })),
  ) as PublicSearchHit[];
  const seen = new Set<string>();
  const deduped: PublicSearchHit[] = [];
  for (const row of merged) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    deduped.push(row);
  }
  return deduped.slice(0, input.limit);
}

/** Votos reales desde la misma vista que el feed, en una sola lectura por búsqueda. */
async function attachVotes(supabase: SupabaseClient, hits: PublicSearchHit[]): Promise<PublicSearchHit[]> {
  if (hits.length === 0) return hits;
  const { data, error } = await supabase
    .from('ofertas_ranked_general')
    .select('id, up_votes, down_votes, score, ranking_momentum, ranking_blend')
    .in('id', hits.map((h) => h.id));
  if (error || !Array.isArray(data)) {
    console.error('[search] vote counts unavailable', error?.message ?? 'no data');
    return hits;
  }
  const byId = new Map((data as Record<string, unknown>[]).map((row) => [String(row.id), row]));
  return hits.map((hit) => {
    const row = byId.get(hit.id);
    if (!row) return hit;
    const num = (v: unknown) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
    return {
      ...hit,
      up_votes: num(row.up_votes) ?? 0,
      down_votes: num(row.down_votes) ?? 0,
      score: num(row.score) ?? 0,
      ranking_momentum: num(row.ranking_momentum),
      ranking_blend: num(row.ranking_blend),
    };
  });
}

async function presentSearchHits(
  supabase: SupabaseClient,
  hits: PublicSearchHit[],
): Promise<PublicSearchHit[]> {
  if (hits.length === 0) return hits;
  const { hits: grouped, priceAlternateByLeaderId } = organizeSearchHits(hits);
  let withProfiles = await attachOfferCreatorProfiles(supabase, grouped);
  withProfiles = await withOfferHunterCodes(supabase, withProfiles);
  return applySearchPriceAlternates(withProfiles, priceAlternateByLeaderId);
}

async function searchWithIlike(
  supabase: SupabaseClient,
  input: {
    query: string;
    limit: number;
    categories: string[] | null;
    store: string | null;
    machineAuthors: readonly string[] | null;
  },
): Promise<PublicSearchHit[]> {
  const nowISO = new Date().toISOString();
  const orFilter = buildOfferSearchOrFilter(input.query);
  if (!orFilter) return [];

  let query = supabase
    .from('offers')
    .select(SELECT_COLUMNS)
    .in('status', ['approved', 'published'])
    .is('deleted_at', null)
    .or(`expires_at.is.null,expires_at.gte.${nowISO}`)
    .or(orFilter);

  if (input.machineAuthors) {
    query = query.not('created_by', 'is', null);
    const notIn = machineAuthorNotInList(input.machineAuthors);
    if (notIn) query = query.not('created_by', 'in', notIn);
  }
  if (input.store) query = query.eq('store', input.store);
  if (input.categories && input.categories.length > 0) query = query.in('category', input.categories);

  const { data, error } = await query.order('created_at', { ascending: false }).limit(input.limit);
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((row) => asHit(row));
}

/**
 * Búsqueda pública. Con `communityOnly` (Recientes) excluye hunters de uso diario,
 * pero conserva la misma mezcla que el feed: comunidad + hunters de especialidad (kai, eleonore).
 */
export async function searchPublicOffers(input: {
  query: string;
  limit: number;
  categories?: string[] | null;
  store?: string | null;
  communityOnly?: boolean;
}): Promise<{ hits: PublicSearchHit[]; engine: SearchEngine }> {
  const query = sanitizeSearchQuery(input.query);
  const limit = Math.min(50, Math.max(1, input.limit));
  if (query.length < 2) return { hits: [], engine: 'empty' };

  const categories = input.categories && input.categories.length > 0 ? input.categories : null;
  const store = input.store?.trim() || null;
  const supabase = createInteractiveServerClient();

  let machineAuthors: string[] | null = null;
  if (input.communityOnly) {
    machineAuthors = await loadMachineAuthorIds(supabase);
    if (!machineAuthors) {
      console.error('[search] machine authors unavailable; Recientes search closed');
      return { hits: [], engine: 'unavailable' };
    }
  }
  const { data, error } = await supabase.rpc('search_public_offers', {
    p_query: query,
    p_limit: machineAuthors ? RPC_MAX_LIMIT : limit,
    p_offset: 0,
    p_categories: categories,
    p_store: store,
  });

  if (!error && Array.isArray(data) && data.length > 0) {
    let hits = (data as Record<string, unknown>[]).map((row) =>
      asHit(row, typeof row.rank === 'number' ? row.rank : undefined)
    );
    // Con el tope lleno, filtrar después puede dejar fuera ofertas de la comunidad más allá de la fila 50:
    // en ese caso la consulta ilike, que excluye autores en la base antes del límite, es la exacta.
    const saturated = machineAuthors != null && data.length >= RPC_MAX_LIMIT;
    if (machineAuthors) hits = await filterRecientesSearchHits(supabase, hits, machineAuthors);
    if (machineAuthors && hits.length < limit) {
      hits = await mergeRecientesSearchPage(supabase, {
        query,
        limit,
        categories,
        store,
        machineAuthors,
        primary: hits,
      });
    }
    if (hits.length >= limit || (hits.length > 0 && !saturated)) {
      const voted = await attachVotes(supabase, hits);
      const presented = await presentSearchHits(supabase, voted);
      return { hits: presented.slice(0, limit), engine: 'fts' };
    }
  }

  let fallback = await searchWithIlike(supabase, { query, limit, categories, store, machineAuthors });
  if (machineAuthors) {
    fallback = await filterRecientesSearchHits(supabase, fallback, machineAuthors);
    fallback = await mergeRecientesSearchPage(supabase, {
      query,
      limit,
      categories,
      store,
      machineAuthors,
      primary: fallback,
    });
  }
  const voted = await attachVotes(supabase, fallback);
  const presented = await presentSearchHits(supabase, voted);
  return {
    hits: presented.slice(0, limit),
    engine: fallback.length > 0 ? 'ilike' : 'empty',
  };
}
