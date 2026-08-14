import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireMetrics } from '@/lib/server/requireAdmin';

export type DailySystemMetricRow = {
  date: string;
  total_offers_created: number;
  total_votes: number;
  total_views: number;
  total_outbound: number;
  ctr: number | null;
};

/**
 * Métricas diarias para /admin/health.
 * Usa service_role (no depende de grants anon sobre daily_system_metrics).
 */
export async function GET(request: Request) {
  const auth = await requireMetrics(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('daily_system_metrics')
    .select('date, total_offers_created, total_votes, total_views, total_outbound, ctr')
    .order('date', { ascending: false })
    .limit(30);

  if (error) {
    const msg = (error.message ?? '').toLowerCase();
    if (msg.includes('daily_system_metrics') || msg.includes('does not exist') || msg.includes('schema cache')) {
      return NextResponse.json(
        {
          error: 'Vista daily_system_metrics no disponible. Revisá Supabase o recreala.',
          metrics: [] as DailySystemMetricRow[],
        },
        { status: 503 },
      );
    }
    console.error('[daily-system-metrics]', error.message);
    return NextResponse.json({ error: 'No se pudieron leer métricas' }, { status: 500 });
  }

  return NextResponse.json({
    metrics: (data ?? []) as DailySystemMetricRow[],
  });
}
