import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireModeration } from '@/lib/server/requireAdmin'

/**
 * GET: listar reportes de ofertas (solo moderadores).
 * Query: ?status=pending|reviewed|dismissed|all
 */
export async function GET(request: Request) {
  const auth = await requireModeration(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'pending'

    const supabase = createServerClient()
    let query = supabase
      .from('offer_reports')
      .select(`
        id,
        offer_id,
        report_type,
        comment,
        status,
        created_at,
        offers(id, title, store, status),
        reporter_id
      `)
      .order('created_at', { ascending: false })

    if (status !== 'all') {
      query = query.eq('status', status)
    }

    const { data, error } = await query.limit(100)

    if (error) {
      console.error('[admin/reports] select failed:', error.message)
      return NextResponse.json({ error: 'Error al cargar reportes' }, { status: 500 })
    }

    return NextResponse.json(data ?? [])
  } catch (e) {
    console.error('[admin/reports] error:', e)
    return NextResponse.json({ error: 'Error al cargar reportes' }, { status: 500 })
  }
}

/**
 * PATCH: actualizar estado de un reporte (solo moderadores).
 * Body: { reportId: string, status: 'reviewed' | 'dismissed' }
 */
export async function PATCH(request: Request) {
  const auth = await requireModeration(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const reportId = typeof body?.reportId === 'string' ? body.reportId.trim() : null
    const status = body?.status === 'reviewed' || body?.status === 'dismissed' ? body.status : null

    if (!reportId || !status) {
      return NextResponse.json({ error: 'reportId y status son obligatorios' }, { status: 400 })
    }

    const supabase = createServerClient()
    const { error } = await supabase
      .from('offer_reports')
      .update({ status })
      .eq('id', reportId)

    if (error) {
      console.error('[admin/reports] update failed:', error.message)
      return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[admin/reports] patch error:', e)
    return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 })
  }
}
