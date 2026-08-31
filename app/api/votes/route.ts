import { NextResponse } from 'next/server'
import { getClientIp, enforceRateLimit } from '@/lib/server/rateLimit'
import { isValidUuid } from '@/lib/server/validateUuid'
import type { SupabaseClient } from '@supabase/supabase-js'
import { voteInputSchema } from '@/lib/contracts/votes'
import { voteWeightPairForLevel, type VoteDirection } from '@/lib/votes/reputationWeights'
import { isPubliclyVotableOfferStatus } from '@/lib/votes/offerVoteEligibility'
import { buildOfferPublicPath } from '@/lib/offerPath'
import { maybeUnlockRewardsProgram } from '@/lib/rewards/unlock'
import {
  requireBearerCommunityUser,
  communityAuthFailureResponse,
} from '@/lib/server/requireCommunityUser'

const LIKES_MILESTONE = 50

async function getPositiveVoteCount(supabase: SupabaseClient, offerId: string): Promise<number> {
  const { count, error } = await supabase
    .from('offer_votes')
    .select('user_id', { count: 'exact', head: true })
    .eq('offer_id', offerId)
    .gt('value', 0)
  if (error) {
    console.error('[votes] count positive votes:', error.message)
    return 0
  }
  return count ?? 0
}

/** Notificación al autor cada 50 votos positivos (apoyos), sin duplicar el mismo hito. */
async function notifyOfferOwnerLikeMilestone(
  supabase: SupabaseClient,
  offerId: string,
  voterUserId: string
): Promise<void> {
  const count = await getPositiveVoteCount(supabase, offerId)
  if (count < LIKES_MILESTONE || count % LIKES_MILESTONE !== 0) return

  const { data: offer } = await supabase
    .from('offers')
    .select('created_by, title')
    .eq('id', offerId)
    .maybeSingle()
  const ownerId = (offer as { created_by?: string } | null)?.created_by
  if (!ownerId || ownerId === voterUserId) return

  const title = (offer as { title?: string } | null)?.title?.trim() || ''
  const path = buildOfferPublicPath(offerId, title)
  const link = `${path}?likes=${count}`

  const { data: existing } = await supabase
    .from('notifications')
    .select('id')
    .eq('user_id', ownerId)
    .eq('type', 'offer_likes_milestone')
    .eq('link', link)
    .limit(1)

  if (existing && existing.length > 0) return

  await supabase.from('notifications').insert({
    user_id: ownerId,
    type: 'offer_likes_milestone',
    title: `¡${count} apoyos en tu oferta!`,
    body: 'Tu oferta sigue sumando votos. Abre la publicación para ver el detalle.',
    link,
  })
}

function shouldCountAsNewUpvote(targetVal: number, existingVal: number | null | undefined): boolean {
  if (targetVal <= 0) return false
  if (existingVal == null || existingVal === undefined) return true
  return existingVal <= 0
}

export async function POST(request: Request) {
  const ip = getClientIp(request)
  const limitResult = await enforceRateLimit(ip)
  if (!limitResult.success) {
    return NextResponse.json(
      { ok: false, error: 'Demasiadas peticiones. Espera un minuto.' },
      { status: 429 }
    )
  }
  try {
    const body = await request.json().catch(() => ({}))
    const parsed = voteInputSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'Solicitud inválida' }, { status: 400 })
    }
    const offerId = parsed.data.offerId.trim()
    const direction = parsed.data.direction as VoteDirection
    if (!isValidUuid(offerId)) {
      return NextResponse.json({ ok: false, error: 'Solicitud inválida' }, { status: 400 })
    }

    const authResult = await requireBearerCommunityUser(request)
    if ('error' in authResult) {
      const res = communityAuthFailureResponse(authResult)
      const body = await res.json().catch(() => ({}))
      return NextResponse.json(
        { ok: false, error: (body as { error?: string }).error ?? authResult.error, code: authResult.code },
        { status: authResult.status },
      )
    }
    const { user, supabase } = authResult
    const userId = user.id

    const { data: offerRow, error: offerLookupError } = await supabase
      .from('offers')
      .select('created_by, status')
      .eq('id', offerId)
      .maybeSingle()
    if (offerLookupError) {
      console.error('[votes] offer lookup failed:', offerLookupError.message)
      return NextResponse.json({ ok: false, error: 'Error al consultar oferta' }, { status: 500 })
    }
    if (!offerRow) {
      return NextResponse.json({ ok: false, error: 'Oferta no encontrada' }, { status: 404 })
    }
    const offerStatus = (offerRow as { status?: string | null }).status
    if (!isPubliclyVotableOfferStatus(offerStatus)) {
      return NextResponse.json(
        { ok: false, error: 'Solo puedes votar ofertas publicadas' },
        { status: 403 }
      )
    }
    const offerOwnerId = (offerRow as { created_by?: string | null }).created_by
    if (offerOwnerId && offerOwnerId === userId) {
      return NextResponse.json(
        { ok: false, error: 'No puedes votar tu propia oferta' },
        { status: 403 }
      )
    }

    const { data: voterProfile } = await supabase
      .from('profiles')
      .select('reputation_level')
      .eq('id', userId)
      .maybeSingle()
    const repLevel = (voterProfile as { reputation_level?: number } | null)?.reputation_level
    const { up: wUp, down: wDown } = voteWeightPairForLevel(repLevel)
    const targetVal = direction === 'up' ? wUp : wDown

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

    const existingVal = existing ? (existing as Record<string, number>)[col] : null

    if (!existing) {
      const { error: insertError } = await supabase.from('offer_votes').insert({
        offer_id: offerId,
        user_id: userId,
        [col]: targetVal,
      })
      if (insertError) {
        console.error('[votes] insert failed:', insertError.message)
        return NextResponse.json({ ok: false, error: 'No se pudo guardar el voto' }, { status: 500 })
      }
      if (shouldCountAsNewUpvote(targetVal, null)) {
        notifyOfferOwnerLikeMilestone(supabase, offerId, userId).catch((e) =>
          console.error('[votes] notify milestone:', e)
        )
      }
      const { data: offerOwnerInsert } = await supabase
        .from('offers')
        .select('created_by')
        .eq('id', offerId)
        .maybeSingle()
      const ownerInsert = (offerOwnerInsert as { created_by?: string } | null)?.created_by
      if (ownerInsert) {
        maybeUnlockRewardsProgram(supabase, ownerInsert, userId).catch((e) =>
          console.error('[votes] rewards unlock:', e)
        )
      }
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    const wantUp = direction === 'up'
    const existingIsUp = existingVal != null && existingVal > 0
    if (existingIsUp === wantUp) {
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
      .update({ [col]: targetVal })
      .eq('offer_id', offerId)
      .eq('user_id', userId)
    if (updateError) {
      console.error('[votes] update failed:', updateError.message)
      return NextResponse.json({ ok: false, error: 'No se pudo actualizar el voto' }, { status: 500 })
    }
    if (shouldCountAsNewUpvote(targetVal, existingVal)) {
      notifyOfferOwnerLikeMilestone(supabase, offerId, userId).catch((e) =>
        console.error('[votes] notify milestone:', e)
      )
    }

    const { data: offerOwner } = await supabase
      .from('offers')
      .select('created_by')
      .eq('id', offerId)
      .maybeSingle()
    const ownerId = (offerOwner as { created_by?: string } | null)?.created_by
    if (ownerId) {
      maybeUnlockRewardsProgram(supabase, ownerId, userId).catch((e) =>
        console.error('[votes] rewards unlock:', e)
      )
    }

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (e) {
    console.error('[votes] error:', e)
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 })
  }
}
