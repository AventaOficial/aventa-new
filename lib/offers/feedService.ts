import { createInteractiveServerClient } from '@/lib/supabase/server';
import { homeFeedCategoryInList, homeFeedCreatedAtIsoMin } from '@/lib/offers/homeFeedFilters';
import { presentAuthor } from '@/lib/product/hunters/identity';
import { resolveOfferSourceCurrency } from '@/lib/offers/sourceCurrency';
import { isBotUserId } from '@/lib/bots/ingest/isBotUserId';
import { loadMachineAuthorIds, machineAuthorNotInList } from '@/lib/offers/machineAuthors';
import { loadOfferHunterCodes } from '@/lib/offers/offerHunterCodes';
import { RECIENTES_HUNTER_CODES } from '@/lib/product/hunters/lane';

export type FeedOfferAuthor = {
  display_name: string;
  avatar_url: string | null;
  leader_badge: string | null;
  ml_tracking_tag: string | null;
  amazon_tracking_tag: string | null;
  slug: string | null;
  hunter_code?: string | null;
};

export type FeedOffer = {
  id: string;
  title: string;
  price: number;
  original_price: number | null;
  source_currency: string | null;
  offer_url: string | null;
  created_at: string;
  score: number;
  up_votes: number;
  down_votes: number;
  ranking_blend: number | null;
  ranking_momentum: number | null;
  images: string[];
  bank_coupon: string | null;
  store: string | null;
  category: string | null;
  msi_months: number | null;
  description: string | null;
  hunter_comment: string | null;
  coupons: string | null;
  conditions: string | null;
  slug: string;
  created_by: string | null;
  expires_at: string | null;
  /** Origen según el id del autor (ids de bots en entorno), nunca según el nombre visible. */
  origin: 'community' | 'machine';
  author: FeedOfferAuthor;
};

type GetHomeFeedParams = {
  limit?: number;
  cursor?: string | null;
  type?: 'trending' | 'recent';
  /** Con `view`, el feed replica filtros del home (periodo, categoría, tienda). */
  view?: 'vitales' | 'top' | 'latest' | null;
  period?: 'day' | 'week' | 'month';
  category?: string | null;
  store?: string | null;
};

type GetHomeFeedSuccess = {
  success: true;
  data: FeedOffer[];
  nextCursor: string | null;
};

type GetHomeFeedError = {
  success: false;
  error: string;
};

export type { GetHomeFeedSuccess, GetHomeFeedError };

/** Recientes (y el orden cronológico sin vista) solo muestra publicaciones de la comunidad. */
export function isCommunityOnlyFeed(
  view: GetHomeFeedParams['view'],
  type: GetHomeFeedParams['type'],
): boolean {
  return view === 'latest' || (view == null && type === 'recent');
}

/**
 * Ofertas máquina de los hunters de especialidad (tecnología, moda): sí van en Recientes.
 * La vista pública no expone bot_meta, así que el filtro se hace en `offers`. Si falla, Recientes sigue sin ellas.
 */
async function loadRecientesHunterOfferIds(
  supabase: ReturnType<typeof createInteractiveServerClient>,
  input: { nowISO: string; cursor: string | null; limit: number },
): Promise<string[]> {
  let q = supabase
    .from('offers')
    .select('id')
    .in('bot_meta->>hunter_code', [...RECIENTES_HUNTER_CODES])
    .in('status', ['approved', 'published'])
    .or(`expires_at.is.null,expires_at.gte.${input.nowISO}`)
    .order('created_at', { ascending: false });
  if (input.cursor) q = q.lt('created_at', new Date(input.cursor).toISOString());
  const { data, error } = await q.limit(input.limit);
  if (error) {
    console.error('[FEED API ERROR] hunter lane ids skipped', error.code ?? 'unknown');
    return [];
  }
  return ((data ?? []) as { id: string }[]).map((row) => row.id);
}

/** Une dos listas ya ordenadas por created_at desc, sin duplicados. */
export function mergeNewestFirst<T extends Record<string, unknown>>(a: readonly T[], b: readonly T[]): T[] {
  const seen = new Set<string>();
  return [...a, ...b]
    .filter((row) => {
      const id = String(row.id ?? '');
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort((x, y) => Date.parse(String(y.created_at ?? '')) - Date.parse(String(x.created_at ?? '')));
}

/**
 * Evita que Recientes se perciba como una racha de la misma categoría sin alterar
 * los límites de página ni la continuidad del cursor. La selección sigue siendo la
 * misma ventana cronológica; solo cambia su presentación dentro de esa ventana.
 */
export function interleaveRecentCategories<T extends { category?: string | null }>(
  rows: readonly T[],
): T[] {
  const remaining = [...rows];
  const result: T[] = [];
  let previousCategory: string | null = null;

  while (remaining.length > 0) {
    const nextIndex = remaining.findIndex((row) => {
      const category = row.category?.trim().toLowerCase() || null;
      return previousCategory == null || category !== previousCategory;
    });
    const index = nextIndex === -1 ? 0 : nextIndex;
    const [next] = remaining.splice(index, 1);
    result.push(next);
    previousCategory = next.category?.trim().toLowerCase() || null;
  }

  return result;
}

export async function getHomeFeed({
  limit = 20,
  cursor = null,
  type = 'trending',
  view = null,
  period = 'day',
  category = null,
  store = null,
}: GetHomeFeedParams = {}): Promise<GetHomeFeedSuccess | GetHomeFeedError> {
  try {
    const supabase = createInteractiveServerClient();
    const nowISO = new Date().toISOString();

    const useHomePipeline = view != null;
    const communityOnly = isCommunityOnlyFeed(view, type);
    const safeLimit = Math.min(Math.max(1, limit), 100);

    const buildQuery = () => {
      let query = supabase
        .from('ofertas_ranked_general')
        .select(
          'id, title, price, original_price, offer_url, created_at, score, up_votes, down_votes, ranking_blend, ranking_momentum, image_url, image_urls, bank_coupon, store, category, msi_months, description, hunter_comment, coupons, conditions, created_by, expires_at, profiles:public_profiles_view!created_by(display_name, avatar_url, leader_badge, ml_tracking_tag, amazon_tracking_tag, slug)'
        )
        .not('created_at', 'is', null)
        .in('status', ['approved', 'published'])
        .or(`expires_at.is.null,expires_at.gte.${nowISO}`);

      if (useHomePipeline) {
        const floor = homeFeedCreatedAtIsoMin(period);
        query = query.gte('created_at', floor);
        if (store?.trim()) {
          query = query.eq('store', store.trim());
        }
        const catIn = homeFeedCategoryInList(view, category);
        if (catIn != null && catIn.length > 0) {
          query = query.in('category', catIn);
        }
        if (view === 'latest') {
          query = query.order('created_at', { ascending: false });
          if (cursor) {
            const cursorDate = new Date(cursor).toISOString();
            query = query.lt('created_at', cursorDate);
          }
        } else if (view === 'top') {
          query = query.gte('up_votes', 1).order('score_final', { ascending: false });
        } else {
          query = query.order('ranking_blend', { ascending: false });
        }
      } else {
        if (type === 'trending') {
          query = query.order('ranking_blend', { ascending: false });
        } else {
          query = query.order('created_at', { ascending: false });
        }

        if (cursor && type === 'recent') {
          const cursorDate = new Date(cursor).toISOString();
          query = query.lt('created_at', cursorDate);
        }
      }
      return query;
    };

    let query = buildQuery();
    if (communityOnly) {
      const machineAuthors = await loadMachineAuthorIds(supabase);
      if (!machineAuthors) {
        console.error('[FEED API ERROR] machine authors unavailable; Recientes closed');
        return { success: false, error: 'machine_authors_unavailable' };
      }
      const notIn = machineAuthorNotInList(machineAuthors);
      query = query.not('created_by', 'is', null);
      if (notIn) query = query.not('created_by', 'in', notIn);
    }

    const { data, error } = await query.limit(safeLimit + 1);

    if (error) {
      console.error('[FEED API ERROR]', error);
      return { success: false, error: error.message };
    }

    let rows: Record<string, unknown>[] = (data ?? []) as unknown as Record<string, unknown>[];
    if (communityOnly) {
      const laneIds = await loadRecientesHunterOfferIds(supabase, { nowISO, cursor, limit: safeLimit + 1 });
      if (laneIds.length > 0) {
        const lane = await buildQuery().in('id', laneIds).limit(safeLimit + 1);
        if (lane.error) {
          console.error('[FEED API ERROR] hunter lane skipped', lane.error.code ?? 'unknown');
        } else {
          rows = mergeNewestFirst(rows, (lane.data ?? []) as unknown as Record<string, unknown>[]);
        }
      }
    }
    const hasMore = rows.length > safeLimit;
    // Primero cerramos la ventana cronológica; así la alternancia no desplaza filas
    // entre páginas ni rompe el cursor. mergeNewestFirst ya elimina IDs repetidos.
    const chronologicalSlice = hasMore ? rows.slice(0, safeLimit) : rows;
    const slice = communityOnly ? interleaveRecentCategories(chronologicalSlice) : chronologicalSlice;
    const hunterCodes = await loadOfferHunterCodes(
      supabase,
      slice.map((row: Record<string, unknown>) => ({
        id: String(row.id ?? ''),
        created_by: row.created_by != null ? String(row.created_by) : null,
      })),
    );

    const offers: FeedOffer[] = slice.map((row: Record<string, unknown>) => {
      const imageUrl = row.image_url as string | null | undefined;
      const imageUrls = Array.isArray(row.image_urls) ? (row.image_urls as string[]) : [];
      const images = [imageUrl, ...imageUrls].filter((u): u is string => typeof u === 'string' && u.length > 0);
      const rawProf = row.profiles as
        | {
            display_name?: string | null;
            avatar_url?: string | null;
            leader_badge?: string | null;
            ml_tracking_tag?: string | null;
            slug?: string | null;
          }
        | {
            display_name?: string | null;
            avatar_url?: string | null;
            leader_badge?: string | null;
            ml_tracking_tag?: string | null;
            slug?: string | null;
          }[]
        | null
        | undefined;
      const prof = Array.isArray(rawProf) ? rawProf[0] : rawProf;
      const createdBy =
        row.created_by != null && String(row.created_by).trim() !== '' ? String(row.created_by) : null;

      return {
        id: String(row.id ?? ''),
        title: String(row.title ?? ''),
        price: Number(row.price ?? 0),
        original_price: row.original_price != null ? Number(row.original_price) : null,
        offer_url: row.offer_url != null ? String(row.offer_url) : null,
        source_currency: resolveOfferSourceCurrency(
          row.source_currency != null ? String(row.source_currency) : null,
          row.offer_url != null ? String(row.offer_url) : null,
        ),
        created_at: row.created_at != null ? new Date(row.created_at as string).toISOString() : '',
        score: Number(row.score ?? 0),
        up_votes: Number(row.up_votes ?? 0),
        down_votes: Number(row.down_votes ?? 0),
        ranking_blend: row.ranking_blend != null ? Number(row.ranking_blend) : null,
        ranking_momentum: row.ranking_momentum != null ? Number(row.ranking_momentum) : null,
        images,
        bank_coupon: row.bank_coupon != null ? String(row.bank_coupon) : null,
        store: row.store != null ? String(row.store) : null,
        category: row.category != null ? String(row.category) : null,
        msi_months: (() => {
          const raw = row.msi_months;
          if (raw == null || raw === '') return null;
          const n = Number(raw);
          return Number.isFinite(n) && n >= 1 ? n : null;
        })(),
        description: row.description != null && String(row.description).trim() !== '' ? String(row.description) : null,
        hunter_comment:
          row.hunter_comment != null && String(row.hunter_comment).trim() !== ''
            ? String(row.hunter_comment).trim()
            : null,
        coupons: row.coupons != null && String(row.coupons).trim() !== '' ? String(row.coupons).trim() : null,
        conditions:
          row.conditions != null && String(row.conditions).trim() !== '' ? String(row.conditions).trim() : null,
        slug: String(row.id ?? ''),
        created_by: createdBy,
        expires_at: row.expires_at != null ? new Date(row.expires_at as string).toISOString() : null,
        origin: isBotUserId(createdBy) ? 'machine' : 'community',
        author: (() => {
          const displayName = prof?.display_name?.trim() || 'Usuario';
          const presented = presentAuthor({
            userId: createdBy,
            displayName,
            hunterCode: hunterCodes.get(String(row.id ?? '')) ?? null,
          });
          if (presented.kind !== 'hunter') {
            return {
              display_name: displayName,
              avatar_url: prof?.avatar_url ?? null,
              leader_badge: prof?.leader_badge ?? null,
              ml_tracking_tag: prof?.ml_tracking_tag ?? null,
              amazon_tracking_tag: (prof as { amazon_tracking_tag?: string | null } | undefined)?.amazon_tracking_tag ?? null,
              slug: prof?.slug != null && String(prof.slug).trim() !== '' ? String(prof.slug).trim() : null,
              hunter_code: null,
            };
          }
          return {
            display_name: presented.hunter.name,
            avatar_url: presented.hunter.avatarUrl,
            leader_badge: null,
            ml_tracking_tag: null,
            amazon_tracking_tag: null,
            slug: null,
            hunter_code: presented.hunter.code,
          };
        })(),
      };
    });

    const nextCursor = hasMore && slice.length > 0
      ? (slice[slice.length - 1] as Record<string, unknown>).created_at as string
      : null;

    return {
      success: true,
      data: offers,
      nextCursor,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[FEED API ERROR]', err);
    return { success: false, error: message };
  }
}
