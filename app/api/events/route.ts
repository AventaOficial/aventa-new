import { NextResponse } from 'next/server'
import { getClientIp, enforceRateLimitCustom } from '@/lib/server/rateLimit'
import { isValidUuid } from '@/lib/server/validateUuid'
import { recordOfferEvent } from '@/lib/server/writeQueue'
import { shouldSkipDuplicateOfferEvent } from '@/lib/server/offerEventDedupe'
import { isOfferTrackable } from '@/lib/server/trackableOffer'

type EventType = 'view' | 'outbound' | 'share' | 'cazar_cta'

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request)
    const rl = await enforceRateLimitCustom(ip, 'events')
    if (!rl.success) {
      return NextResponse.json({ error: 'Demasiadas acciones. Espera un momento.' }, { status: 429 })
    }

    const body = await request.json().catch(() => ({}))
    const offerId = (typeof body?.offer_id === 'string' ? body.offer_id : body?.offerId)?.trim() || null
    const eventType: EventType | null =
      body?.event_type === 'view' ||
      body?.event_type === 'outbound' ||
      body?.event_type === 'share' ||
      body?.event_type === 'cazar_cta'
        ? body.event_type
        : null

    if (!offerId || !eventType || !isValidUuid(offerId)) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }

    if (!(await isOfferTrackable(offerId))) {
      return NextResponse.json({ error: 'Offer not trackable' }, { status: 404 })
    }

    let userId: string | null = null
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
    if (token) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (url && anonKey) {
        const userRes = await fetch(`${url}/auth/v1/user`, {
          headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
        })
        if (userRes.ok) {
          const userData = await userRes.json().catch(() => null)
          userId = userData?.id ?? null
        }
      }
    }

    if (eventType === 'outbound' || eventType === 'view') {
      const skip = await shouldSkipDuplicateOfferEvent({
        offerId,
        eventType,
        userId,
        ip,
      })
      if (skip) {
        return NextResponse.json({}, { status: 200 })
      }
    }

    await recordOfferEvent({
      offer_id: offerId,
      user_id: userId,
      event_type: eventType,
    })

    return NextResponse.json({}, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
