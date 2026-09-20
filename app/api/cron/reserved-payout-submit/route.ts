/**
 * Cron: M5.5 RESERVED → provider submit (sandbox initiated by default).
 * Confirmation / PAID owned by M5.6 provider-payout-confirm cron.
 * Requires CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireCronSecret } from '@/lib/server/cronAuth';
import { reconcileReservedPayoutSubmits } from '@/lib/rewards/reservedPayoutSubmit';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const limit = Number(
    url.searchParams.get('limit') ?? process.env.RESERVED_PAYOUT_SUBMIT_CRON_LIMIT ?? '50',
  );
  const lookbackHours = Number(
    url.searchParams.get('lookbackHours') ??
      process.env.RESERVED_PAYOUT_SUBMIT_LOOKBACK_HOURS ??
      '168',
  );

  const supabase = createServerClient();
  try {
    const submitBatch = await reconcileReservedPayoutSubmits(supabase, {
      limit: Number.isFinite(limit) ? limit : 50,
      lookbackHours: Number.isFinite(lookbackHours) ? lookbackHours : 168,
      stopBeforePaid: true,
    });

    return NextResponse.json({
      ok: true,
      submit: submitBatch,
      note: 'M5.5 submit only; PAID via M5.6 /api/cron/provider-payout-confirm',
    });
  } catch (error) {
    console.error('[cron/reserved-payout-submit]', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'reserved payout submit failed',
      },
      { status: 500 },
    );
  }
}

export async function POST() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
