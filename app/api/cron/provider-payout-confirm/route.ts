/**
 * Cron: M5.6 SUBMITTED|UNKNOWN → reconcile → applyProviderConfirmation → PAID.
 * Never submit. Never direct reward UPDATE. Bounded. Requires CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireCronSecret } from '@/lib/server/cronAuth';
import { reconcileConfirmablePayouts } from '@/lib/rewards/providerConfirmationAutomation';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const limit = Number(
    url.searchParams.get('limit') ?? process.env.PROVIDER_CONFIRMATION_CRON_LIMIT ?? '50',
  );
  const lookbackHours = Number(
    url.searchParams.get('lookbackHours') ??
      process.env.PROVIDER_CONFIRMATION_LOOKBACK_HOURS ??
      '168',
  );

  const supabase = createServerClient();
  try {
    const result = await reconcileConfirmablePayouts(supabase, {
      limit: Number.isFinite(limit) ? limit : 50,
      lookbackHours: Number.isFinite(lookbackHours) ? lookbackHours : 168,
      // Cron default: still-unknown until provider evidence; inject via env not required.
      // Real/sandbox resolve happens inside process when provider not injected —
      // for fail-closed automation without injected provider, use sandbox unknown
      // unless PAYOUT_PROVIDER is set and resolve succeeds. Explicit sandbox default:
      sandboxOptions: { reconcile: 'unknown' },
      source: 'reconcile',
    });
    return NextResponse.json({
      ok: true,
      ...result,
      note: 'M5.6 confirmation via applyProviderConfirmation only; never submit',
    });
  } catch (error) {
    console.error('[cron/provider-payout-confirm]', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'provider confirmation failed',
      },
      { status: 500 },
    );
  }
}

export async function POST() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
