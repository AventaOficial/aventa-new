import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { publicCouponsForOffer } from '@/lib/intelligence/coupon/store';
import { enforceRateLimit, getClientIp } from '@/lib/server/rateLimit';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const rl = await enforceRateLimit(`coupons:${getClientIp(request)}`);
  if (!rl.success) return NextResponse.json({ coupons: [], ready: false }, { status: 429 });
  const { id } = await context.params;
  if (!id || id.length > 80) return NextResponse.json({ coupons: [], ready: false }, { status: 400 });
  const result = await publicCouponsForOffer(createServerClient(), id);
  return NextResponse.json(result);
}
