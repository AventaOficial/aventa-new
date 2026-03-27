import { NextRequest, NextResponse } from 'next/server';
import { getHomeFeed } from '@/lib/offers/feedService';
import { enforceRateLimitCustom, getClientIp } from '@/lib/server/rateLimit';
import { feedHomeQuerySchema } from '@/lib/contracts/feed';

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
    });
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Parámetros inválidos' }, { status: 400 });
    }
    const { limit, type, cursor } = parsed.data;

    if (process.env.NODE_ENV === 'development') {
      console.log('[FEED API] Fetching home feed', { limit, type });
    }

    const result = await getHomeFeed({ limit, cursor, type });

    return NextResponse.json(result, {
      headers: {
        // Cache corto para absorber picos de lectura sin perder frescura.
        'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=60',
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
