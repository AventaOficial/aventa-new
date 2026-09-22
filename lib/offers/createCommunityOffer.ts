import type { SupabaseClient } from '@supabase/supabase-js';
import { createOfferInputSchema, OFFER_MAX_IMAGES, sanitizeHunterComment, type CreateOfferInput } from '@/lib/contracts/offers';
import { splitCoverAndExtras } from '@/lib/offers/selectOfferImages';
import { resolveAndNormalizeAffiliateOfferUrl } from '@/lib/affiliate';
import { inferOfferAutogroup } from '@/lib/offers/inferOfferAutogroup';
import { normalizeCategoryForStorage } from '@/lib/categories';
import { normalizeBankCoupon } from '@/lib/bankCoupons';
import { validatePublicOfferUrl } from '@/lib/server/validatePublicOfferUrl';
import { resolveOfferAutoApproveForUser } from '@/lib/server/offerAutoApprove';
import {
  communityPersistStatus,
  evaluateCommunitySubmission,
  persistCommunitySupplyRun,
  recordCommunityDuplicateOnly,
  recordCommunityInvalidUrl,
  type CommunityQualityEvaluation,
} from '@/lib/hunter/supply';
import { recordShadowOutcomeFromAutonomous } from '@/lib/autonomous';

type OfferInsertPayload = {
  title: string;
  price: number;
  original_price: number | null;
  store: string;
  category?: string;
  status: 'pending';
  created_by: string;
  image_url: string;
  image_urls?: string[];
  msi_months?: number;
  offer_url?: string;
  original_offer_url?: string;
  product_fingerprint?: string;
  description?: string;
  hunter_comment?: string;
  steps?: string;
  conditions?: string;
  coupons?: string;
  bank_coupon?: string;
  tags?: string[];
};

function hasMissingColumn(error: { message?: string } | null, columnName: string): boolean {
  const msg = (error?.message ?? '').toLowerCase();
  return msg.includes(columnName.toLowerCase());
}

export type CreateCommunityOfferOk = { ok: true; id: string; status: 'pending' };
export type CreateCommunityOfferFail = {
  ok: false;
  httpStatus: 400 | 409 | 500;
  error: string;
  duplicate_offer_id?: string | null;
  duplicate_status?: string | null;
  issues?: Array<{ path: string; message: string }>;
};
export type CreateCommunityOfferResult = CreateCommunityOfferOk | CreateCommunityOfferFail;

/**
 * Misma persistencia que POST /api/offers: quality contract + siempre pending.
 * No publica. Pensado para lote de staff; el formulario público no usa esto.
 */
export async function createCommunityOfferPending(params: {
  supabase: SupabaseClient;
  createdBy: string;
  body: unknown;
  sourceDetail?: string;
}): Promise<CreateCommunityOfferResult> {
  const parsed = createOfferInputSchema.safeParse(params.body);
  if (!parsed.success) {
    return {
      ok: false,
      httpStatus: 400,
      error: 'Datos inválidos para crear oferta',
      issues: parsed.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    };
  }
  const input: CreateOfferInput = parsed.data;
  const title = input.title.trim();
  const store = input.store.trim();
  if (!title || !store) {
    return { ok: false, httpStatus: 400, error: 'Título y tienda son obligatorios' };
  }

  const hasDiscount = input.hasDiscount !== false;
  const originalPrice = hasDiscount && input.original_price != null ? input.original_price : null;
  const price = input.price ?? originalPrice ?? 0;
  if (!Number.isFinite(price) || price < 0) {
    return { ok: false, httpStatus: 400, error: 'Precio inválido' };
  }

  const imageUrlRaw = typeof input.image_url === 'string' ? input.image_url.trim() : '';
  const imageUrlsArr = Array.isArray(input.image_urls)
    ? input.image_urls.filter((u: unknown): u is string => typeof u === 'string' && u.trim() !== '')
    : [];
  const { cover, extras } = splitCoverAndExtras(
    [imageUrlRaw, ...imageUrlsArr].filter((u) => u && u !== '/placeholder.png'),
  );
  const firstImage =
    cover ?? (imageUrlRaw && imageUrlRaw !== '/placeholder.png' ? imageUrlRaw : null) ?? '/placeholder.png';
  const extraImages = extras.slice(0, Math.max(0, OFFER_MAX_IMAGES - (firstImage === '/placeholder.png' ? 0 : 1)));
  const msiMonths = input.msi_months ?? null;

  let reputation = null;
  try {
    reputation = await resolveOfferAutoApproveForUser(params.supabase, params.createdBy);
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
  const tags = [...new Set([...userTags, ...autogroup.tags, 'lote'])].slice(0, 20);

  const rawOfferUrl = typeof input.offer_url === 'string' ? input.offer_url.trim() : '';
  let offerUrlNormalized = '';
  let originalOfferUrl: string | null = null;
  if (rawOfferUrl) {
    const urlCheck = validatePublicOfferUrl(rawOfferUrl);
    if (!urlCheck.ok) {
      recordCommunityInvalidUrl();
      return { ok: false, httpStatus: 400, error: urlCheck.error };
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
    const duplicate = await findDuplicateOfferByUrl(params.supabase, offerUrlNormalized);
    if (duplicate) {
      recordCommunityDuplicateOnly();
      void persistCommunitySupplyRun({
        runId: `community:dup:${productFingerprint ?? offerUrlNormalized}`,
        startedAt: communityStartedAt,
        evaluation: quality,
        duplicate: true,
      });
      return {
        ok: false,
        httpStatus: 409,
        error: 'Esta oferta (o la misma URL de producto) ya está en Aventa.',
        duplicate_offer_id: duplicate.id,
        duplicate_status: duplicate.status,
      };
    }
  }

  const payload: OfferInsertPayload = {
    title,
    price,
    original_price:
      hasDiscount && originalPrice != null && Number.isFinite(originalPrice) ? originalPrice : null,
    store,
    ...(category ? { category } : { category: 'other' }),
    status: offerStatus,
    created_by: params.createdBy,
    image_url: firstImage,
    ...(extraImages.length > 0 && { image_urls: extraImages }),
    ...(msiMonths != null && { msi_months: msiMonths }),
    ...(offerUrlNormalized && { offer_url: offerUrlNormalized }),
    ...(originalOfferUrl ? { original_offer_url: originalOfferUrl } : {}),
    ...(productFingerprint ? { product_fingerprint: productFingerprint } : {}),
    ...(descriptionText && { description: descriptionText }),
    ...(() => {
      const hunter = sanitizeHunterComment(input.hunter_comment);
      return hunter ? { hunter_comment: hunter } : {};
    })(),
    ...(typeof input.steps === 'string' && input.steps.trim() && { steps: input.steps.trim() }),
    ...(typeof input.conditions === 'string' && input.conditions.trim() && {
      conditions: input.conditions.trim(),
    }),
    ...(typeof input.coupons === 'string' && input.coupons.trim() && { coupons: input.coupons.trim() }),
    ...(bankCoupon && { bank_coupon: bankCoupon }),
    ...(tags.length > 0 ? { tags } : {}),
  };

  let insertPayload: OfferInsertPayload = payload;
  let { data, error } = await params.supabase.from('offers').insert([insertPayload]).select('id').single();
  if (
    error &&
    (hasMissingColumn(error, 'bank_coupon') ||
      hasMissingColumn(error, 'tags') ||
      hasMissingColumn(error, 'product_fingerprint') ||
      hasMissingColumn(error, 'original_offer_url') ||
      hasMissingColumn(error, 'hunter_comment'))
  ) {
    const fallbackPayload: OfferInsertPayload = { ...payload };
    if (hasMissingColumn(error, 'bank_coupon')) delete fallbackPayload.bank_coupon;
    if (hasMissingColumn(error, 'tags')) delete fallbackPayload.tags;
    if (hasMissingColumn(error, 'product_fingerprint')) delete fallbackPayload.product_fingerprint;
    if (hasMissingColumn(error, 'original_offer_url')) delete fallbackPayload.original_offer_url;
    if (hasMissingColumn(error, 'hunter_comment')) delete fallbackPayload.hunter_comment;
    insertPayload = fallbackPayload;
    ({ data, error } = await params.supabase.from('offers').insert([insertPayload]).select('id').single());
  }

  if (error && isUniqueViolation(error) && offerUrlNormalized) {
    recordCommunityDuplicateOnly();
    void persistCommunitySupplyRun({
      runId: `community:dup:${productFingerprint ?? offerUrlNormalized}`,
      startedAt: communityStartedAt,
      evaluation: quality,
      duplicate: true,
    });
    const duplicate = await findDuplicateOfferByUrl(params.supabase, offerUrlNormalized);
    return {
      ok: false,
      httpStatus: 409,
      error: 'Esta oferta (o la misma URL de producto) ya está en Aventa.',
      duplicate_offer_id: duplicate?.id ?? null,
      duplicate_status: duplicate?.status ?? null,
    };
  }

  if (error) {
    console.error('[offer-batch] insert failed:', error.message, error.details, error.code);
    return { ok: false, httpStatus: 500, error: 'Error al crear la oferta' };
  }

  const newOfferId = (data as { id?: string } | null)?.id;
  if (!newOfferId) {
    return { ok: false, httpStatus: 500, error: 'Error al crear la oferta' };
  }

  void persistCommunitySupplyRun({
    runId: `community:${newOfferId}`,
    startedAt: communityStartedAt,
    evaluation: quality,
    insertedPending: offerStatus === 'pending',
  });
  if (quality?.autonomousResult) {
    void recordShadowOutcomeFromAutonomous({
      offerId: newOfferId,
      result: quality.autonomousResult,
      sourceId: 'community',
      sourceFamily: 'community',
      sourceDetail: params.sourceDetail ?? 'community:batch',
      fingerprint: productFingerprint,
      qualification: quality.qualification,
      creatorId: params.createdBy,
    });
  }
  const { recordOfferPriceSnapshot } = await import('@/lib/offers/priceHistory');
  void recordOfferPriceSnapshot(params.supabase, {
    offerId: newOfferId,
    price,
    originalPrice: payload.original_price,
    source: 'create',
  });
  try {
    await params.supabase.rpc('increment_offers_submitted_count', { uuid: params.createdBy });
  } catch {
    /* ignore */
  }

  return { ok: true, id: newOfferId, status: 'pending' };
}
