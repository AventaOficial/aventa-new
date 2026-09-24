import { NextResponse } from 'next/server';
import { requireModeration } from '@/lib/server/requireAdmin';
import { createServerClient } from '@/lib/supabase/server';
import { parseCouponPaste } from '@/lib/intelligence/coupon/parse';
import { saveCouponText, setCouponVerification } from '@/lib/intelligence/coupon/store';
import type { CouponSourceClass } from '@/lib/intelligence/coupon/types';

const SOURCE_CLASSES = new Set<CouponSourceClass>(['user_paste', 'bot', 'external_page', 'official_page', 'admin']);

export async function GET(request: Request) {
  const auth = await requireModeration(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const url = new URL(request.url);
  const supabase = createServerClient();
  const key = url.searchParams.get('canonicalKey')?.trim() || null;
  if (key) {
    const { data: coupon, error: couponError } = await supabase
      .from('coupons')
      .select(
        'id, canonical_key, store, code, discount_type, discount_value, minimum_purchase, currency, applies_to, restrictions, expires_at, status, verification_status, first_seen_at, last_seen_at, last_verified_at',
      )
      .eq('canonical_key', key)
      .maybeSingle();
    if (couponError) return NextResponse.json({ error: 'migration_pending', coupons: [] }, { status: 503 });
    if (!coupon) return NextResponse.json({ coupon: null, events: [], links: [] });
    const couponId = (coupon as { id: string }).id;
    const [{ data: events }, { data: links }] = await Promise.all([
      supabase
        .from('coupon_events')
        .select('event_type, changes, diff, actor_role, actor_id, observed_at')
        .eq('coupon_id', couponId)
        .order('observed_at', { ascending: false })
        .limit(80),
      supabase
        .from('coupon_links')
        .select('target_type, target_key, eligibility, matched, uncertain')
        .eq('coupon_id', couponId)
        .limit(40),
    ]);
    return NextResponse.json({ coupon, events: events ?? [], links: links ?? [], publishesOffers: false });
  }
  const store = url.searchParams.get('store')?.trim().toLowerCase() || null;
  let query = supabase
    .from('coupons')
    .select(
      'canonical_key, store, code, discount_type, discount_value, currency, applies_to, restrictions, expires_at, status, verification_status, confidence, source_class, last_seen_at, last_verified_at',
    )
    .order('last_seen_at', { ascending: false })
    .limit(50);
  if (store) query = query.eq('store', store);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'migration_pending', detail: error.message, coupons: [] }, { status: 503 });
  return NextResponse.json({ coupons: data ?? [], publishesOffers: false });
}

export async function POST(request: Request) {
  const auth = await requireModeration(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = (await request.json().catch(() => null)) as {
    text?: string;
    sourceClass?: CouponSourceClass;
    acceptKeys?: string[];
    offerId?: string;
    offerStore?: string;
    action?: 'verify' | 'invalidate';
    canonicalKey?: string;
  } | null;

  const supabase = createServerClient();
  if (body?.action && body.canonicalKey) {
    const result = await setCouponVerification(supabase, {
      canonicalKey: body.canonicalKey,
      action: body.action,
      offerId: body.offerId,
      actorId: auth.user.id,
      actorRole: auth.role,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.error === 'not_found' ? 404 : 503 });
    return NextResponse.json({ ok: true, publishesOffers: false });
  }

  const text = body?.text?.slice(0, 20_000) ?? '';
  if (!text.trim()) return NextResponse.json({ error: 'text required' }, { status: 400 });
  const sourceClass = body?.sourceClass && SOURCE_CLASSES.has(body.sourceClass) ? body.sourceClass : 'user_paste';
  const preview = parseCouponPaste(text, { sourceClass });
  const result = await saveCouponText(supabase, {
    text,
    sourceClass,
    acceptKeys: body?.acceptKeys,
    offerId: body?.offerId,
    offerStore: body?.offerStore,
  });
  if (result.error) {
    return NextResponse.json({ error: 'migration_pending', detail: result.error, preview }, { status: 503 });
  }
  return NextResponse.json({ ...result, preview, publishesOffers: false });
}
