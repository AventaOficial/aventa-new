import { NextRequest, NextResponse } from 'next/server';
import { requireCronSecret } from '@/lib/server/cronAuth';
import { drainDistributionPublications } from '@/lib/distribution/drain';
import { assertDistributionDrainAllowed } from '@/lib/distribution/cronSafety';

export const maxDuration = 60;

/**
 * Distribution drain cron — STAGING SURFACE ONLY.
 *
 * Auth: requireCronSecret.
 * Gate: assertDistributionDrainAllowed (surface+target+ref+flag).
 * NOT registered in Production aventa-new vercel.json.
 * Dedicated aventa-staging project may register cron (see docs/vercel/*.example).
 */
export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const gate = assertDistributionDrainAllowed();
  if (!gate.ok) {
    if (gate.reason === 'flag_disabled') {
      return NextResponse.json({
        ok: true,
        skipped: 'flag_disabled',
        note: 'DISTRIBUTION_ENGINE_ENABLED remains false',
      });
    }
    return NextResponse.json(
      {
        ok: false,
        aborted: true,
        reason: gate.reason,
      },
      { status: gate.httpStatus },
    );
  }

  try {
    const result = await drainDistributionPublications({
      limit: Number(process.env.DISTRIBUTION_DRAIN_BATCH ?? '20'),
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'drain_failed',
      },
      { status: 500 },
    );
  }
}

export const POST = GET;
