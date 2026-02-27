import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'
import { requireModeration } from '@/lib/server/requireAdmin'

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
    if (!id || !status) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }
    if (status === 'rejected' && !reason) {
      return NextResponse.json({ error: 'Motivo obligatorio al rechazar' }, { status: 400 })
    }
    const supabase = createServerClient()

    const { data: offer } = await supabase.from('offers').select('status').eq('id', id).single()
    const previousStatus = offer?.status ?? 'pending'

    if (status === 'approved') {
      const { data: row } = await supabase.from('offers').select('expires_at').eq('id', id).single()
      const payload: { status: string; expires_at?: string } = { status: 'approved' }
      if (row?.expires_at == null) {
        payload.expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      }
      const { error: updateError } = await supabase.from('offers').update(payload).eq('id', id)
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

    revalidatePath('/')
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[moderate-offer] error:', e)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
