import type { CardOffer, FeedApiItemShape } from '@/lib/offers/transform';
import { DEFAULT_MAX_SAME_PRODUCT, deferDuplicateProducts } from '@/lib/offers/feedDiversity';
import { rankDespensa, type DespensaRankable } from '@/lib/despensa/rank';
import type { DespensaBudget } from '@/lib/despensa/budget';

/** Ofertas con score >= este valor solo aparecen en Top, no en Día a día. */
export const DIA_A_DIA_SCORE_CAP = 90;

export type HomeFeedViewMode = 'vitales' | 'top' | 'latest';
export type HomeFeedPeriod = 'day' | 'week' | 'month';

export type HomeFeedFetchParams = {
  limit: number;
  viewMode: HomeFeedViewMode;
  timeFilter: HomeFeedPeriod;
  categoryFilter: string | null;
  storeFilter: string | null;
  cursor?: string | null;
};

export type HomeFeedFetchResult = {
  items: FeedApiItemShape[];
  nextCursor: string | null;
};

/**
 * Periodo efectivo enviado a `/api/feed/home`.
 *
 * UI: el selector día/semana/mes solo existe en **Top**.
 * - Recientes (`latest`): orden cronológico “recién salidas” → ventana **semana**
 *   (no “solo últimas 24h”; ese filtro rígido vacía el feed cuando no hay posts del día).
 * - Día a día (`vitales`): mismo criterio — sin control de periodo en UI → **semana**.
 * - Top: respeta el timeFilter elegido por el usuario.
 */
/** Top abre en «Semana»: «Hoy» suele estar vacío y contradice el carrusel «Mejores de la semana». */
export const DEFAULT_TOP_PERIOD: HomeFeedPeriod = 'week';

export type HomeFeedEmptyState = 'none' | 'top_period' | 'no_offers';

/**
 * Qué vacío mostrar cuando la lista no trae ofertas.
 * En Top, si el carrusel de destacados sí tiene ofertas, no se dice «Aún no hay ofertas»:
 * solo falta contenido en el periodo elegido.
 */
export function resolveHomeFeedEmptyState(input: {
  viewMode: HomeFeedViewMode | 'personalized';
  listCount: number;
  featuredCount: number;
  searching: boolean;
}): HomeFeedEmptyState {
  if (input.searching || input.listCount > 0) return 'none';
  if (input.viewMode === 'top' && input.featuredCount > 0) return 'top_period';
  return 'no_offers';
}

export function resolveHomeFeedPeriod(
  viewMode: HomeFeedViewMode,
  timeFilter: HomeFeedPeriod,
): HomeFeedPeriod {
  if (viewMode === 'latest' || viewMode === 'vitales') return 'week';
  return timeFilter;
}

type VitalesItem = Pick<CardOffer, 'votes'> &
  DespensaRankable & { title?: string | null; brand?: string | null };

/**
 * Día a día: excluye el score alto (eso es Top) y ordena con las reglas de Despensa
 * (`lib/despensa/rank.ts`). Las ofertas incompletas o con evidencia vieja van al final.
 */
export function applyVitalesFeedTransform<T extends VitalesItem>(
  list: T[],
  effectiveLimit: number,
  maxSameProduct?: number,
  opts: { now?: Date; preferredNeedIds?: ReadonlySet<string>; budget?: DespensaBudget | null } = {},
): T[] {
  const filtered = list.filter((o) => (o.votes?.score ?? 0) < DIA_A_DIA_SCORE_CAP);
  const { ranked, demoted } = rankDespensa(filtered, {
    now: opts.now ?? new Date(),
    preferredNeedIds: opts.preferredNeedIds,
    budget: opts.budget,
  });
  return deferDuplicateProducts([...ranked, ...demoted], maxSameProduct).slice(0, effectiveLimit);
}

/**
 * Recientes es solo de la comunidad. El servidor ya excluye a los autores automáticos
 * antes de paginar; esto descarta cualquier oferta que aun así llegue marcada como máquina.
 */
export function excludeMachineOffers<T extends { origin?: 'community' | 'machine' | null }>(list: readonly T[]): T[] {
  return list.filter((item) => item.origin !== 'machine');
}

/**
 * Necesidades de Despensa del usuario, leídas de `/me/intereses`.
 * Cualquier fallo devuelve un conjunto vacío: el ranking sigue igual, sin preferencias.
 */
export async function fetchDespensaPreferredNeeds(accessToken: string | null | undefined): Promise<Set<string>> {
  if (!accessToken) return new Set();
  try {
    const res = await fetch('/api/me/interests?scope=despensa', {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    if (!res.ok) return new Set();
    const body = (await res.json()) as { needIds?: unknown };
    return new Set(Array.isArray(body.needIds) ? body.needIds.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

/**
 * Reglas de cliente por pestaña del home. Despensa solo aplica en Día a día;
 * Recientes descarta ofertas automáticas; Top solo exige un voto; Para ti no pasa por aquí.
 */
export function processHomeFeedList<T extends VitalesItem & { upvotes?: number; origin?: 'community' | 'machine' | null }>(
  raw: T[],
  viewMode: HomeFeedViewMode | 'personalized',
  effectiveLimit: number,
  maxSameProduct: number = DEFAULT_MAX_SAME_PRODUCT,
  preferredNeedIds?: ReadonlySet<string>,
  budget?: DespensaBudget | null,
): T[] {
  if (viewMode === 'top') return raw.filter((o) => (o.upvotes ?? 0) >= 1);
  if (viewMode === 'vitales') {
    return applyVitalesFeedTransform(raw, effectiveLimit, maxSameProduct, { preferredNeedIds, budget });
  }
  if (viewMode === 'latest') return excludeMachineOffers(raw);
  return raw;
}

export async function fetchHomeFeedFromAPI(params: HomeFeedFetchParams): Promise<HomeFeedFetchResult> {
  const type = params.viewMode === 'latest' ? 'recent' : 'trending';
  const period = resolveHomeFeedPeriod(params.viewMode, params.timeFilter);
  const qs = new URLSearchParams({
    limit: String(params.limit),
    type,
    period,
  });
  if (params.viewMode === 'vitales' || params.viewMode === 'top' || params.viewMode === 'latest') {
    qs.set('view', params.viewMode);
  }
  if (params.categoryFilter?.trim()) qs.set('category', params.categoryFilter.trim());
  if (params.storeFilter?.trim()) qs.set('store', params.storeFilter.trim());
  if (params.cursor?.trim()) qs.set('cursor', params.cursor.trim());

  const res = await fetch(`/api/feed/home?${qs.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Feed API failed');
  const data = await res.json();
  if (!data?.success) throw new Error(typeof data?.error === 'string' ? data.error : 'Feed API error');
  return {
    items: (data.data ?? []) as FeedApiItemShape[],
    nextCursor: typeof data.nextCursor === 'string' ? data.nextCursor : null,
  };
}
