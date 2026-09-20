import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireModeration } from '@/lib/server/requireAdmin'
import { resolveAndNormalizeAffiliateOfferUrl, validateAffiliatePaste } from '@/lib/affiliate'
import { normalizeCategoryForStorage, isValidCategoryId } from '@/lib/categories'
import { normalizeOfferImageUrl } from '@/lib/offerPath'
import { assertModeratorOwnsLock } from '@/lib/moderation/atomicModerationLock'
import {
  affiliatePasteValidationBaseline,
  originalOfferUrlToPersistOnAffiliatePaste,
} from '@/lib/moderation/originalOfferUrlPolicy'
import { shouldPersistLinkModOk } from '@/lib/moderation/affiliateReadinessContract'
import {
  buildOfferEditDiff,
  isMaterialOfferEdit,
  parseOfferEditBankCoupon,
  parseOfferEditMoney,
  parseOfferEditMsiMonths,
  sanitizeOfferEditCoupons,
  sanitizeOfferEditDescription,
  sanitizeOfferEditHunterComment,
} from '@/lib/moderation/offerEditContract'

function hasMissingColumn(error: { message?: string } | null, columnName: string): boolean {
  const msg = (error?.message ?? '').toLowerCase()
  return msg.includes(columnName.toLowerCase())
}

/**
 * PATCH: edición canónica de oferta en moderación.
 * No aprueba. Pending permanece pending.
 * Approved + cambio material (precio/URL/imagen) → demote a pending (revalidación humana).
 */
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
      .select(
        'id, status, title, price, original_price, description, hunter_comment, category, image_url, image_urls, offer_url, original_offer_url, coupons, bank_coupon, msi_months, locked_by, locked_at, link_mod_ok'
      )
      .eq('id', id)
      .single()

    const offerStatus = (offer as { status?: string })?.status
    if (!offer || (offerStatus !== 'pending' && offerStatus !== 'approved')) {
      return NextResponse.json({ error: 'Solo se pueden editar ofertas pendientes o aprobadas' }, { status: 400 })
    }

    const currentOfferUrl = (offer as { offer_url?: string | null }).offer_url?.trim() ?? ''
    const existingOriginal =
      (offer as { original_offer_url?: string | null }).original_offer_url?.trim() ?? ''
    const affiliatePaste = body?.affiliate_paste === true

    if (offerStatus === 'pending') {
      const lockCheck = assertModeratorOwnsLock(
        {
          locked_by: (offer as { locked_by?: string | null }).locked_by ?? null,
          locked_at: (offer as { locked_at?: string | null }).locked_at ?? null,
        },
        auth.user.id
      )
      if (!lockCheck.ok) {
        return NextResponse.json({ error: lockCheck.error }, { status: 409 })
      }
    }

    const payload: {
      title?: string
      price?: number
      original_price?: number | null
      offer_url?: string | null
      original_offer_url?: string | null
      description?: string | null
      hunter_comment?: string | null
      image_url?: string | null
      image_urls?: string[] | null
      category?: string | null
      coupons?: string | null
      bank_coupon?: string | null
      msi_months?: number | null
      link_mod_ok?: boolean | null
      status?: string
      locked_by?: null
      locked_at?: null
      snoozed_until?: null
    } = {}

    const afterSnapshot: Record<string, unknown> = {}

    if (typeof body.title === 'string') {
      const t = body.title.trim().slice(0, 500)
      if (t) {
        payload.title = t
        afterSnapshot.title = t
      }
    }

    if (body.price !== undefined) {
      const parsed = parseOfferEditMoney(body.price)
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 })
      }
      payload.price = parsed.value
      afterSnapshot.price = parsed.value
    }

    if (body.original_price !== undefined) {
      if (body.original_price === null || body.original_price === '') {
        payload.original_price = null
        afterSnapshot.original_price = null
      } else {
        const parsed = parseOfferEditMoney(body.original_price)
        if (!parsed.ok) {
          return NextResponse.json({ error: `Precio original: ${parsed.error}` }, { status: 400 })
        }
        payload.original_price = parsed.value
        afterSnapshot.original_price = parsed.value
      }
    }

    if (
      typeof payload.price === 'number' &&
      typeof payload.original_price === 'number' &&
      payload.original_price < payload.price
    ) {
      return NextResponse.json(
        { error: 'El precio original no puede ser menor que el precio actual' },
        { status: 400 }
      )
    }
    if (
      typeof payload.price === 'number' &&
      payload.original_price === undefined &&
      typeof (offer as { original_price?: number | null }).original_price === 'number' &&
      (offer as { original_price: number }).original_price < payload.price
    ) {
      return NextResponse.json(
        { error: 'El precio actual no puede superar el precio original guardado' },
        { status: 400 }
      )
    }

    if (typeof body.offer_url === 'string') {
      const pasted = body.offer_url.trim().slice(0, 2048)
      if (!pasted) {
        payload.offer_url = null
        payload.link_mod_ok = null
        afterSnapshot.offer_url = null
      } else if (affiliatePaste) {
        const bodyOriginal =
          typeof body.original_product_url === 'string' && body.original_product_url.trim()
            ? body.original_product_url.trim().slice(0, 2048)
            : null
        const validationBaseline = affiliatePasteValidationBaseline({
          existingOriginal,
          bodyOriginalProductUrl: bodyOriginal,
          currentOfferUrl,
        })
        if (!validationBaseline) {
          return NextResponse.json({ error: 'La oferta no tiene enlace original' }, { status: 400 })
        }
        const validation = validateAffiliatePaste(validationBaseline, pasted)
        if (!validation.valid) {
          return NextResponse.json(
            { error: validation.reason ?? 'El enlace no corresponde al producto', validation },
            { status: 400 }
          )
        }
        payload.offer_url = await resolveAndNormalizeAffiliateOfferUrl(pasted)
        const toPersist = originalOfferUrlToPersistOnAffiliatePaste({
          existingOriginal,
          bodyOriginalProductUrl: bodyOriginal,
        })
        if (toPersist) {
          payload.original_offer_url = toPersist
        }
        const originalForContract = (toPersist ?? existingOriginal) || validationBaseline
        if (
          !shouldPersistLinkModOk({
            offerUrl: payload.offer_url,
            originalOfferUrl: originalForContract,
            linkModOk: false,
          })
        ) {
          return NextResponse.json(
            {
              error:
                'El enlace afiliado no quedó en un permalink navegable/taggeado. Usa la URL original del producto.',
            },
            { status: 400 }
          )
        }
        payload.link_mod_ok = true
        afterSnapshot.offer_url = payload.offer_url
      } else {
        if (!existingOriginal) {
          payload.original_offer_url = pasted
        }
        payload.offer_url = await resolveAndNormalizeAffiliateOfferUrl(pasted)
        const origForReady =
          (typeof payload.original_offer_url === 'string' && payload.original_offer_url) ||
          existingOriginal ||
          null
        if (
          shouldPersistLinkModOk({
            offerUrl: payload.offer_url,
            originalOfferUrl: origForReady,
            linkModOk: false,
          })
        ) {
          payload.link_mod_ok = true
        }
        afterSnapshot.offer_url = payload.offer_url
      }
    }

    if (body.description !== undefined) {
      payload.description = sanitizeOfferEditDescription(body.description)
      afterSnapshot.description = payload.description
    }
    if (body.hunter_comment !== undefined) {
      payload.hunter_comment = sanitizeOfferEditHunterComment(body.hunter_comment)
      afterSnapshot.hunter_comment = payload.hunter_comment
    }
    if (body.coupons !== undefined) {
      payload.coupons = sanitizeOfferEditCoupons(body.coupons)
      afterSnapshot.coupons = payload.coupons
    }
    if (body.bank_coupon !== undefined) {
      const parsed = parseOfferEditBankCoupon(body.bank_coupon)
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 })
      }
      payload.bank_coupon = parsed.value
      afterSnapshot.bank_coupon = parsed.value
    }
    if (body.msi_months !== undefined) {
      const parsed = parseOfferEditMsiMonths(body.msi_months)
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 })
      }
      payload.msi_months = parsed.value
      afterSnapshot.msi_months = parsed.value
    }
    if (body.image_url !== undefined) {
      const raw = typeof body.image_url === 'string' ? body.image_url.trim() : ''
      payload.image_url = raw ? (normalizeOfferImageUrl(raw) ?? raw).slice(0, 2048) : null
      afterSnapshot.image_url = payload.image_url
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
        afterSnapshot.category = null
      } else if (typeof body.category === 'string') {
        const norm = normalizeCategoryForStorage(body.category.trim())
        if (!norm || !isValidCategoryId(norm)) {
          return NextResponse.json({ error: 'Categoría inválida' }, { status: 400 })
        }
        payload.category = norm
        afterSnapshot.category = norm
      }
    }

    const { fields, changes } = buildOfferEditDiff(
      {
        title: (offer as { title?: string | null }).title,
        price: (offer as { price?: number | null }).price,
        original_price: (offer as { original_price?: number | null }).original_price,
        description: (offer as { description?: string | null }).description,
        hunter_comment: (offer as { hunter_comment?: string | null }).hunter_comment,
        category: (offer as { category?: string | null }).category,
        image_url: (offer as { image_url?: string | null }).image_url,
        offer_url: (offer as { offer_url?: string | null }).offer_url,
        coupons: (offer as { coupons?: string | null }).coupons,
        bank_coupon: (offer as { bank_coupon?: string | null }).bank_coupon ?? null,
        msi_months: (offer as { msi_months?: number | null }).msi_months ?? null,
      },
      afterSnapshot
    )

    // image_urls no entra en el diff tipado; si solo cambian extras, aún persistimos.
    const hasImageUrlsWrite = body.image_urls !== undefined
    if (fields.length === 0 && !hasImageUrlsWrite && Object.keys(payload).length === 0) {
      return NextResponse.json({ ok: true, unchanged: true })
    }

    let demoted = false
    if (offerStatus === 'approved' && isMaterialOfferEdit(fields)) {
      // Cambio material en live → vuelve a pending para revalidación humana.
      payload.status = 'pending'
      payload.locked_by = null
      payload.locked_at = null
      payload.snoozed_until = null
      demoted = true
    }

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ ok: true, unchanged: true })
    }

    let { error } = await supabase.from('offers').update(payload).eq('id', id)
    if (
      error &&
      (hasMissingColumn(error, 'link_mod_ok') ||
        hasMissingColumn(error, 'original_offer_url') ||
        hasMissingColumn(error, 'coupons') ||
        hasMissingColumn(error, 'bank_coupon') ||
        hasMissingColumn(error, 'snoozed_until'))
    ) {
      if (hasMissingColumn(error, 'link_mod_ok')) delete payload.link_mod_ok
      if (hasMissingColumn(error, 'original_offer_url')) delete payload.original_offer_url
      if (hasMissingColumn(error, 'coupons')) delete payload.coupons
      if (hasMissingColumn(error, 'bank_coupon')) delete payload.bank_coupon
      if (hasMissingColumn(error, 'snoozed_until')) delete payload.snoozed_until
      ;({ error } = await supabase.from('offers').update(payload).eq('id', id))
    }
    if (error) {
      console.error('[update-offer]', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Audit trail en moderation_logs existente (action libre + metadata jsonb).
    if (fields.length > 0 || demoted || hasImageUrlsWrite) {
      const { error: logError } = await supabase.from('moderation_logs').insert({
        offer_id: id,
        user_id: auth.user.id,
        action: 'edited',
        previous_status: offerStatus,
        new_status: demoted ? 'pending' : offerStatus,
        reason: demoted ? 'edit_material_demote' : null,
        metadata: {
          fields: hasImageUrlsWrite && !fields.includes('image_urls')
            ? [...fields, 'image_urls']
            : fields,
          changes,
          demoted,
        },
      })
      if (logError) console.error('[update-offer] audit log:', logError.message)
    }

    return NextResponse.json({
      ok: true,
      demoted,
      fields,
      link_mod_ok: payload.link_mod_ok === true ? true : payload.link_mod_ok === false ? false : undefined,
      offer_url: payload.offer_url,
      title: payload.title,
      price: payload.price,
      original_price: payload.original_price,
      description: payload.description,
      category: payload.category,
      image_url: payload.image_url,
      image_urls: payload.image_urls,
      coupons: payload.coupons,
      bank_coupon: payload.bank_coupon,
      msi_months: payload.msi_months,
      status: demoted ? 'pending' : offerStatus,
    })
  } catch (e) {
    console.error('[update-offer]', e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
