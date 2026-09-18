import { NextResponse } from 'next/server';
import { buildDistributionEnvHealth } from '@/lib/distribution/cronSafety';

export const dynamic = 'force-dynamic';

/**
 * Safe Distribution / env diagnostic for staging Vercel preparation.
 * Returns refs, flags, and gate reasons — NEVER secret values.
 */
export async function GET() {
  const health = buildDistributionEnvHealth();
  return NextResponse.json({
    ok: true,
    purpose: 'distribution_env_health',
    health,
  });
}
