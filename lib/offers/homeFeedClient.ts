import type { CardOffer, FeedApiItemShape } from '@/lib/offers/transform';

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

/** Mezcla Día a día: filtra score alto y entrelaza mitad alta/baja por votos. */
export function applyVitalesFeedTransform<T extends Pick<CardOffer, 'votes'>>(
  list: T[],
  effectiveLimit: number,
): T[] {
  let filtered = list.filter((o) => (o.votes?.score ?? 0) < DIA_A_DIA_SCORE_CAP);
  filtered.sort((a, b) => (b.votes?.score ?? 0) - (a.votes?.score ?? 0));
  const half = Math.ceil(filtered.length / 2);
  const high = filtered.slice(0, half);
  const low = filtered.slice(half);
  const interleaved: T[] = [];
  for (let i = 0; i < Math.max(high.length, low.length); i++) {
    if (high[i]) interleaved.push(high[i]);
    if (low[i]) interleaved.push(low[i]);
  }
  return interleaved.slice(0, effectiveLimit);
}

export async function fetchHomeFeedFromAPI(params: HomeFeedFetchParams): Promise<HomeFeedFetchResult> {
  const type = params.viewMode === 'latest' ? 'recent' : 'trending';
  const qs = new URLSearchParams({
    limit: String(params.limit),
    type,
    period: params.timeFilter,
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
