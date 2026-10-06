import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { incrementHumanOfferCounter } from '@/lib/server/reputation'
import { requireModeration } from '@/lib/server/requireAdmin'

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
    const outcome = await incrementHumanOfferCounter(supabase, userId, 'increment_offers_approved_count')
    if (outcome === 'skipped') {
      return NextResponse.json({ ok: true, skipped: 'non_human_actor' })
    }
    if (outcome === 'error') {
      console.error('[reputation] increment_offers_approved_count failed')
      return NextResponse.json({ ok: false }, { status: 200 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[reputation] increment-approved error:', e)
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
