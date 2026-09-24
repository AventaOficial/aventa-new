import { NextRequest, NextResponse } from 'next/server';
import { requireCronSecret } from '@/lib/server/cronAuth';
import { runAccountDeletionPurge } from '@/lib/privacy/runAccountPurge';

/** Daily purge of accounts whose deletion grace has elapsed. Idempotent. */
export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const result = await runAccountDeletionPurge();
  return NextResponse.json({ ok: result.errors === 0, ...result });
}
