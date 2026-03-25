import { NextRequest, NextResponse } from 'next/server';
import { getHomeFeed } from '@/lib/offers/feedService';
import { enforceRateLimitCustom, getClientIp } from '@/lib/server/rateLimit';

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = await enforceRateLimitCustom(`feed:${ip}`, 'feed');
  if (!rl.success) {
    return NextResponse.json({ success: false, error: 'Too many requests' }, { status: rl.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10)), 100) : 20;
    const typeParam = searchParams.get('type');
    const type = typeParam === 'recent' ? 'recent' : 'trending';
    const cursor = searchParams.get('cursor') ?? null;

    if (process.env.NODE_ENV === 'development') {
      console.log('[FEED API] Fetching home feed', { limit, type });
    }

    const result = await getHomeFeed({ limit, cursor, type });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[FEED API ERROR]', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
