import type { CardOffer, FeedApiItemShape } from '@/lib/offers/transform';
import { deferDuplicateProducts } from '@/lib/offers/feedDiversity';
import { rankDespensa, type DespensaRankable } from '@/lib/despensa/rank';

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
  opts: { now?: Date; preferredNeedIds?: ReadonlySet<string> } = {},
): T[] {
  const filtered = list.filter((o) => (o.votes?.score ?? 0) < DIA_A_DIA_SCORE_CAP);
  const { ranked, demoted } = rankDespensa(filtered, {
    now: opts.now ?? new Date(),
    preferredNeedIds: opts.preferredNeedIds,
  });
  return deferDuplicateProducts([...ranked, ...demoted], maxSameProduct).slice(0, effectiveLimit);
}

/** Máximo de ofertas de origen máquina seguidas en Recientes. */
export const RECIENTES_MAX_MACHINE_RUN = 2;

/**
 * Recientes no debe quedar dominado por publicaciones automáticas.
 * Usa `origin`, que el servidor calcula con el id del autor (no con el nombre visible).
 * Conserva el orden de la comunidad; las automáticas sobrantes pasan más abajo en la
 * misma página, nunca se eliminan. Sin `origin` cuenta como comunidad.
 */
export function limitConsecutiveMachineOffers<T extends { origin?: 'community' | 'machine' | null }>(
  list: readonly T[],
  maxRun: number = RECIENTES_MAX_MACHINE_RUN,
): T[] {
  const out: T[] = [];
  const queue: T[] = [];
  let run = 0;
  for (const item of list) {
    if (item.origin !== 'machine') {
      out.push(item);
      run = 0;
      while (queue.length > 0 && run < maxRun) {
        out.push(queue.shift()!);
        run += 1;
      }
      continue;
    }
    if (run < maxRun && queue.length === 0) {
      out.push(item);
      run += 1;
    } else {
      queue.push(item);
    }
  }
  return [...out, ...queue];
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
