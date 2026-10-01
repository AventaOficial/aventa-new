import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireCronSecret } from '@/lib/server/cronAuth';
import { processExpiredRewardHolds } from '@/lib/rewards/rewardsEngine';

/**
 * Cron diario: libera recompensas VALIDATING → AVAILABLE cuando hold_until venció.
 * Vercel Cron envía Authorization: Bearer CRON_SECRET automáticamente.
 * No acepta parámetros de negocio (userId, rewardId, montos, etc.).
 */
export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const supabase = createServerClient();
  try {
    const result = await processExpiredRewardHolds(supabase);
    const auditFailed = (result.auditFailedIds?.length ?? 0) > 0;
    return NextResponse.json(
      { ok: !auditFailed, ...result },
      { status: auditFailed ? 500 : 200 },
    );
  } catch (error) {
    console.error('[cron/rewards-release-holds]', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'release holds failed' },
      { status: 500 },
    );
  }
}

export async function POST() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
