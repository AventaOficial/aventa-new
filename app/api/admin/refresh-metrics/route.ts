import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireMetrics } from '@/lib/server/requireAdmin';

/**
 * POST: Refrescar materialized view offer_performance_metrics.
 * Usa createServerClient. Retorna 204.
 */
export async function POST(request: Request) {
  const auth = await requireMetrics(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabase = createServerClient();
    const { error } = await supabase.rpc('refresh_offer_performance_metrics');
    if (error) {
      console.error('[refresh-metrics] error:', error.message);
      return new NextResponse(null, { status: 500 });
    }
  } catch (err) {
    console.error('[refresh-metrics] error:', err);
    return new NextResponse(null, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
