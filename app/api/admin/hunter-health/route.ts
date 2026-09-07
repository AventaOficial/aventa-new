import { NextResponse } from 'next/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';
import { getHunterHealthSummary } from '@/lib/hunter/isHunting';
import { HUNTER_SOURCES } from '@/lib/hunter/sources';
import { getDealVerifierMetrics } from '@/lib/verifier';

export async function GET(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const summary = await getHunterHealthSummary();
  const catalog = HUNTER_SOURCES.map((s) => ({
    id: s.id,
    displayName: s.displayName,
    priority: s.priority,
    external: Boolean(s.external),
    expectedIntervalMs: s.expectedIntervalMs,
  }));

  return NextResponse.json(
    {
      isHunting: summary.isHunting,
      reason: summary.reason,
      lastInsertAt: summary.lastInsertAt,
      sources: summary.sources,
      rows: summary.rows,
      catalog,
      dealVerifier: getDealVerifierMetrics(),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
