import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getClientIp, enforceRateLimitCustom } from '@/lib/server/rateLimit'
import { isValidUuid } from '@/lib/server/validateUuid'

const REPORT_TYPES = ['precio_falso', 'no_es_oferta', 'expirada', 'spam', 'afiliado_oculto', 'otro'] as const

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request)
    const rl = await enforceRateLimitCustom(ip, 'reports')
    if (!rl.success) {
      return NextResponse.json({ error: 'Demasiados reportes. Espera un momento.' }, { status: 429 })
    }

    const authHeader = request.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
    if (!token) {
      return NextResponse.json({ error: 'Inicia sesión para reportar' }, { status: 401 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anonKey) {
      return NextResponse.json({ error: 'Error de configuración' }, { status: 500 })
    }

    const userRes = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    })
    if (!userRes.ok) {
      return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 })
    }
    const userData = await userRes.json().catch(() => null)
    const reporterId = userData?.id ?? null
    if (!reporterId) {
      return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const offerId = typeof body?.offerId === 'string' ? body.offerId.trim() : null
    const reportType = typeof body?.reportType === 'string' && REPORT_TYPES.includes(body.reportType as typeof REPORT_TYPES[number])
      ? body.reportType
      : null
    const comment = typeof body?.comment === 'string' ? body.comment.trim().slice(0, 500) || null : null

    if (!offerId || !reportType || !isValidUuid(offerId)) {
      return NextResponse.json({ error: 'offerId y reportType son obligatorios' }, { status: 400 })
    }

    const supabase = createServerClient()
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

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[reports] error:', e)
    return NextResponse.json({ error: 'Error al enviar el reporte' }, { status: 500 })
  }
}
