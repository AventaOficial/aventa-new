import { NextResponse } from 'next/server'
import { getClientIp, enforceRateLimitCustom } from '@/lib/server/rateLimit'
import { isValidUuid } from '@/lib/server/validateUuid'
import {
  requireBearerCommunityUser,
  communityAuthFailureResponse,
} from '@/lib/server/requireCommunityUser'

const REPORT_TYPES = ['precio_falso', 'no_es_oferta', 'expirada', 'spam', 'afiliado_oculto', 'otro'] as const

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request)
    const rl = await enforceRateLimitCustom(ip, 'reports')
    if (!rl.success) {
      return NextResponse.json({ error: 'Demasiados reportes. Espera un momento.' }, { status: 429 })
    }

    const authResult = await requireBearerCommunityUser(request)
    if ('error' in authResult) {
      return communityAuthFailureResponse(authResult)
    }
    const { user, supabase } = authResult
    const reporterId = user.id

    const body = await request.json().catch(() => ({}))
    const offerId = typeof body?.offerId === 'string' ? body.offerId.trim() : null
    const reportType = typeof body?.reportType === 'string' && REPORT_TYPES.includes(body.reportType as typeof REPORT_TYPES[number])
      ? body.reportType
      : null
    const comment = typeof body?.comment === 'string' ? body.comment.trim().slice(0, 500) || null : null

    if (!offerId || !reportType || !isValidUuid(offerId)) {
      return NextResponse.json({ error: 'offerId y reportType son obligatorios' }, { status: 400 })
    }
    if (!comment || comment.length < 100) {
      return NextResponse.json({ error: 'Escribe al menos 100 caracteres describiendo el problema para evitar spam.' }, { status: 400 })
    }

    const { data: existing } = await supabase
      .from('offer_reports')
      .select('id')
      .eq('offer_id', offerId)
      .eq('reporter_id', reporterId)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ error: 'Ya reportaste esta oferta.' }, { status: 409 })
    }

    const { error } = await supabase.from('offer_reports').insert({
      offer_id: offerId,
      reporter_id: reporterId,
      report_type: reportType,
      comment,
    })

    if (error) {
      console.error('[reports] insert failed:', error.message)
      return NextResponse.json({ error: 'Error al enviar el reporte' }, { status: 500 })
    }

    const { error: notifErr } = await supabase.from('notifications').insert({
      user_id: reporterId,
      type: 'report_received',
      title: 'Reporte recibido',
      body: 'Recibimos tu reporte. Lo revisamos pronto.',
      link: null,
    })
    if (notifErr) console.error('[reports] notification insert failed:', notifErr.message)

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[reports] error:', e)
    return NextResponse.json({ error: 'Error al enviar el reporte' }, { status: 500 })
  }
}
