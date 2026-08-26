import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireModeration } from '@/lib/server/requireAdmin'
import { resolveAndNormalizeAffiliateOfferUrl } from '@/lib/affiliate'
import { normalizeCategoryForStorage, isValidCategoryId } from '@/lib/categories'
import { normalizeOfferImageUrl } from '@/lib/offerPath'

/** PATCH: editar oferta en moderación. Campos: title, offer_url, description, image_url, category. */
export async function PATCH(request: Request) {
  const auth = await requireModeration(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const id = typeof body?.id === 'string' ? body.id : null
    if (!id) {
      return NextResponse.json({ error: 'id obligatorio' }, { status: 400 })
    }

    const supabase = createServerClient()
    const { data: offer } = await supabase
      .from('offers')
      .select('id, status')
      .eq('id', id)
      .single()

    const offerStatus = (offer as { status?: string })?.status
    if (!offer || (offerStatus !== 'pending' && offerStatus !== 'approved')) {
      return NextResponse.json({ error: 'Solo se pueden editar ofertas pendientes o aprobadas' }, { status: 400 })
    }

    const payload: {
      title?: string
      offer_url?: string | null
      description?: string | null
      image_url?: string | null
      image_urls?: string[] | null
      category?: string | null
    } = {}
    if (typeof body.title === 'string') {
      const t = body.title.trim().slice(0, 500)
      if (t) payload.title = t
    }
    if (typeof body.offer_url === 'string') {
      const u = body.offer_url.trim().slice(0, 2048)
      payload.offer_url = u ? await resolveAndNormalizeAffiliateOfferUrl(u) : null
    }
    if (body.description !== undefined) {
      payload.description = typeof body.description === 'string' ? body.description.trim().slice(0, 2000) || null : null
    }
    if (body.image_url !== undefined) {
      const raw = typeof body.image_url === 'string' ? body.image_url.trim() : ''
      payload.image_url = raw ? (normalizeOfferImageUrl(raw) ?? raw).slice(0, 2048) : null
    }
    if (body.image_urls !== undefined) {
      const rawList = Array.isArray(body.image_urls) ? body.image_urls : []
      const cleaned = rawList
        .filter((u: unknown): u is string => typeof u === 'string' && u.trim().startsWith('http'))
        .map((u: string) => (normalizeOfferImageUrl(u.trim()) ?? u.trim()).slice(0, 4096))
        .filter((u: string, i: number, arr: string[]) => arr.indexOf(u) === i)
        .slice(0, 8)
      payload.image_urls = cleaned.length > 0 ? cleaned : null
    }
    if (body.category !== undefined) {
      if (body.category === null || body.category === '') {
        payload.category = null
      } else if (typeof body.category === 'string') {
        const norm = normalizeCategoryForStorage(body.category.trim())
        if (!norm || !isValidCategoryId(norm)) {
          return NextResponse.json({ error: 'Categoría inválida' }, { status: 400 })
        }
        payload.category = norm
      }
    }

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ ok: true })
    }

    const { error } = await supabase.from('offers').update(payload).eq('id', id)
    if (error) {
      console.error('[update-offer]', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[update-offer]', e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
