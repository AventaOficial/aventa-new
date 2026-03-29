import { NextResponse } from 'next/server';
import { requireMetrics } from '@/lib/server/requireAdmin';
import { getHealthSnapshot } from '@/lib/monitoring/healthCheck';
import { runSystemsAreasPulse } from '@/lib/monitoring/systemAreasPulse';
import {
  getLastFeedLoadedCount,
  getRecentErrorEvents,
} from '@/lib/monitoring/serverClientEventStore';

/** GET: panel operativo (salud + errores recientes en buffer de esta instancia). */
export async function GET(request: Request) {
  const auth = await requireMetrics(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const [health, areasPulse] = await Promise.all([getHealthSnapshot(), runSystemsAreasPulse()]);
  const recentErrors = getRecentErrorEvents(40);
  const lastFeedLoadedCount = getLastFeedLoadedCount();

  return NextResponse.json({
    health,
    areasPulse,
    lastFeedLoadedCount,
    recentErrors,
  });
}
