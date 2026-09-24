import { NextResponse } from 'next/server';
import { getClientIp, enforceRateLimitCustom } from '@/lib/server/rateLimit';
import { homeSearchCategoryInList } from '@/lib/offers/homeFeedFilters';
import { searchPublicOffers } from '@/lib/offers/searchPublicOffers';
import { sanitizeSearchQuery } from '@/lib/offers/searchQuery';

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const rl = await enforceRateLimitCustom(`search:${ip}`, 'feed');
  if (!rl.success) {
    return NextResponse.json({ error: 'Demasiadas búsquedas.' }, { status: rl.status });
  }

  const url = new URL(request.url);
  const q = sanitizeSearchQuery(url.searchParams.get('q') ?? '');
  const limit = Number(url.searchParams.get('limit') ?? '12');
  const store = url.searchParams.get('store');
  const category = url.searchParams.get('category');
  const viewParam = url.searchParams.get('view');
  const view = viewParam === 'vitales' || viewParam === 'top' || viewParam === 'latest' ? viewParam : 'latest';
  const categories = homeSearchCategoryInList(view, category);

  const result = await searchPublicOffers({
    query: q,
    limit: Number.isFinite(limit) ? limit : 12,
    categories,
    store,
  });

  return NextResponse.json({
    offers: result.hits,
    engine: result.engine,
  });
}
