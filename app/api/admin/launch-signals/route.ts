import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/requireAdmin';
import { createServerClient } from '@/lib/supabase/server';
import { snapshotLaunchMetrics } from '@/lib/observability/launchMetrics';
import { getFunnelSnapshot } from '@/lib/analytics/funnelSnapshot';

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = createServerClient();
  const now = new Date();
  const overdueIso = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();

  const [pending, overdue, funnel] = await Promise.all([
    supabase.from('offers').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase
      .from('offer_health_state')
      .select('offer_id', { count: 'exact', head: true })
      .lte('next_check_at', overdueIso),
    getFunnelSnapshot(24),
  ]);

  return NextResponse.json({
    checkedAt: now.toISOString(),
    metrics: snapshotLaunchMetrics(),
    moderationQueueDepth: pending.error ? null : (pending.count ?? 0),
    freshnessOverdue: overdue.error ? null : (overdue.count ?? 0),
    funnel,
  });
}
