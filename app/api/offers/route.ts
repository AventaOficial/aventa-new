import { NextResponse } from 'next/server';
import { getClientIp, enforceRateLimitCustom } from '@/lib/server/rateLimit';
import { resolveOfferAutoApproveForUser } from '@/lib/server/offerAutoApprove';
import {
  communityPersistStatus,
  evaluateCommunitySubmission,
  persistCommunitySupplyRun,
  recordCommunityDuplicateOnly,
  recordCommunityInvalidUrl,
  type CommunityQualityEvaluation,
} from '@/lib/hunter/supply';
import { normalizeCategoryForStorage } from '@/lib/categories';
import { normalizeBankCoupon } from '@/lib/bankCoupons';
import { createOfferInputSchema, OFFER_MAX_IMAGES } from '@/lib/contracts/offers';
import { splitCoverAndExtras } from '@/lib/offers/selectOfferImages';
import { resolveAndNormalizeAffiliateOfferUrl } from '@/lib/affiliate';
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
  original_offer_url?: string;
  product_fingerprint?: string;
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
    // FASE 10.1: mismo quality contract que machine (qualify → verifier → shadow).
    // Status productivo: siempre pending. Reputación no aprueba. No auto-publish.
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

    let reputation = null;
    try {
      reputation = await resolveOfferAutoApproveForUser(supabase, createdBy);
    } catch {
      reputation = null;
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
    let originalOfferUrl: string | null = null;
    if (rawOfferUrl) {
      const urlCheck = validatePublicOfferUrl(rawOfferUrl);
      if (!urlCheck.ok) {
        recordCommunityInvalidUrl();
        return NextResponse.json({ error: urlCheck.error }, { status: 400 });
      }
      originalOfferUrl = urlCheck.href;
      offerUrlNormalized = await resolveAndNormalizeAffiliateOfferUrl(urlCheck.href);
    }

    const { findDuplicateOfferByUrl, strongProductFingerprintForUrl, isUniqueViolation } =
      await import('@/lib/offers/findDuplicateOffer');
    const productFingerprint = offerUrlNormalized
      ? strongProductFingerprintForUrl(offerUrlNormalized)
      : null;

    const communityStartedAt = new Date().toISOString();
    let quality: CommunityQualityEvaluation | null = null;
    try {
      quality = evaluateCommunitySubmission(
        {
          title,
          store,
          price,
          originalPrice: hasDiscount && originalPrice != null ? originalPrice : null,
          imageUrl: firstImage === '/placeholder.png' ? null : firstImage,
          offerUrl: originalOfferUrl ?? offerUrlNormalized ?? null,
          description: typeof input.description === 'string' ? input.description : null,
          coupons: typeof input.coupons === 'string' ? input.coupons : null,
        },
        { reputation },
      );
    } catch {
      quality = null;
    }
    const offerStatus = quality ? communityPersistStatus(quality) : 'pending';

    if (offerUrlNormalized) {
      const duplicate = await findDuplicateOfferByUrl(supabase, offerUrlNormalized);
      if (duplicate) {
        recordCommunityDuplicateOnly();
        void persistCommunitySupplyRun({
          runId: `community:dup:${productFingerprint ?? offerUrlNormalized}`,
          startedAt: communityStartedAt,
          evaluation: quality,
          duplicate: true,
        });
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
      image_url: firstImage,
      ...(extraImages.length > 0 && { image_urls: extraImages }),
      ...(msiMonths != null && { msi_months: msiMonths }),
      ...(offerUrlNormalized && { offer_url: offerUrlNormalized }),
      ...(originalOfferUrl ? { original_offer_url: originalOfferUrl } : {}),
      ...(productFingerprint ? { product_fingerprint: productFingerprint } : {}),
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
    if (
      error &&
      (hasMissingColumn(error, 'bank_coupon') ||
        hasMissingColumn(error, 'tags') ||
        hasMissingColumn(error, 'product_fingerprint') ||
        hasMissingColumn(error, 'original_offer_url'))
    ) {
      const fallbackPayload: OfferInsertPayload = { ...payload };
      if (hasMissingColumn(error, 'bank_coupon')) delete fallbackPayload.bank_coupon;
      if (hasMissingColumn(error, 'tags')) delete fallbackPayload.tags;
      if (hasMissingColumn(error, 'product_fingerprint')) delete fallbackPayload.product_fingerprint;
      if (hasMissingColumn(error, 'original_offer_url')) delete fallbackPayload.original_offer_url;
      insertPayload = fallbackPayload;
      ({ data, error } = await supabase.from('offers').insert([insertPayload]).select('id').single());
    }

    if (error && isUniqueViolation(error) && offerUrlNormalized) {
      recordCommunityDuplicateOnly();
      void persistCommunitySupplyRun({
        runId: `community:dup:${productFingerprint ?? offerUrlNormalized}`,
        startedAt: communityStartedAt,
        evaluation: quality,
        duplicate: true,
      });
      const duplicate = await findDuplicateOfferByUrl(supabase, offerUrlNormalized);
      return NextResponse.json(
        {
          error: 'Esta oferta (o la misma URL de producto) ya está en Aventa.',
          duplicate_offer_id: duplicate?.id ?? null,
          duplicate_status: duplicate?.status ?? null,
        },
        { status: 409 },
      );
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
    void persistCommunitySupplyRun({
      runId: `community:${newOfferId ?? crypto.randomUUID()}`,
      startedAt: communityStartedAt,
      evaluation: quality,
      insertedPending: offerStatus === 'pending',
    });
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
