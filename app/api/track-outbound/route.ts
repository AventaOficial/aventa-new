import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getClientIp, enforceRateLimit } from '@/lib/server/rateLimit';
import { isValidUuid } from '@/lib/server/validateUuid';
import { recordOfferEvent } from '@/lib/server/writeQueue';
import { shouldSkipDuplicateOfferEvent } from '@/lib/server/offerEventDedupe';
import { isOfferTrackable } from '@/lib/server/trackableOffer';
import { recordAttributedClick } from '@/lib/attribution/recordAttributedClick';
import { OUTBOUND_EVENT_TYPE } from '@/lib/analytics/outboundClickContract';

/**
 * Outbound = clic real a tienda.
 * Dual-write: offer_events (volumen) + reward_outbound_clicks (atribución).
 * Attribution Foundation: channel/campaign/destination/idempotency server-side.
 * body.channel / body.campaign / body.utmSource: hints allowlisted only — never SoT.
 * body.offerUrl / userId: ignored for attribution identity.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = await enforceRateLimit(`outbound:${ip}`, { critical: true });
  if (!rl.success) {
    return new NextResponse(null, { status: rl.status });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const offerId = typeof body?.offerId === 'string' ? body.offerId.trim() : null;

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
      eventType: OUTBOUND_EVENT_TYPE,
      userId,
      ip,
    });
    if (!skip) {
      await recordOfferEvent({
        offer_id: offerId,
        user_id: userId,
        event_type: OUTBOUND_EVENT_TYPE,
      });
    }

    const supabase = createServerClient();
    const click = await recordAttributedClick(supabase, {
      offerId,
      clickerUserId: userId,
      ip,
      userAgent: request.headers.get('user-agent'),
      hints: {
        utmSource: typeof body?.utmSource === 'string' ? body.utmSource : null,
        campaign: typeof body?.campaign === 'string' ? body.campaign : null,
        channel: typeof body?.channel === 'string' ? body.channel : null,
        referer: request.headers.get('referer'),
      },
    });

    // Serializa dominio canónico (NEW y REUSED vienen de recordAttributedClick SoT).
    // reused=true → campos de attribution desde fila persistida, nunca del body.
    return NextResponse.json(
      {
        ok: true,
        clickId: click?.clickId ?? null,
        offerId,
        reused: click?.reused ?? false,
        channel: click?.channel ?? null,
        campaignKey: click?.campaignKey ?? null,
        destinationUrl: click?.destinationUrl ?? null,
        originalDestinationUrl: click?.originalDestinationUrl ?? null,
        // Placeholders explícitos — no inventar dinero/conversión.
        conversionId: null,
        commissionId: null,
      },
      { status: 200 },
    );
  } catch (e) {
    console.error('[track-outbound] error:', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
