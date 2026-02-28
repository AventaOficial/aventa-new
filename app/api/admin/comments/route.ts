import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireModeration } from '@/lib/server/requireAdmin'
import { isValidUuid } from '@/lib/server/validateUuid'
import { recalculateUserReputation } from '@/lib/server/reputation'

/** GET: listar comentarios para moderación (pending por defecto; moderadores ven todos por RLS) */
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
      .from('comments')
      .select(`
        id,
        offer_id,
        user_id,
        content,
        status,
        created_at,
        offers(id, title, store)
      `)
      .order('created_at', { ascending: false })

    if (status !== 'all') {
      if (status !== 'pending' && status !== 'approved' && status !== 'rejected') {
        return NextResponse.json({ error: 'status inválido' }, { status: 400 })
      }
      query = query.eq('status', status)
    }

    const { data, error } = await query.limit(200)

    if (error) {
      console.error('[admin/comments] select failed:', error.message)
      return NextResponse.json({ error: 'Error al cargar comentarios' }, { status: 500 })
    }

    return NextResponse.json(data ?? [])
  } catch (e) {
    console.error('[admin/comments] error:', e)
    return NextResponse.json({ error: 'Error al cargar comentarios' }, { status: 500 })
  }
}

/** PATCH: aprobar o rechazar comentario (solo moderador) */
export async function PATCH(request: Request) {
  const auth = await requireModeration(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const commentId = typeof body?.commentId === 'string' ? body.commentId.trim() : null
    const status = body?.status === 'approved' || body?.status === 'rejected' ? body.status : null

    if (!commentId || !status || !isValidUuid(commentId)) {
      return NextResponse.json({ error: 'commentId y status (approved|rejected) son obligatorios' }, { status: 400 })
    }

    const supabase = createServerClient()
    const { data: comment } = await supabase
      .from('comments')
      .select('user_id')
      .eq('id', commentId)
      .single()

    const { error } = await supabase
      .from('comments')
      .update({ status })
      .eq('id', commentId)

    if (error) {
      console.error('[admin/comments] update failed:', error.message)
      return NextResponse.json({ error: 'Error al actualizar comentario' }, { status: 500 })
    }

    const authorId = (comment as { user_id?: string } | null)?.user_id
    if (authorId) recalculateUserReputation(authorId).catch(() => {})

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[admin/comments] patch error:', e)
    return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 })
  }
}
