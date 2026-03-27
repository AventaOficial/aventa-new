import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getClientIp, enforceRateLimit } from '@/lib/server/rateLimit'
import { isValidUuid } from '@/lib/server/validateUuid'
import type { SupabaseClient } from '@supabase/supabase-js'
import { voteInputSchema } from '@/lib/contracts/votes'

/** Un voto positivo vale 2, uno negativo -1. Así se guarda en offer_votes y el trigger debe contar value=2 como upvote. */
type VoteValue = 2 | -1

/** Notifica al dueño de la oferta cuando alguien da like (value === 2). */
async function notifyOfferOwnerLike(supabase: SupabaseClient, offerId: string, voterUserId: string) {
  const { data: offer } = await supabase
    .from('offers')
    .select('created_by, title')
    .eq('id', offerId)
    .maybeSingle()
  const ownerId = (offer as { created_by?: string } | null)?.created_by
  if (!ownerId || ownerId === voterUserId) return

  const title = (offer as { title?: string } | null)?.title?.trim() || 'Tu oferta'
  const shortTitle = title.length > 50 ? title.slice(0, 47) + '…' : title

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', voterUserId)
    .maybeSingle()
  const voterName = (profile as { display_name?: string | null } | null)?.display_name?.trim() || 'Alguien'

  await supabase.from('notifications').insert({
    user_id: ownerId,
    type: 'offer_like',
    title: 'Nuevo like',
    body: `${voterName} dio like a tu oferta: ${shortTitle}`,
    link: `/?o=${offerId}`,
  })
}

export async function POST(request: Request) {
  const ip = getClientIp(request)
  const limitResult = await enforceRateLimit(ip)
  if (!limitResult.success) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 })
  }
  try {
    const body = await request.json().catch(() => ({}))
    const parsed = voteInputSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'Solicitud inválida' }, { status: 400 })
    }
    const offerId = parsed.data.offerId.trim()
    const value: VoteValue = parsed.data.value
    if (!isValidUuid(offerId)) {
      return NextResponse.json({ ok: false, error: 'Solicitud inválida' }, { status: 400 })
    }

    const authHeader = request.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : null
    if (!token) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anonKey) {
      console.error('[votes] Missing Supabase URL or anon key')
      return NextResponse.json({ ok: false, error: 'Servicio no disponible' }, { status: 503 })
    }

    const userRes = await fetch(`${url}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
      },
    })
    if (!userRes.ok) {
      return NextResponse.json({ ok: false, error: 'Sesión inválida' }, { status: 401 })
    }
    const userData = await userRes.json().catch(() => null)
    const userId = userData?.id ?? null
    if (!userId) {
      return NextResponse.json({ ok: false, error: 'Sesión inválida' }, { status: 401 })
    }

    let supabase
    try {
      supabase = createServerClient()
    } catch (e) {
      console.error('[votes] Supabase server client:', e)
      return NextResponse.json({ ok: false, error: 'Servicio no disponible' }, { status: 503 })
    }

    const col = 'value' as const
    const { data: existing, error: selectError } = await supabase
      .from('offer_votes')
      .select(col)
      .eq('offer_id', offerId)
      .eq('user_id', userId)
      .maybeSingle()

    if (selectError) {
      console.error('[votes] select failed:', selectError.message)
      return NextResponse.json({ ok: false, error: 'Error al consultar voto' }, { status: 500 })
    }

    if (!existing) {
      const { error: insertError } = await supabase.from('offer_votes').insert({
        offer_id: offerId,
        user_id: userId,
        [col]: value,
      })
      if (insertError) {
        console.error('[votes] insert failed:', insertError.message)
        return NextResponse.json({ ok: false, error: 'No se pudo guardar el voto' }, { status: 500 })
      }
      if (value === 2) {
        notifyOfferOwnerLike(supabase, offerId, userId).catch((e) => console.error('[votes] notify owner:', e))
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
        return NextResponse.json({ ok: false, error: 'No se pudo actualizar el voto' }, { status: 500 })
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
      return NextResponse.json({ ok: false, error: 'No se pudo actualizar el voto' }, { status: 500 })
    }
    if (value === 2) {
      notifyOfferOwnerLike(supabase, offerId, userId).catch((e) => console.error('[votes] notify owner:', e))
    }

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (e) {
    console.error('[votes] error:', e)
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 })
  }
}
