import { NextRequest, NextResponse } from 'next/server';
import {
  buildDistributionEnvHealth,
  buildPublicDistributionEnvHealth,
} from '@/lib/distribution/cronSafety';
import { requireCronSecret } from '@/lib/server/cronAuth';

export const dynamic = 'force-dynamic';

/**
 * Distribution / env diagnostic for staging Vercel preparation.
 * Public: only the resolved Supabase ref (isolation probes need it).
 * With CRON_SECRET (Bearer or x-cron-secret): refs, flags and gate reasons — never secret values.
 */
export async function GET(request: NextRequest) {
  const authorized = requireCronSecret(request) === null;
  return NextResponse.json(
    {
      ok: true,
      purpose: 'distribution_env_health',
      detail: authorized ? 'full' : 'public',
      health: authorized ? buildDistributionEnvHealth() : buildPublicDistributionEnvHealth(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
