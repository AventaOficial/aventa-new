/**
 * Cron: M5.1 Ledger → Reward bridge reconciliation safety net.
 * Bounded lookback + limit. Never enables payouts. Requires CRON_SECRET.
 * Fail-closed via processLedgerRewardAttempt flag gates.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireCronSecret } from '@/lib/server/cronAuth';
import { reconcileLedgerRewardBridge } from '@/lib/rewards/ledgerRewardBridge';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get('limit') ?? process.env.LEDGER_REWARD_BRIDGE_CRON_LIMIT ?? '50');
  const lookbackHours = Number(
    url.searchParams.get('lookbackHours') ??
      process.env.LEDGER_REWARD_BRIDGE_LOOKBACK_HOURS ??
      '168',
  );

  const supabase = createServerClient();
  try {
    const result = await reconcileLedgerRewardBridge(supabase, {
      limit: Number.isFinite(limit) ? limit : 50,
      lookbackHours: Number.isFinite(lookbackHours) ? lookbackHours : 168,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('[cron/ledger-reward-bridge]', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'bridge reconcile failed' },
      { status: 500 },
    );
  }
}

export async function POST() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
