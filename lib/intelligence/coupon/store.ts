import type { SupabaseClient } from '@supabase/supabase-js';
import { couponHistoryEvent } from '@/lib/intelligence/coupon/history';
import { relateCopyToOutbound } from '@/lib/intelligence/coupon/interaction';
import { parseCouponPaste } from '@/lib/intelligence/coupon/parse';
import { relateCoupon } from '@/lib/intelligence/coupon/relate';
import { COUPON_CONFIDENCE_CEILING, type CouponSnapshot, type CouponSourceClass } from '@/lib/intelligence/coupon/types';
import { classifyCoupon } from '@/lib/intelligence/coupon/validate';
import { recordCouponMetric } from '@/lib/intelligence/telemetry';

type CouponRow = {
  id: string;
  canonical_key: string;
  store: string;
  code: string;
  discount_type: CouponSnapshot['discountType'];
  discount_value: number | null;
  max_discount: number | null;
  minimum_purchase: number | null;
  currency: string | null;
  applies_to: CouponSnapshot['appliesTo'];
  restrictions: string | null;
  expires_at: string | null;
  status: CouponSnapshot['status'];
  verification_status: CouponSnapshot['verificationStatus'];
  confidence: number;
  source_class: CouponSourceClass;
  last_verified_at: string | null;
  first_seen_at: string;
};

function snapshotOf(row: CouponRow): CouponSnapshot {
  return {
    canonicalKey: row.canonical_key,
    store: row.store,
    code: row.code,
    discountType: row.discount_type,
    discountValue: row.discount_value == null ? null : Number(row.discount_value),
    maxDiscount: row.max_discount == null ? null : Number(row.max_discount),
    minimumPurchase: row.minimum_purchase == null ? null : Number(row.minimum_purchase),
    currency: row.currency,
    appliesTo: row.applies_to,
    restrictions: row.restrictions,
    expiresAt: row.expires_at,
    status: row.status,
    verificationStatus: row.verification_status,
    confidence: Number(row.confidence),
    sourceClass: row.source_class,
    lastVerifiedAt: row.last_verified_at,
  };
}

export async function saveCouponText(
  supabase: SupabaseClient,
  input: {
    text: string;
    sourceClass?: CouponSourceClass;
    acceptKeys?: string[];
    offerId?: string | null;
    offerStore?: string | null;
    now?: Date;
  },
): Promise<{ saved: string[]; rejected: number; error: string | null }> {
  const now = input.now ?? new Date();
  const sourceClass = input.sourceClass ?? 'user_paste';
  const parsed = parseCouponPaste(input.text, { now, sourceClass });
  recordCouponMetric('coupon_parsed');
  const accepted = new Set(input.acceptKeys ?? []);
  const drafts = parsed.drafts.filter((draft) => accepted.size === 0 || accepted.has(draft.canonicalKey ?? ''));
  const saved: string[] = [];
  let rejected = parsed.failures.length;

  for (const draft of drafts) {
    if (!draft.canonicalKey || !draft.store || !draft.code) {
      rejected += 1;
      recordCouponMetric('coupon_rejected');
      continue;
    }
    const { data: existing, error: readError } = await supabase
      .from('coupons')
      .select(
        'id, canonical_key, store, code, discount_type, discount_value, max_discount, minimum_purchase, currency, applies_to, restrictions, expires_at, status, verification_status, confidence, source_class, last_verified_at, first_seen_at',
      )
      .eq('canonical_key', draft.canonicalKey)
      .maybeSingle();
    if (readError) return { saved, rejected, error: readError.message };

    const previous = existing ? snapshotOf(existing as CouponRow) : null;
    const next: CouponSnapshot = {
      canonicalKey: draft.canonicalKey,
      store: draft.store,
      code: draft.code,
      discountType: draft.discountType,
      discountValue: draft.discountValue,
      maxDiscount: draft.maxDiscount,
      minimumPurchase: draft.minimumPurchase,
      currency: draft.currency,
      appliesTo: draft.appliesTo,
      restrictions: draft.restrictions,
      expiresAt: draft.expiresAt,
      status: previous?.status === 'verified' ? 'verified' : 'discovered',
      verificationStatus: previous?.verificationStatus ?? 'unverified',
      confidence: previous?.verificationStatus === 'verified'
        ? previous.confidence
        : COUPON_CONFIDENCE_CEILING[sourceClass],
      sourceClass,
      lastVerifiedAt: previous?.lastVerifiedAt ?? null,
    };
    const row = {
      canonical_key: next.canonicalKey,
      store: next.store,
      code: next.code,
      discount_type: next.discountType,
      discount_value: next.discountValue,
      max_discount: next.maxDiscount,
      minimum_purchase: next.minimumPurchase,
      currency: next.currency,
      applies_to: next.appliesTo,
      restrictions: next.restrictions,
      expires_at: next.expiresAt,
      status: next.status,
      verification_status: next.verificationStatus,
      confidence: next.confidence,
      source_class: next.sourceClass,
      source_url: draft.sourceUrl,
      first_seen_at: existing ? (existing as CouponRow).first_seen_at : now.toISOString(),
      last_seen_at: now.toISOString(),
      last_verified_at: next.lastVerifiedAt,
      updated_at: now.toISOString(),
    };
    const { data: upserted, error: writeError } = await supabase
      .from('coupons')
      .upsert(row, { onConflict: 'canonical_key' })
      .select('id')
      .single();
    if (writeError || !upserted) return { saved, rejected, error: writeError?.message ?? 'coupon_write_failed' };

    const event = couponHistoryEvent({ previous, next, day: now.toISOString().slice(0, 10) });
    await supabase.from('coupon_events').upsert(
      {
        coupon_id: (upserted as { id: string }).id,
        event_type: event.eventType,
        changes: event.changes,
        diff: event.diff,
        source_class: next.sourceClass,
        idempotency_key: event.idempotencyKey,
        observed_at: now.toISOString(),
      },
      { onConflict: 'idempotency_key', ignoreDuplicates: true },
    );
    const link = relateCoupon({
      appliesTo: next.appliesTo,
      store: next.store,
      offerId: input.offerId,
      offerStore: input.offerStore,
    });
    await supabase.from('coupon_links').upsert(
      {
        coupon_id: (upserted as { id: string }).id,
        target_type: link.targetType,
        target_key: link.targetKey,
        matched: link.matched,
        uncertain: link.uncertain,
        eligibility: link.eligibility,
      },
      { onConflict: 'coupon_id,target_type,target_key', ignoreDuplicates: true },
    );
    saved.push(next.canonicalKey);
    recordCouponMetric('coupon_saved');
  }
  return { saved, rejected, error: null };
}

export async function setCouponVerification(
  supabase: SupabaseClient,
  input: {
    canonicalKey: string;
    action: 'verify' | 'invalidate';
    offerId?: string | null;
    actorId?: string | null;
    actorRole?: string | null;
    now?: Date;
  },
): Promise<{ ok: boolean; error: string | null }> {
  const now = input.now ?? new Date();
  const { data, error } = await supabase
    .from('coupons')
    .select(
      'id, canonical_key, store, code, discount_type, discount_value, max_discount, minimum_purchase, currency, applies_to, restrictions, expires_at, status, verification_status, confidence, source_class, last_verified_at, first_seen_at',
    )
    .eq('canonical_key', input.canonicalKey)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'not_found' };
  const previous = snapshotOf(data as CouponRow);
  const next: CouponSnapshot = {
    ...previous,
    status: input.action === 'verify' ? 'verified' : 'invalid',
    verificationStatus: input.action === 'verify' ? 'verified' : 'failed',
    confidence: input.action === 'verify' ? COUPON_CONFIDENCE_CEILING.admin : 0,
    lastVerifiedAt: input.action === 'verify' ? now.toISOString() : previous.lastVerifiedAt,
    sourceClass: 'admin',
  };
  const { error: updateError } = await supabase
    .from('coupons')
    .update({
      status: next.status,
      verification_status: next.verificationStatus,
      confidence: next.confidence,
      last_verified_at: next.lastVerifiedAt,
      source_class: next.sourceClass,
      updated_at: now.toISOString(),
    })
    .eq('id', (data as CouponRow).id);
  if (updateError) return { ok: false, error: updateError.message };
  const event = couponHistoryEvent({ previous, next, day: now.toISOString().slice(0, 10) });
  await supabase.from('coupon_events').upsert(
    {
      coupon_id: (data as CouponRow).id,
      event_type: event.eventType,
      changes: event.changes,
      diff: event.diff,
      source_class: 'admin',
      actor_role: input.actorRole ?? null,
      actor_id: input.actorId ?? null,
      idempotency_key: event.idempotencyKey,
      observed_at: now.toISOString(),
    },
    { onConflict: 'idempotency_key', ignoreDuplicates: true },
  );
  recordCouponMetric(input.action === 'verify' ? 'coupon_verified' : 'coupon_rejected');
  if (input.action === 'verify' && input.offerId) {
    await supabase.from('coupon_links').upsert(
      {
        coupon_id: (data as CouponRow).id,
        target_type: 'offer',
        target_key: input.offerId,
        matched: true,
        uncertain: false,
        eligibility: 'verified_for_offer',
      },
      { onConflict: 'coupon_id,target_type,target_key' },
    );
  }
  return { ok: true, error: null };
}

export type PublicCoupon = {
  code: string;
  publicLabel: string;
  headline: string | null;
  restrictions: string | null;
  expiresAt: string | null;
};

export async function publicCouponsForOffer(
  supabase: SupabaseClient,
  offerId: string,
  now = new Date(),
): Promise<{ coupons: PublicCoupon[]; ready: boolean }> {
  const { data: offer, error: offerError } = await supabase
    .from('offers')
    .select('id, store')
    .eq('id', offerId)
    .maybeSingle();
  if (offerError) return { coupons: [], ready: false };
  const store = (offer as { store?: string | null } | null)?.store?.trim().toLowerCase() ?? null;
  const keys = [offerId];
  if (store) keys.push(store);
  const { data: links, error: linkError } = await supabase
    .from('coupon_links')
    .select('coupon_id, target_type, target_key, matched, uncertain, eligibility')
    .in('target_key', keys)
    .limit(40);
  if (linkError) return { coupons: [], ready: false };
  const ids = [
    ...new Set(
      (links ?? [])
        .filter((link) => {
          const row = link as { matched: boolean; uncertain: boolean; target_type: string; target_key: string };
          if (row.target_type === 'offer' && row.target_key === offerId) return row.matched || !row.uncertain;
          return row.matched && !row.uncertain;
        })
        .filter((link) => (link as { eligibility?: string }).eligibility === 'verified_for_offer')
        .map((link) => (link as { coupon_id: string }).coupon_id),
    ),
  ];
  if (ids.length === 0) return { coupons: [], ready: true };
  const { data: coupons, error } = await supabase
    .from('coupons')
    .select(
      'id, canonical_key, store, code, discount_type, discount_value, max_discount, minimum_purchase, currency, applies_to, restrictions, expires_at, status, verification_status, confidence, source_class, last_verified_at, first_seen_at',
    )
    .in('id', ids.slice(0, 20));
  if (error) return { coupons: [], ready: false };
  const visible: PublicCoupon[] = [];
  for (const row of coupons ?? []) {
    const snap = snapshotOf(row as CouponRow);
    const view = classifyCoupon(snap, now);
    if (!view.showAsAvailable) continue;
    const headline =
      snap.discountType === 'percent' && snap.discountValue != null
        ? `${snap.discountValue}% OFF`
        : snap.discountType === 'fixed' && snap.discountValue != null && snap.currency
          ? `${snap.discountValue} ${snap.currency} OFF`
          : snap.discountType === 'free_shipping'
            ? 'Envío gratis'
            : null;
    visible.push({
      code: snap.code,
      publicLabel: view.publicLabel,
      headline,
      restrictions: snap.restrictions,
      expiresAt: snap.expiresAt,
    });
  }
  return { coupons: visible, ready: true };
}

export async function recordCouponInteraction(
  supabase: SupabaseClient,
  input: {
    offerId: string;
    code: string;
    eventType: 'coupon_view' | 'coupon_copy' | 'outbound_open';
    idempotencyKey: string;
    correlationId?: string | null;
    relation?: 'none' | 'correlated' | 'ambiguous' | 'unknown';
  },
): Promise<{ correlationId: string | null; relation: string; recorded: boolean }> {
  const code = input.code.trim().toUpperCase();
  const { data: offer } = await supabase.from('offers').select('store').eq('id', input.offerId).maybeSingle();
  const store = (offer as { store?: string | null } | null)?.store?.trim().toLowerCase() ?? '';
  let couponQuery = supabase.from('coupons').select('id').eq('code', code);
  if (store) couponQuery = couponQuery.eq('store', store);
  const { data: coupon, error } = await couponQuery.limit(1).maybeSingle();
  if (error || !coupon) return { correlationId: null, relation: 'unknown', recorded: false };
  const couponId = (coupon as { id: string }).id;
  const correlationId = input.correlationId?.trim() || input.idempotencyKey;
  const relation = input.relation ?? 'none';
  const { error: insertError } = await supabase.from('coupon_interactions').upsert(
    {
      coupon_id: couponId,
      offer_id: input.offerId,
      event_type: input.eventType,
      correlation_id: correlationId,
      relation,
      idempotency_key: input.idempotencyKey.slice(0, 200),
    },
    { onConflict: 'idempotency_key', ignoreDuplicates: true },
  );
  if (insertError) return { correlationId: null, relation: 'unknown', recorded: false };
  return { correlationId, relation, recorded: true };
}

export async function recordCouponOutbound(
  supabase: SupabaseClient,
  input: { offerId: string; code: string; correlationId: string },
): Promise<{ relation: string; recorded: boolean }> {
  const { data: copy } = await supabase
    .from('coupon_interactions')
    .select('offer_id, correlation_id, observed_at')
    .eq('correlation_id', input.correlationId)
    .eq('event_type', 'coupon_copy')
    .limit(1)
    .maybeSingle();
  const row = copy as { offer_id: string; correlation_id: string; observed_at: string } | null;
  const judged = relateCopyToOutbound({
    copy: row
      ? { offerId: row.offer_id, correlationId: row.correlation_id, observedAt: row.observed_at }
      : null,
    outbound: { offerId: input.offerId, correlationId: input.correlationId, observedAt: new Date().toISOString() },
  });
  const saved = await recordCouponInteraction(supabase, {
    offerId: input.offerId,
    code: input.code,
    eventType: 'outbound_open',
    idempotencyKey: `out:${input.offerId}:${input.correlationId}`,
    correlationId: input.correlationId,
    relation: judged.relation,
  });
  return { relation: saved.relation, recorded: saved.recorded };
}
