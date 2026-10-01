/**
 * Cron: deliver settlement reversal recovery for commissions already reversed.
 * Does not accept a commission id, amount, network, or period.
 * The only economic call is dispatch → recoverSettlementReversal.
 * Requires CRON_SECRET. Bounded batch. Idempotent under overlap.
 */

import { NextRequest, NextResponse } from 'next/server';
import { dispatchSettlementReversalRecovery } from '@/lib/economy/settlement/reversalRecoveryDispatch';
import { requireCronSecret } from '@/lib/server/cronAuth';
import { createServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  try {
    const supabase = createServerClient();
    const result = await dispatchSettlementReversalRecovery(supabase);
    if (!result.ok) {
      return NextResponse.json(result, { status: 500 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('[cron/settlement-reversal-recovery]', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'settlement reversal recovery failed' },
      { status: 500 },
    );
  }
}

export async function POST() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
