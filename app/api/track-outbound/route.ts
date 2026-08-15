import { NextResponse } from 'next/server';
import { getClientIp, enforceRateLimit } from '@/lib/server/rateLimit';
import { isValidUuid } from '@/lib/server/validateUuid';
import { createServerClient } from '@/lib/supabase/server';
import { recordOfferEvent } from '@/lib/server/writeQueue';

/** Outbound = clic real a tienda. Dedup 10 min por (oferta, usuario) como /api/events. */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = await enforceRateLimit(ip);
  if (!rl.success) {
    return new NextResponse(null, { status: 429 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const offerId = typeof body?.offerId === 'string' ? body.offerId.trim() : null;

    if (!offerId || !isValidUuid(offerId)) {
      return new NextResponse(null, { status: 400 });
    }

    let userId: string | null = null;
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (token) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (url && anonKey) {
        const userRes = await fetch(`${url}/auth/v1/user`, {
          headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
        });
        if (userRes.ok) {
          const userData = await userRes.json().catch(() => null);
          userId = userData?.id ?? null;
        }
      }
    }

    if (userId) {
      try {
        const supabase = createServerClient();
        const windowStart = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data: recent } = await supabase
          .from('offer_events')
          .select('id')
          .eq('offer_id', offerId)
          .eq('user_id', userId)
          .eq('event_type', 'outbound')
          .gte('created_at', windowStart)
          .limit(1);
        if (recent && recent.length > 0) {
          return new NextResponse(null, { status: 204 });
        }
      } catch (e) {
        console.error('[track-outbound] dedup check failed:', e);
      }
    }

    await recordOfferEvent({
      offer_id: offerId,
      user_id: userId,
      event_type: 'outbound',
    });
  } catch (e) {
    console.error('[track-outbound] error:', e);
  }

  return new NextResponse(null, { status: 204 });
}
