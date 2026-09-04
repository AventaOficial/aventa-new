import { NextResponse } from 'next/server';
import { getClientIp, enforceRateLimitCustom } from '@/lib/server/rateLimit';
import { resolveOfferAutoApproveForUser } from '@/lib/server/offerAutoApprove';
import { normalizeCategoryForStorage } from '@/lib/categories';
import { normalizeBankCoupon } from '@/lib/bankCoupons';
import { createOfferInputSchema, OFFER_MAX_IMAGES } from '@/lib/contracts/offers';
import { splitCoverAndExtras } from '@/lib/offers/selectOfferImages';
import { resolveAndNormalizeAffiliateOfferUrl } from '@/lib/affiliate';
import { invalidateHomeFeedCache } from '@/lib/server/feedCache';
import { inferOfferAutogroup } from '@/lib/offers/inferOfferAutogroup';
import {
  requireBearerCommunityUser,
  communityAuthFailureResponse,
} from '@/lib/server/requireCommunityUser';
import { validatePublicOfferUrl } from '@/lib/server/validatePublicOfferUrl';
import { getUploadCooldownStatus } from '@/lib/server/uploadCooldown';

type OfferInsertPayload = {
  title: string;
  price: number;
  original_price: number | null;
  store: string;
  category?: string;
  status: 'pending' | 'approved';
  created_by: string;
  expires_at?: string;
  image_url: string;
  image_urls?: string[];
  msi_months?: number;
  offer_url?: string;
  description?: string;
  steps?: string;
  conditions?: string;
  coupons?: string;
  bank_coupon?: string;
  tags?: string[];
  moderator_comment?: string;
};

function hasMissingColumn(error: { message?: string } | null, columnName: string): boolean {
  const msg = (error?.message ?? '').toLowerCase();
  return msg.includes(columnName.toLowerCase());
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rl = await enforceRateLimitCustom(ip, 'offers');
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Demasiadas ofertas. Espera un minuto antes de subir otra.' },
        { status: 429 }
      );
    }

    const authResult = await requireBearerCommunityUser(request);
    if ('error' in authResult) {
      return communityAuthFailureResponse(authResult);
    }
    const { user, supabase } = authResult;
    const createdBy = user.id;

    const cooldown = await getUploadCooldownStatus(supabase, user);
    if (!cooldown.canUpload) {
      return NextResponse.json(
        {
          error: `Espera ${cooldown.remainingSeconds}s antes de publicar otra oferta.`,
          remainingSeconds: cooldown.remainingSeconds,
        },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = createOfferInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Datos inválidos para crear oferta',
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
        { status: 400 },
      );
    }
    const input = parsed.data;

    const title = input.title.trim();
    const store = input.store.trim();
    if (!title || !store) {
      return NextResponse.json(
        { error: 'Título y tienda son obligatorios' },
        { status: 400 }
      );
    }

    const hasDiscount = input.hasDiscount !== false;
    const originalPrice = hasDiscount && input.original_price != null ? input.original_price : null;
    /** Sin descuento no hay «precio antes»: lo que escribió el usuario es el precio final. */
    const price = input.price ?? originalPrice ?? 0;

    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: 'Precio inválido' }, { status: 400 });
    }

    const imageUrlRaw = typeof input.image_url === 'string' ? input.image_url.trim() : '';
    const imageUrlsArr = Array.isArray(input.image_urls)
      ? input.image_urls.filter((u: unknown): u is string => typeof u === 'string' && u.trim() !== '')
      : [];
    const { cover, extras } = splitCoverAndExtras(
      [imageUrlRaw, ...imageUrlsArr].filter((u) => u && u !== '/placeholder.png'),
    );
    const firstImage = cover ?? (imageUrlRaw && imageUrlRaw !== '/placeholder.png' ? imageUrlRaw : null) ?? '/placeholder.png';
    const extraImages = extras.slice(0, Math.max(0, OFFER_MAX_IMAGES - (firstImage === '/placeholder.png' ? 0 : 1)));
    const msiMonths = input.msi_months ?? null;

    let offerStatus: 'pending' | 'approved' = 'pending';
    let expiresAt: string | undefined;
    try {
      const auto = await resolveOfferAutoApproveForUser(supabase, createdBy);
      if (auto.approved) {
        offerStatus = 'approved';
        expiresAt = auto.expiresAt;
      }
    } catch {
      // mantener pending si falla lectura de perfil
    }

    const categoryRaw = typeof input.category === 'string' ? input.category : null;
    const categoryBase = normalizeCategoryForStorage(categoryRaw);
    const bankCoupon = normalizeBankCoupon(typeof input.bank_coupon === 'string' ? input.bank_coupon : null);
    const userTags = Array.isArray(input.tags)
      ? input.tags
          .filter((v: unknown): v is string => typeof v === 'string')
          .map((v: string) => v.trim().toLowerCase())
          .filter(Boolean)
      : [];
    const descriptionText =
      typeof input.description === 'string' && input.description.trim() ? input.description.trim() : '';
    const autogroup = inferOfferAutogroup({
      title,
      store,
      category: categoryBase,
      description: descriptionText,
      extraTags: userTags,
    });
    const category = autogroup.category ?? categoryBase;
    const tags = [...new Set([...userTags, ...autogroup.tags])].slice(0, 20);

    const rawOfferUrl = typeof input.offer_url === 'string' ? input.offer_url.trim() : '';
    let offerUrlNormalized = '';
    if (rawOfferUrl) {
      const urlCheck = validatePublicOfferUrl(rawOfferUrl);
      if (!urlCheck.ok) {
        return NextResponse.json({ error: urlCheck.error }, { status: 400 });
      }
      offerUrlNormalized = await resolveAndNormalizeAffiliateOfferUrl(urlCheck.href);
    }

    if (offerUrlNormalized) {
      const { findDuplicateOfferByUrl } = await import('@/lib/offers/findDuplicateOffer');
      const duplicate = await findDuplicateOfferByUrl(supabase, offerUrlNormalized);
      if (duplicate) {
        return NextResponse.json(
          {
            error: 'Esta oferta (o la misma URL de producto) ya está en Aventa.',
            duplicate_offer_id: duplicate.id,
            duplicate_status: duplicate.status,
          },
          { status: 409 },
        );
      }
    }

    const payload: OfferInsertPayload = {
      title,
      price,
      original_price: hasDiscount && originalPrice != null && Number.isFinite(originalPrice)
        ? originalPrice
        : null,
      store,
      ...(category ? { category } : { category: 'other' }),
      status: offerStatus,
      created_by: createdBy,
      ...(expiresAt && { expires_at: expiresAt }),
      image_url: firstImage,
      ...(extraImages.length > 0 && { image_urls: extraImages }),
      ...(msiMonths != null && { msi_months: msiMonths }),
      ...(offerUrlNormalized && { offer_url: offerUrlNormalized }),
      ...(typeof input.description === 'string' && input.description.trim() && {
        description: input.description.trim(),
      }),
      ...(typeof input.steps === 'string' && input.steps.trim() && { steps: input.steps.trim() }),
      ...(typeof input.conditions === 'string' && input.conditions.trim() && {
        conditions: input.conditions.trim(),
      }),
      ...(typeof input.coupons === 'string' && input.coupons.trim() && {
        coupons: input.coupons.trim(),
      }),
      ...(bankCoupon && { bank_coupon: bankCoupon }),
      ...(tags.length > 0 ? { tags } : {}),
      // moderator_comment solo lo escribe staff/bots vía APIs admin — no confiar en el body de usuario
    };

    let insertPayload: OfferInsertPayload = payload;
    let { data, error } = await supabase.from('offers').insert([insertPayload]).select('id').single();
    if (error && (hasMissingColumn(error, 'bank_coupon') || hasMissingColumn(error, 'tags'))) {
      const fallbackPayload: OfferInsertPayload = { ...payload };
      delete fallbackPayload.bank_coupon;
      delete fallbackPayload.tags;
      insertPayload = fallbackPayload;
      ({ data, error } = await supabase.from('offers').insert([insertPayload]).select('id').single());
    }

    if (error) {
      console.error('[offers] insert failed:', error.message, error.details, error.code);
      const devMessage = process.env.NODE_ENV === 'development' ? error.message : undefined;
      return NextResponse.json(
        { error: 'Error al crear la oferta', ...(devMessage && { details: devMessage }) },
        { status: 500 }
      );
    }

    const newOfferId = (data as { id?: string } | null)?.id;
    if (newOfferId) {
      const { recordOfferPriceSnapshot } = await import('@/lib/offers/priceHistory');
      void recordOfferPriceSnapshot(supabase, {
        offerId: newOfferId,
        price,
        originalPrice: payload.original_price,
        source: 'create',
      });
    }

    try {
      await supabase.rpc('increment_offers_submitted_count', { uuid: createdBy });
    } catch {}

    if (offerStatus === 'approved') {
      await invalidateHomeFeedCache();
    }

    return NextResponse.json({ id: data?.id, ok: true, status: offerStatus });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error('[offers] error:', err.message, e);
    const devMessage = process.env.NODE_ENV === 'development' ? err.message : undefined;
    return NextResponse.json(
      { error: 'Error al crear la oferta', ...(devMessage && { details: devMessage }) },
      { status: 500 }
    );
  }
}
