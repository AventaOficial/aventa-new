import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getClientIp, enforceRateLimit } from '@/lib/server/rateLimit'
import { isValidUuid } from '@/lib/server/validateUuid'

type VoteValue = 1 | -1

/**
 * POST: registrar / actualizar / eliminar voto de un usuario en una oferta.
 * Body: { offerId: string, value: 1 | -1 }
 * - Sin voto → INSERT.
 * - Mismo value → DELETE.
 * - Distinto value → UPDATE.
 * Usa service_role para evitar RLS. Responde siempre 200.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request)
  const limitResult = await enforceRateLimit(ip)
  if (!limitResult.success) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 })
  }
  try {
    const body = await request.json().catch(() => ({}))
    const offerId = typeof body?.offerId === 'string' ? body.offerId.trim() : null
    const rawValue = body?.value
    const value: VoteValue | null =
      rawValue === 1 || rawValue === -1 ? rawValue : null

    if (!offerId || value === null || !isValidUuid(offerId)) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }

    const authHeader = request.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : null
    if (!token) {
      return NextResponse.json({ ok: false }, { status: 200 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anonKey) {
      console.error('[votes] Missing Supabase URL or anon key')
      return NextResponse.json({ ok: false }, { status: 200 })
    }

    const userRes = await fetch(`${url}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
      },
    })
    if (!userRes.ok) {
      return NextResponse.json({ ok: false }, { status: 200 })
    }
    const userData = await userRes.json().catch(() => null)
    const userId = userData?.id ?? null
    if (!userId) {
      return NextResponse.json({ ok: false }, { status: 200 })
    }

    const supabase = createServerClient()

    const col = 'value' as const
    const { data: existing, error: selectError } = await supabase
      .from('offer_votes')
      .select(col)
      .eq('offer_id', offerId)
      .eq('user_id', userId)
      .maybeSingle()

    if (selectError) {
      console.error('[votes] select failed:', selectError.message)
      return NextResponse.json({ ok: false }, { status: 200 })
    }

    if (!existing) {
      const { error: insertError } = await supabase.from('offer_votes').insert({
        offer_id: offerId,
        user_id: userId,
        [col]: value,
      })
      if (insertError) {
        console.error('[votes] insert failed:', insertError.message)
        return NextResponse.json({ ok: false }, { status: 200 })
      }
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    const existingVal = (existing as Record<string, number>)[col]
    if (existingVal === value) {
      const { error: deleteError } = await supabase
        .from('offer_votes')
        .delete()
        .eq('offer_id', offerId)
        .eq('user_id', userId)
      if (deleteError) {
        console.error('[votes] delete failed:', deleteError.message)
        return NextResponse.json({ ok: false }, { status: 200 })
      }
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    const { error: updateError } = await supabase
      .from('offer_votes')
      .update({ [col]: value })
      .eq('offer_id', offerId)
      .eq('user_id', userId)
    if (updateError) {
      console.error('[votes] update failed:', updateError.message)
      return NextResponse.json({ ok: false }, { status: 200 })
    }

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (e) {
    console.error('[votes] error:', e)
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
