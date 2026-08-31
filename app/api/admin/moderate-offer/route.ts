import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'
import { requireModeration } from '@/lib/server/requireAdmin'
import { recalculateUserReputation } from '@/lib/server/reputation'
import { buildOfferPublicPath } from '@/lib/offerPath'
import { sendOfferApprovedUserEmail } from '@/lib/email/sendModerationEmail'
import {
  assessOfferAffiliateLink,
  resolveAndNormalizeAffiliateOfferUrl,
  isResolvedProductOfferUrl,
  validateAffiliatePaste,
} from '@/lib/affiliate'
import { assertOfferReadyForAffiliateApproval } from '@/lib/moderation/approveReadiness'
import { assertModeratorOwnsLock } from '@/lib/moderation/atomicModerationLock'
import { invalidateHomeFeedCache } from '@/lib/server/feedCache'
import { maybeUnlockRewardsProgram } from '@/lib/rewards/unlock'

function hasMissingColumn(error: { message?: string } | null, columnName: string): boolean {
  const msg = (error?.message ?? '').toLowerCase()
  return msg.includes(columnName.toLowerCase())
}

const LOCK_CLEAR = {
  locked_by: null,
  locked_at: null,
  snoozed_until: null,
} as const

export async function POST(request: Request) {
  const auth = await requireModeration(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const id = typeof body?.id === 'string' ? body.id : null
    const status = body?.status === 'approved' || body?.status === 'rejected' ? body.status : null
    const reason = typeof body?.reason === 'string' ? body.reason.trim() || null : null
    const modMessage = typeof body?.mod_message === 'string' ? body.mod_message.trim().slice(0, 500) || null : null
    const batchApprove = body?.batch_approve === true
    if (!id || !status) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }
    if (status === 'rejected' && !reason) {
      return NextResponse.json({ error: 'Motivo obligatorio al rechazar' }, { status: 400 })
    }

    const supabase = createServerClient()

    const { data: offer } = await supabase
      .from('offers')
      .select('status, created_by, title, locked_by, locked_at')
      .eq('id', id)
      .single()
    const previousStatus = offer?.status ?? 'pending'

    if (previousStatus === status) {
      return NextResponse.json({ ok: true, idempotent: true })
    }
    if (previousStatus !== 'pending') {
      return NextResponse.json({ error: 'La oferta ya fue moderada' }, { status: 409 })
    }

    if (!batchApprove) {
      const lockCheck = assertModeratorOwnsLock(
        {
          locked_by: (offer as { locked_by?: string | null }).locked_by ?? null,
          locked_at: (offer as { locked_at?: string | null }).locked_at ?? null,
        },
        auth.user.id
      )
      if (!lockCheck.ok) {
        return NextResponse.json({ error: lockCheck.error }, { status: 409 })
      }
    }

    const createdBy = (offer as { created_by?: string } | null)?.created_by
    const offerTitle =
      typeof (offer as { title?: string } | null)?.title === 'string'
        ? String((offer as { title: string }).title).trim() || 'Tu oferta'
        : 'Tu oferta'
    const offerPublicPath = buildOfferPublicPath(id, offerTitle)

    if (status === 'approved') {
      const { data: row } = await supabase
        .from('offers')
        .select('expires_at, offer_url, link_mod_ok')
        .eq('id', id)
        .single()
      const rawUrl = (row as { offer_url?: string | null })?.offer_url?.trim() ?? ''
      const linkModOk = (row as { link_mod_ok?: boolean | null }).link_mod_ok === true
      const originalForApproval =
        typeof body?.original_product_url === 'string' && body.original_product_url.trim()
          ? body.original_product_url.trim()
          : rawUrl

      const readiness = assertOfferReadyForAffiliateApproval({
        offerUrl: rawUrl,
        linkModOk,
        batchApprove,
        originalProductUrl: originalForApproval,
      })
      if (!readiness.ok) {
        return NextResponse.json({ error: readiness.error }, { status: 400 })
      }

      if (rawUrl && linkModOk && !batchApprove) {
        const pasteCheck = validateAffiliatePaste(originalForApproval, rawUrl)
        if (!pasteCheck.valid) {
          return NextResponse.json(
            { error: pasteCheck.reason ?? 'El enlace no corresponde al producto' },
            { status: 400 }
          )
        }
        const live = assessOfferAffiliateLink(rawUrl)
        if (live.needsAffiliate && !live.isTagged) {
          return NextResponse.json(
            { error: 'El enlace afiliado no tiene el tag de Aventa configurado.' },
            { status: 400 }
          )
        }
      }
      const payload: {
        status: string
        expires_at?: string
        offer_url?: string
        link_mod_ok?: boolean | null
        locked_by?: null
        locked_at?: null
        snoozed_until?: null
      } = { status: 'approved', ...LOCK_CLEAR }
      if (row?.expires_at == null) {
        payload.expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      }
      if (rawUrl) {
        // Al aprobar: intenta expandir acortadores y aplicar tags. Si ML/Amazon
        // bloquean el fetch (p. ej. 403 desde Vercel) y el moderador ya confirmó
        // el producto (link_mod_ok), no bloqueamos: guardamos lo mejor que haya.
        const normalized = await resolveAndNormalizeAffiliateOfferUrl(rawUrl)
        const isProduct = isResolvedProductOfferUrl(normalized)
        if (!isProduct && !batchApprove && !linkModOk) {
          return NextResponse.json(
            {
              error:
                'El enlace no apunta a un producto válido. Ábrelo, corrígelo y vuelve a guardar antes de aprobar.',
            },
            { status: 400 }
          )
        }
        if (isProduct) {
          payload.offer_url = normalized
        } else if (normalized !== rawUrl) {
          payload.offer_url = normalized
        }
      }
      if (!batchApprove) {
        payload.link_mod_ok = rawUrl ? true : null
      }
      let { data: updatedRow, error: updateError } = await supabase
        .from('offers')
        .update(payload)
        .eq('id', id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle()
      if (updateError && hasMissingColumn(updateError, 'link_mod_ok')) {
        delete payload.link_mod_ok
        ;({ data: updatedRow, error: updateError } = await supabase
          .from('offers')
          .update(payload)
          .eq('id', id)
          .eq('status', 'pending')
          .select('id')
          .maybeSingle())
      }
      if (updateError && hasMissingColumn(updateError, 'locked_by')) {
        delete payload.locked_by
        delete payload.locked_at
        delete payload.snoozed_until
        ;({ data: updatedRow, error: updateError } = await supabase
          .from('offers')
          .update(payload)
          .eq('id', id)
          .eq('status', 'pending')
          .select('id')
          .maybeSingle())
      }
      if (!updatedRow && !updateError) {
        return NextResponse.json({ ok: true, idempotent: true })
      }
      if (updateError) {
        console.error('[moderate-offer] update failed:', updateError.message)
        return NextResponse.json({ ok: false }, { status: 500 })
      }
    } else {
      const payload: {
        status: string
        rejection_reason?: string | null
        locked_by?: null
        locked_at?: null
        snoozed_until?: null
      } = { status: 'rejected', ...LOCK_CLEAR }
      if (reason !== undefined) payload.rejection_reason = reason
      let { data: updatedRow, error } = await supabase
        .from('offers')
        .update(payload)
        .eq('id', id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle()
      if (error && hasMissingColumn(error, 'locked_by')) {
        delete payload.locked_by
        delete payload.locked_at
        delete payload.snoozed_until
        ;({ data: updatedRow, error } = await supabase
          .from('offers')
          .update(payload)
          .eq('id', id)
          .eq('status', 'pending')
          .select('id')
          .maybeSingle())
      }
      if (!updatedRow && !error) {
        return NextResponse.json({ ok: true, idempotent: true })
      }
      if (error) {
        console.error('[moderate-offer] update failed:', error.message)
        return NextResponse.json({ ok: false }, { status: 500 })
      }
    }

    const { error: logError } = await supabase.from('moderation_logs').insert({
      offer_id: id,
      user_id: auth.user.id,
      action: status,
      previous_status: previousStatus,
      new_status: status,
      reason: reason ?? null,
    })
    if (logError) console.error('[moderate-offer] log insert failed:', logError.message)

    if (createdBy) recalculateUserReputation(createdBy).catch(() => {})

    if (status === 'approved' && previousStatus !== 'approved' && createdBy) {
      maybeUnlockRewardsProgram(supabase, createdBy, auth.user.id).catch((err) =>
        console.error('[moderate-offer] rewards unlock:', err),
      )
      const { data: modProfile } = await supabase.from('profiles').select('display_name').eq('id', auth.user.id).single()
      const modName = (modProfile as { display_name?: string } | null)?.display_name?.trim() || 'El equipo'
      const isOwner = auth.role === 'owner'
      const notifTitle = isOwner ? `CEO ${modName} aprobó tu oferta` : `Moderador ${modName} aprobó tu oferta`
      const notifBody = 'Ya está visible en el feed.' + (modMessage ? `\n\n${modMessage}` : '')
      await supabase.from('notifications').insert({
        user_id: createdBy,
        type: 'offer_approved',
        title: notifTitle,
        body: notifBody,
        link: offerPublicPath,
      }).then(({ error: notifErr }) => { if (notifErr) console.error('[moderate-offer] notification insert failed:', notifErr.message); })

      const { data: userRow } = await supabase.auth.admin.getUserById(createdBy)
      const email = userRow?.user?.email?.trim()
      if (email) {
        sendOfferApprovedUserEmail(email, offerTitle, id).catch((err) =>
          console.error('[moderate-offer] email:', err)
        )
      }
    }

    if (status === 'rejected' && createdBy) {
      const { data: modProfile } = await supabase.from('profiles').select('display_name').eq('id', auth.user.id).single()
      const modName = (modProfile as { display_name?: string } | null)?.display_name?.trim() || 'El equipo'
      const isOwner = auth.role === 'owner'
      const notifTitle = isOwner ? `CEO ${modName} rechazó tu oferta` : `Moderador ${modName} rechazó tu oferta`
      const notifBody = reason ? `Motivo: ${reason}` : 'Revisa los criterios y puedes volver a subir una nueva oferta.'
      await supabase.from('notifications').insert({
        user_id: createdBy,
        type: 'offer_rejected',
        title: notifTitle,
        body: notifBody,
        link: '/me',
      }).then(({ error: notifErr }) => { if (notifErr) console.error('[moderate-offer] reject notification insert failed:', notifErr.message); })
    }

    revalidatePath('/')
    if (status === 'approved' && previousStatus !== 'approved') {
      void invalidateHomeFeedCache()
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[moderate-offer] error:', e)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
