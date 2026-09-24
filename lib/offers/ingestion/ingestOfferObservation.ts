/**
 * Sole server-side offer writer.
 * offers = canonical entity; offer_observations = append-only evidence.
 * Does not publish, mint, rank, or touch money paths.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveAndNormalizeAffiliateOfferUrl } from '@/lib/affiliate';
import {
  createOfferInputSchema,
  OFFER_MAX_IMAGES,
  sanitizeHunterComment,
  type CreateOfferInput,
} from '@/lib/contracts/offers';
import { normalizeBankCoupon } from '@/lib/bankCoupons';
import { normalizeCategoryForStorage } from '@/lib/categories';
import { inferOfferAutogroup } from '@/lib/offers/inferOfferAutogroup';
import { isUniqueViolation, releaseExpiredFingerprintSlot } from '@/lib/offers/findDuplicateOffer';
import { resolveIngestionIdentity } from '@/lib/offers/ingestion/identity';
import {
  mergePendingOfferFields,
  type PendingOfferSnapshot,
} from '@/lib/offers/ingestion/mergePendingOffer';
import { buildObservationIdempotencyKey } from '@/lib/offers/ingestion/observationIdempotency';
import { splitCoverAndExtras } from '@/lib/offers/selectOfferImages';
import { validatePublicOfferUrl } from '@/lib/server/validatePublicOfferUrl';

export type IngestObservationSource =
  | 'community:batch'
  | 'community:paste'
  | 'hunter'
  | 'admin'
  | 'bot'
  | 'crawler'
  | string;

/** Machine/admin-only columns. Never accept from public body. */
export type IngestOfferExtras = {
  bot_meta?: Record<string, unknown> | null;
  moderator_comment?: string | null;
  link_mod_ok?: boolean | null;
  conditions?: string | null;
  expires_at?: string | null;
  msi_months?: number | null;
};

export type IngestOfferObservationInput = {
  body: unknown;
  createdBy: string;
  source: IngestObservationSource;
  idempotencyKey?: string | null;
  confidence?: number | null;
  extractionMethod?: string | null;
  seller?: string | null;
  availability?: string | null;
  observedAt?: string | null;
  /**
   * reuse (batch/bot evidence): attach observation + merge pending.
   * reject (public API): attach observation then surface 409-compatible failure.
   */
  onDuplicate?: 'reuse' | 'reject';
  /** Batch paste adds tag `lote`. Public/bot do not. */
  forceLoteTag?: boolean;
  /** Public community may submit without URL. */
  allowMissingUrl?: boolean;
  /** Increment offers_submitted_count (community yes, bot no). */
  recordSubmissionCount?: boolean;
  /** Record price snapshot on create. */
  recordPriceSnapshot?: boolean;
  /** Privileged columns — never from untrusted public JSON. */
  offerExtras?: IngestOfferExtras | null;
};

export type IngestOfferObservationResult =
  | {
      ok: true;
      offerId: string;
      status: 'pending' | 'approved' | 'published' | string;
      created: boolean;
      observationId: string | null;
      observationReused: boolean;
      identityKey: string | null;
      identityStrategy: string;
      conflicts: string[];
      schemaDegraded: boolean;
    }
  | {
      ok: false;
      httpStatus: 400 | 409 | 500;
      error: string;
      issues?: Array<{ path: string; message: string }>;
      duplicate_offer_id?: string | null;
      duplicate_status?: string | null;
    };

type OfferRow = PendingOfferSnapshot & {
  id: string;
  status: string;
  ingestion_identity_key?: string | null;
  product_fingerprint?: string | null;
};

const OPTIONAL_OFFER_COLUMNS = [
  'ingestion_identity_key',
  'product_fingerprint',
  'original_offer_url',
  'hunter_comment',
  'bank_coupon',
  'tags',
  'bot_meta',
  'link_mod_ok',
  'moderator_comment',
  'conditions',
  'expires_at',
  'msi_months',
] as const;

function hasMissingColumn(error: { message?: string } | null, columnName: string): boolean {
  const msg = (error?.message ?? '').toLowerCase();
  return msg.includes(columnName.toLowerCase()) || msg.includes('does not exist');
}

function isSchemaMissing(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  const msg = (error.message ?? '').toLowerCase();
  return (
    msg.includes('offer_observations') ||
    msg.includes('ingestion_identity_key') ||
    msg.includes('does not exist') ||
    error.code === '42P01' ||
    error.code === '42703'
  );
}

async function findOfferByIngestionIdentity(
  supabase: SupabaseClient,
  identityKey: string,
): Promise<OfferRow | null> {
  const { data, error } = await supabase
    .from('offers')
    .select(
      'id, status, title, price, original_price, image_url, store, ingestion_identity_key, product_fingerprint',
    )
    .eq('ingestion_identity_key', identityKey)
    .in('status', ['pending', 'approved', 'published'])
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as OfferRow;
}

async function findOfferByProductFingerprint(
  supabase: SupabaseClient,
  fingerprint: string,
): Promise<OfferRow | null> {
  const { data, error } = await supabase
    .from('offers')
    .select(
      'id, status, title, price, original_price, image_url, store, ingestion_identity_key, product_fingerprint',
    )
    .eq('product_fingerprint', fingerprint)
    .in('status', ['pending', 'approved', 'published'])
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as OfferRow;
}

async function insertObservation(
  supabase: SupabaseClient,
  row: Record<string, unknown>,
): Promise<{ id: string | null; reused: boolean; degraded: boolean }> {
  const { data, error } = await supabase
    .from('offer_observations')
    .insert([row])
    .select('id')
    .single();

  if (!error && data && typeof (data as { id?: string }).id === 'string') {
    return { id: (data as { id: string }).id, reused: false, degraded: false };
  }

  if (error && isUniqueViolation(error)) {
    const { data: existing } = await supabase
      .from('offer_observations')
      .select('id')
      .eq('idempotency_key', row.idempotency_key as string)
      .maybeSingle();
    return {
      id: existing && typeof (existing as { id?: string }).id === 'string'
        ? (existing as { id: string }).id
        : null,
      reused: true,
      degraded: false,
    };
  }

  if (isSchemaMissing(error)) {
    return { id: null, reused: false, degraded: true };
  }

  console.error('[ingestOfferObservation] observation insert failed:', error?.message);
  return { id: null, reused: false, degraded: false };
}

async function applyPendingMerge(
  supabase: SupabaseClient,
  offer: OfferRow,
  incoming: {
    title?: string | null;
    price?: number | null;
    previousPrice?: number | null;
    imageUrl?: string | null;
    store?: string | null;
  },
): Promise<string[]> {
  if (offer.status !== 'pending') return [];
  const merge = mergePendingOfferFields(
    {
      title: offer.title,
      price: Number(offer.price),
      original_price: offer.original_price == null ? null : Number(offer.original_price),
      image_url: offer.image_url,
      store: offer.store,
    },
    incoming,
  );
  if (Object.keys(merge.patch).length === 0) return merge.conflicts;
  const { error } = await supabase
    .from('offers')
    .update(merge.patch)
    .eq('id', offer.id)
    .eq('status', 'pending');
  if (error) {
    console.error('[ingestOfferObservation] pending merge failed:', error.message);
  }
  return merge.conflicts;
}

async function insertOfferWithOptionalColumns(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<{ data: { id: string; status: string } | null; error: { message?: string; code?: string } | null }> {
  const attempt = { ...payload };
  let { data, error } = await supabase.from('offers').insert([attempt]).select('id, status').single();

  for (let retry = 0; error && retry < OPTIONAL_OFFER_COLUMNS.length; retry += 1) {
    const missing = OPTIONAL_OFFER_COLUMNS.find(
      (column) => column in attempt && hasMissingColumn(error, column),
    );
    if (!missing) break;
    delete attempt[missing];
    ({ data, error } = await supabase.from('offers').insert([attempt]).select('id, status').single());
  }

  if (data && typeof (data as { id?: string }).id === 'string') {
    return {
      data: {
        id: (data as { id: string }).id,
        status: typeof (data as { status?: string }).status === 'string'
          ? (data as { status: string }).status
          : 'pending',
      },
      error: null,
    };
  }
  return { data: null, error: error as { message?: string; code?: string } | null };
}

function applyExtras(
  payload: Record<string, unknown>,
  extras: IngestOfferExtras | null | undefined,
  bodyConditions: string | null,
): void {
  if (bodyConditions) payload.conditions = bodyConditions;
  if (!extras) return;
  if (extras.bot_meta) payload.bot_meta = extras.bot_meta;
  if (extras.moderator_comment?.trim()) payload.moderator_comment = extras.moderator_comment.trim();
  if (extras.link_mod_ok === true) payload.link_mod_ok = true;
  if (extras.conditions?.trim()) payload.conditions = extras.conditions.trim();
  if (extras.expires_at?.trim()) payload.expires_at = extras.expires_at.trim();
  if (extras.msi_months != null) payload.msi_months = extras.msi_months;
}

/**
 * Sole entry for creating/updating pending offers from any source.
 */
export async function ingestOfferObservation(
  supabase: SupabaseClient,
  input: IngestOfferObservationInput,
): Promise<IngestOfferObservationResult> {
  const onDuplicate = input.onDuplicate ?? 'reuse';
  const forceLoteTag = input.forceLoteTag === true;
  const allowMissingUrl = input.allowMissingUrl === true;
  const recordSubmissionCount = input.recordSubmissionCount !== false;
  const recordPriceSnapshot = input.recordPriceSnapshot !== false;

  const parsed = createOfferInputSchema.safeParse(input.body);
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
  const body: CreateOfferInput = parsed.data;
  const title = body.title.trim();
  const store = body.store.trim();
  if (!title || !store) {
    return { ok: false, httpStatus: 400, error: 'Título y tienda son obligatorios' };
  }

  const hasDiscount = body.hasDiscount !== false;
  const originalPrice = hasDiscount && body.original_price != null ? body.original_price : null;
  const price = body.price ?? originalPrice ?? 0;
  if (!Number.isFinite(price) || price < 0) {
    return { ok: false, httpStatus: 400, error: 'Precio inválido' };
  }

  const imageUrlRaw = typeof body.image_url === 'string' ? body.image_url.trim() : '';
  const imageUrlsArr = Array.isArray(body.image_urls)
    ? body.image_urls.filter((u: unknown): u is string => typeof u === 'string' && u.trim() !== '')
    : [];
  const { cover, extras } = splitCoverAndExtras(
    [imageUrlRaw, ...imageUrlsArr].filter((u) => u && u !== '/placeholder.png'),
  );
  const firstImage =
    cover ?? (imageUrlRaw && imageUrlRaw !== '/placeholder.png' ? imageUrlRaw : null) ?? '/placeholder.png';
  const extraImages = extras.slice(0, Math.max(0, OFFER_MAX_IMAGES - (firstImage === '/placeholder.png' ? 0 : 1)));

  const categoryRaw = typeof body.category === 'string' ? body.category : null;
  const categoryBase = normalizeCategoryForStorage(categoryRaw);
  const bankCoupon = normalizeBankCoupon(typeof body.bank_coupon === 'string' ? body.bank_coupon : null);
  const userTags = Array.isArray(body.tags)
    ? body.tags
        .filter((v: unknown): v is string => typeof v === 'string')
        .map((v: string) => v.trim().toLowerCase())
        .filter(Boolean)
    : [];
  const descriptionText =
    typeof body.description === 'string' && body.description.trim() ? body.description.trim() : '';
  const autogroup = inferOfferAutogroup({
    title,
    store,
    category: categoryBase,
    description: descriptionText,
    extraTags: userTags,
  });
  const category = autogroup.category ?? categoryBase ?? 'other';
  const tags = [
    ...new Set([...userTags, ...autogroup.tags, ...(forceLoteTag ? ['lote'] : [])]),
  ].slice(0, 20);

  const rawOfferUrl = typeof body.offer_url === 'string' ? body.offer_url.trim() : '';
  let originalOfferUrl: string | null = null;
  let offerUrlNormalized = '';

  if (rawOfferUrl) {
    const urlCheck = validatePublicOfferUrl(rawOfferUrl);
    if (!urlCheck.ok) {
      return { ok: false, httpStatus: 400, error: urlCheck.error };
    }
    originalOfferUrl = urlCheck.href;
    offerUrlNormalized = await resolveAndNormalizeAffiliateOfferUrl(urlCheck.href);
  } else if (!allowMissingUrl) {
    return {
      ok: false,
      httpStatus: 400,
      error: 'URL de oferta obligatoria para ingestión idempotente',
    };
  }

  const identity = offerUrlNormalized
    ? resolveIngestionIdentity(offerUrlNormalized)
    : originalOfferUrl
      ? resolveIngestionIdentity(originalOfferUrl)
      : { key: null, strategy: 'none' as const, productFingerprint: null, reason: 'missing_url' };

  const observedAt = input.observedAt?.trim() || new Date().toISOString();
  const confidence =
    typeof input.confidence === 'number' && Number.isFinite(input.confidence)
      ? input.confidence
      : null;
  const extractionMethod = input.extractionMethod?.trim() || null;
  const seller = input.seller?.trim() || null;
  const availability = input.availability?.trim() || null;
  const couponNote =
    typeof body.coupons === 'string' && body.coupons.trim() ? body.coupons.trim() : null;
  const bodyConditions =
    typeof body.conditions === 'string' && body.conditions.trim() ? body.conditions.trim() : null;

  const identityKeyForIdem =
    identity.key ??
    (offerUrlNormalized || originalOfferUrl
      ? `noid:${offerUrlNormalized || originalOfferUrl}`
      : `noid:title:${title.toLowerCase()}:${store.toLowerCase()}:${price}`);

  const idempotencyKey =
    input.idempotencyKey?.trim() ||
    buildObservationIdempotencyKey({
      identityKey: identityKeyForIdem,
      source: input.source,
      canonicalUrl: offerUrlNormalized || originalOfferUrl,
      title,
      imageUrl: firstImage === '/placeholder.png' ? null : firstImage,
      price,
      previousPrice: originalPrice,
      seller,
    });

  const insertPayload: Record<string, unknown> = {
    title,
    price,
    original_price:
      hasDiscount && originalPrice != null && Number.isFinite(originalPrice) ? originalPrice : null,
    store,
    category,
    status: 'pending',
    created_by: input.createdBy,
    image_url: firstImage,
    ...(extraImages.length > 0 ? { image_urls: extraImages } : {}),
    ...(offerUrlNormalized ? { offer_url: offerUrlNormalized } : {}),
    ...(originalOfferUrl ? { original_offer_url: originalOfferUrl } : {}),
    ...(identity.key ? { ingestion_identity_key: identity.key } : {}),
    ...(identity.productFingerprint ? { product_fingerprint: identity.productFingerprint } : {}),
    ...(descriptionText ? { description: descriptionText } : {}),
    ...(() => {
      const hunter = sanitizeHunterComment(body.hunter_comment);
      return hunter ? { hunter_comment: hunter } : {};
    })(),
    ...(typeof body.steps === 'string' && body.steps.trim() ? { steps: body.steps.trim() } : {}),
    ...(couponNote ? { coupons: couponNote } : {}),
    ...(bankCoupon ? { bank_coupon: bankCoupon } : {}),
    ...(tags.length > 0 ? { tags } : {}),
  };
  applyExtras(insertPayload, input.offerExtras, bodyConditions);

  let schemaDegraded = false;
  let conflicts: string[] = [];
  let offerId: string | null = null;
  let status = 'pending';
  let created = false;

  const { data, error } = await insertOfferWithOptionalColumns(supabase, insertPayload);

  if (data) {
    offerId = data.id;
    status = data.status;
    created = true;
  } else if (error && isUniqueViolation(error)) {
    // Race / existing identity — never SELECT→INSERT as primary guard; UNIQUE already decided.
    if (identity.productFingerprint) {
      await releaseExpiredFingerprintSlot(supabase, identity.productFingerprint);
      const retry = await insertOfferWithOptionalColumns(supabase, insertPayload);
      if (retry.data) {
        offerId = retry.data.id;
        status = retry.data.status;
        created = true;
      }
    }

    if (!offerId) {
      const existing =
        (identity.key ? await findOfferByIngestionIdentity(supabase, identity.key) : null) ??
        (identity.productFingerprint
          ? await findOfferByProductFingerprint(supabase, identity.productFingerprint)
          : null);

      if (!existing) {
        return {
          ok: false,
          httpStatus: 409,
          error: 'Esta oferta (o la misma URL de producto) ya está en Aventa.',
          duplicate_offer_id: null,
          duplicate_status: null,
        };
      }

      offerId = existing.id;
      status = existing.status;
      created = false;

      if (onDuplicate === 'reuse') {
        conflicts = await applyPendingMerge(supabase, existing, {
          title,
          price,
          previousPrice: originalPrice,
          imageUrl: firstImage === '/placeholder.png' ? null : firstImage,
          store,
        });
      }
    }
  } else if (error) {
    console.error('[ingestOfferObservation] offer insert failed:', error.message);
    schemaDegraded = isSchemaMissing(error);
    return { ok: false, httpStatus: 500, error: 'Error al crear la oferta' };
  }

  if (!offerId) {
    return { ok: false, httpStatus: 500, error: 'Error al crear la oferta' };
  }

  const obs = await insertObservation(supabase, {
    offer_id: offerId,
    identity_key: identity.key ?? `fallback:${offerId}`,
    idempotency_key: idempotencyKey,
    source: input.source,
    observed_at: observedAt,
    raw_url: originalOfferUrl,
    canonical_url: offerUrlNormalized || null,
    title,
    image_url: firstImage === '/placeholder.png' ? null : firstImage,
    price,
    previous_price: originalPrice,
    discount:
      originalPrice != null && originalPrice > price
        ? Number((((originalPrice - price) / originalPrice) * 100).toFixed(2))
        : null,
    seller,
    availability,
    coupon: couponNote,
    confidence,
    extraction_method: extractionMethod,
    metadata: {
      identityStrategy: identity.strategy,
      identityReason: identity.reason,
      conflicts,
      created,
      onDuplicate,
    },
  });
  schemaDegraded = schemaDegraded || obs.degraded;

  if (!created && onDuplicate === 'reject') {
    return {
      ok: false,
      httpStatus: 409,
      error: 'Esta oferta (o la misma URL de producto) ya está en Aventa.',
      duplicate_offer_id: offerId,
      duplicate_status: status,
    };
  }

  if (created) {
    if (recordPriceSnapshot) {
      try {
        const { recordOfferPriceSnapshot } = await import('@/lib/offers/priceHistory');
        void recordOfferPriceSnapshot(supabase, {
          offerId,
          price,
          originalPrice: hasDiscount ? originalPrice : null,
          source: 'create',
        });
      } catch {
        /* ignore */
      }
    }
    if (recordSubmissionCount) {
      try {
        await supabase.rpc('increment_offers_submitted_count', { uuid: input.createdBy });
      } catch {
        /* ignore */
      }
    }
  }

  return {
    ok: true,
    offerId,
    status,
    created,
    observationId: obs.id,
    observationReused: obs.reused,
    identityKey: identity.key,
    identityStrategy: identity.strategy,
    conflicts,
    schemaDegraded,
  };
}
