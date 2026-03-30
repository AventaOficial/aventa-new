import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'
import { requireModeration } from '@/lib/server/requireAdmin'
import { recalculateUserReputation } from '@/lib/server/reputation'
import { buildOfferPublicPath } from '@/lib/offerPath'
import { sendOfferApprovedUserEmail } from '@/lib/email/sendModerationEmail'
import { resolveAndNormalizeAffiliateOfferUrl } from '@/lib/affiliate'

function hasMissingColumn(error: { message?: string } | null, columnName: string): boolean {
  const msg = (error?.message ?? '').toLowerCase()
  return msg.includes(columnName.toLowerCase())
}

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
      .select('status, created_by, title')
      .eq('id', id)
      .single()
    const previousStatus = offer?.status ?? 'pending'
    const createdBy = (offer as { created_by?: string } | null)?.created_by
    const offerTitle =
      typeof (offer as { title?: string } | null)?.title === 'string'
        ? String((offer as { title: string }).title).trim() || 'Tu oferta'
        : 'Tu oferta'
    const offerPublicPath = buildOfferPublicPath(id, offerTitle)

    if (status === 'approved') {
      const { data: row } = await supabase.from('offers').select('expires_at, offer_url').eq('id', id).single()
      const rawUrl = (row as { offer_url?: string | null })?.offer_url?.trim() ?? ''
      if (rawUrl && !batchApprove && body?.link_mod_ok !== true) {
        return NextResponse.json(
          { error: 'Confirma que el enlace coincide con el producto antes de aprobar.' },
          { status: 400 }
        )
      }
      const payload: {
        status: string
        expires_at?: string
        offer_url?: string
        link_mod_ok?: boolean | null
      } = { status: 'approved' }
      if (row?.expires_at == null) {
        payload.expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      }
      if (rawUrl) {
        const normalized = await resolveAndNormalizeAffiliateOfferUrl(rawUrl)
        if (normalized !== rawUrl) {
          payload.offer_url = normalized
        }
      }
      if (!batchApprove) {
        payload.link_mod_ok = rawUrl ? true : null
      }
      let { error: updateError } = await supabase.from('offers').update(payload).eq('id', id)
      if (updateError && hasMissingColumn(updateError, 'link_mod_ok')) {
        delete payload.link_mod_ok
        ;({ error: updateError } = await supabase.from('offers').update(payload).eq('id', id))
      }
      if (updateError) {
        console.error('[moderate-offer] update failed:', updateError.message)
        return NextResponse.json({ ok: false }, { status: 500 })
      }
    } else {
      const payload: { status: string; rejection_reason?: string | null } = { status: 'rejected' }
      if (reason !== undefined) payload.rejection_reason = reason
      const { error } = await supabase.from('offers').update(payload).eq('id', id)
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
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[moderate-offer] error:', e)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
