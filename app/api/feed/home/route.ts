import { NextRequest, NextResponse } from 'next/server';
import { getHomeFeed } from '@/lib/offers/feedService';
import { enforceRateLimitCustom, getClientIp } from '@/lib/server/rateLimit';
import { feedHomeQuerySchema } from '@/lib/contracts/feed';
import {
  getCachedHomeFeed,
  setCachedHomeFeed,
  type HomeFeedCacheParams,
} from '@/lib/server/feedCache';

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = await enforceRateLimitCustom(`feed:${ip}`, 'feed');
  if (!rl.success) {
    return NextResponse.json({ success: false, error: 'Too many requests' }, { status: rl.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const parsed = feedHomeQuerySchema.safeParse({
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined,
      type: searchParams.get('type') ?? undefined,
      cursor: searchParams.get('cursor'),
      view: searchParams.get('view'),
      period: searchParams.get('period') ?? undefined,
      category: searchParams.get('category'),
      store: searchParams.get('store'),
    });
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Parámetros inválidos' }, { status: 400 });
    }
    const { limit, type, cursor, view, period, category, store } = parsed.data;

    const cacheParams: HomeFeedCacheParams = {
      limit: limit ?? 20,
      type: type ?? 'trending',
      view: view ?? null,
      period: period ?? 'day',
      category: category ?? null,
      store: store ?? null,
    };

    const cacheableFirstPage = !cursor;
    if (cacheableFirstPage) {
      const cached = await getCachedHomeFeed(cacheParams);
      if (cached) {
        return NextResponse.json(cached, {
          headers: {
            'Cache-Control': 'public, s-maxage=45, stale-while-revalidate=90',
            'X-Feed-Cache': 'HIT',
          },
        });
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[FEED API] Fetching home feed', { limit, type, view, period, category, store });
    }

    const result = await getHomeFeed({
      limit,
      cursor,
      type,
      view,
      period,
      category,
      store,
    });

    if (cacheableFirstPage && result.success) {
      void setCachedHomeFeed(cacheParams, result);
    }

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, s-maxage=45, stale-while-revalidate=90',
        'X-Feed-Cache': cacheableFirstPage ? 'MISS' : 'SKIP',
      },
    });
  } catch (error) {
    console.error('[FEED API ERROR]', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
