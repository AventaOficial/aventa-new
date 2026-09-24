import { NextResponse } from 'next/server';
import { recordCouponInteraction } from '@/lib/intelligence/coupon/store';
import { enforceRateLimit, getClientIp } from '@/lib/server/rateLimit';
import { createServerClient } from '@/lib/supabase/server';

const TYPES = new Set(['coupon_view', 'coupon_copy']);

export async function POST(request: Request, context: { params: Promise<{ offerId: string }> }) {
  const rl = await enforceRateLimit(`coupons:${getClientIp(request)}`);
  if (!rl.success) return NextResponse.json({ recorded: false }, { status: 429 });
  const { offerId } = await context.params;
  if (!offerId || offerId.length > 80) return NextResponse.json({ recorded: false }, { status: 400 });
  const body = (await request.json().catch(() => null)) as {
    code?: string;
    eventType?: string;
    idempotencyKey?: string;
  } | null;
  const eventType = body?.eventType ?? '';
  const code = body?.code?.trim() ?? '';
  const idempotencyKey = body?.idempotencyKey?.trim() ?? '';
  if (!TYPES.has(eventType) || code.length < 3 || code.length > 32 || idempotencyKey.length < 8) {
    return NextResponse.json({ recorded: false }, { status: 400 });
  }
  const result = await recordCouponInteraction(createServerClient(), {
    offerId,
    code,
    eventType: eventType as 'coupon_view' | 'coupon_copy',
    idempotencyKey,
  });
  return NextResponse.json({ ...result, conversion: 'not_connected' });
}
