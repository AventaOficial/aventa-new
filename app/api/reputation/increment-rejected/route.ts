import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireModeration } from '@/lib/server/requireAdmin'

/**
 * POST: incrementa offers_rejected_count del creador de la oferta (reputación).
 * Solo ejecutable por moderadores. Responde 200 aunque el RPC falle.
 */
export async function POST(request: Request) {
  const auth = await requireModeration(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const userId = typeof body?.userId === 'string' ? body.userId : null
    if (!userId) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }
    const supabase = createServerClient()
    const { error } = await supabase.rpc('increment_offers_rejected_count', { uuid: userId })
    if (error) {
      console.error('[reputation] increment_offers_rejected_count failed:', error.message)
      return NextResponse.json({ ok: false }, { status: 200 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[reputation] increment-rejected error:', e)
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
