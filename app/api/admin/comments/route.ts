import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireModeration } from '@/lib/server/requireAdmin'
import { isValidUuid } from '@/lib/server/validateUuid'
import { recalculateUserReputation } from '@/lib/server/reputation'
import { sendCommentApprovedUserEmail } from '@/lib/email/sendModerationEmail'

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
    const { data: row, error: fetchErr } = await supabase
      .from('comments')
      .select('user_id, status, content, offer_id, offers(title)')
      .eq('id', commentId)
      .single()

    if (fetchErr || !row) {
      console.error('[admin/comments] fetch failed:', fetchErr?.message)
      return NextResponse.json({ error: 'Comentario no encontrado' }, { status: 404 })
    }

    const prevStatus = String((row as { status?: string }).status ?? '')
    const authorId = (row as { user_id?: string }).user_id
    const offerId = (row as { offer_id?: string }).offer_id
    const content = String((row as { content?: string }).content ?? '')
    const rawOffers = (row as { offers?: { title?: string | null } | { title?: string | null }[] | null }).offers
    const offerTitle =
      (Array.isArray(rawOffers) ? rawOffers[0]?.title : rawOffers?.title)?.trim() || 'Oferta'

    const { error } = await supabase
      .from('comments')
      .update({ status })
      .eq('id', commentId)

    if (error) {
      console.error('[admin/comments] update failed:', error.message)
      return NextResponse.json({ error: 'Error al actualizar comentario' }, { status: 500 })
    }

    if (authorId) recalculateUserReputation(authorId).catch(() => {})

    if (status === 'approved' && prevStatus === 'pending' && authorId && offerId) {
      const { data: userRow } = await supabase.auth.admin.getUserById(authorId)
      const email = userRow?.user?.email?.trim()
      if (email) {
        sendCommentApprovedUserEmail(email, offerTitle, offerId, content).catch((err) =>
          console.error('[admin/comments] email:', err)
        )
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[admin/comments] patch error:', e)
    return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 })
  }
}
