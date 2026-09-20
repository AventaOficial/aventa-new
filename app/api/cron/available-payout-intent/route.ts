/**
 * Cron: M5.4 AVAILABLE → payout_intent reconcile (reserve only).
 * Never executes provider. Never marks PAID. Requires CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireCronSecret } from '@/lib/server/cronAuth';
import { reconcileAvailablePayoutIntents } from '@/lib/rewards/availablePayoutIntent';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const limit = Number(
    url.searchParams.get('limit') ?? process.env.AVAILABLE_PAYOUT_INTENT_CRON_LIMIT ?? '50',
  );
  const lookbackHours = Number(
    url.searchParams.get('lookbackHours') ??
      process.env.AVAILABLE_PAYOUT_INTENT_LOOKBACK_HOURS ??
      '168',
  );

  const supabase = createServerClient();
  try {
    const result = await reconcileAvailablePayoutIntents(supabase, {
      limit: Number.isFinite(limit) ? limit : 50,
      lookbackHours: Number.isFinite(lookbackHours) ? lookbackHours : 168,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('[cron/available-payout-intent]', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'available payout intent reconcile failed',
      },
      { status: 500 },
    );
  }
}

export async function POST() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
