import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getClientIp, enforceRateLimit } from '@/lib/server/rateLimit';
import { isValidUuid } from '@/lib/server/validateUuid';
import { recordOfferEvent } from '@/lib/server/writeQueue';
import { shouldSkipDuplicateOfferEvent } from '@/lib/server/offerEventDedupe';
import { isOfferTrackable } from '@/lib/server/trackableOffer';
import { recordOutboundClick } from '@/lib/rewards/attribution/clickTracking';

/** Outbound = clic real a tienda. Registra click_id para atribución Rewards. */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = await enforceRateLimit(ip);
  if (!rl.success) {
    return new NextResponse(null, { status: 429 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const offerId = typeof body?.offerId === 'string' ? body.offerId.trim() : null;
    // body.offerUrl / userId / clickerUserId: NO son SoT de identidad ni de URL de atribución.
    // offerUrl del cliente solo lo usa el frontend para abrir la pestaña.

    if (!offerId || !isValidUuid(offerId)) {
      return NextResponse.json({ error: 'Invalid offerId' }, { status: 400 });
    }

    if (!(await isOfferTrackable(offerId))) {
      return NextResponse.json({ error: 'Offer not trackable' }, { status: 404 });
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

    const skip = await shouldSkipDuplicateOfferEvent({
      offerId,
      eventType: 'outbound',
      userId,
      ip,
    });
    if (!skip) {
      await recordOfferEvent({
        offer_id: offerId,
        user_id: userId,
        event_type: 'outbound',
      });
    }

    // P0-3: click rewards siempre desde offers.offer_url (DB), no desde body.offerUrl.
    const supabase = createServerClient();
    const click = await recordOutboundClick(supabase, {
      offerId,
      clickerUserId: userId,
      ip,
      userAgent: request.headers.get('user-agent'),
    });
    const clickId = click?.clickId ?? null;

    return NextResponse.json({ ok: true, clickId, offerId }, { status: 200 });
  } catch (e) {
    console.error('[track-outbound] error:', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
