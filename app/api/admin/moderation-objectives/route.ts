import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireModeration } from '@/lib/server/requireAdmin';
import {
  MOD_OBJECTIVE_TECH_COUNT,
  MOD_OBJECTIVE_VITAL_COUNT,
  periodStartIso,
  classifyForObjectives,
  type ModerationObjectivePeriod,
} from '@/lib/moderation/objectives';

/**
 * Conteos editoriales para el panel de moderación: aprobaciones en el periodo por tipo de categoría.
 * Fuente: moderation_logs (aprobación) + categoría actual de la oferta (aprobada/publicada).
 */
export async function GET(request: Request) {
  const auth = await requireModeration(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const raw = searchParams.get('period');
  const period: ModerationObjectivePeriod = raw === '7d' ? '7d' : '24h';
  const since = periodStartIso(period);

  const supabase = createServerClient();

  const { data: logs, error: logErr } = await supabase
    .from('moderation_logs')
    .select('offer_id')
    .eq('action', 'approved')
    .gte('created_at', since);

  if (logErr) {
    console.error('[moderation-objectives]', logErr.message);
    return NextResponse.json({ error: 'No se pudieron leer aprobaciones' }, { status: 500 });
  }

  const offerIds = [...new Set((logs ?? []).map((l: { offer_id: string }) => l.offer_id).filter(Boolean))];
  if (offerIds.length === 0) {
    return NextResponse.json({
      period,
      since,
      techApproved: 0,
      vitalApproved: 0,
      targets: { tech: MOD_OBJECTIVE_TECH_COUNT, vital: MOD_OBJECTIVE_VITAL_COUNT },
    });
  }

  const { data: offers, error: offErr } = await supabase
    .from('offers')
    .select('id, category, status')
    .in('id', offerIds)
    .in('status', ['approved', 'published']);

  if (offErr) {
    console.error('[moderation-objectives] offers', offErr.message);
    return NextResponse.json({ error: 'No se pudieron cargar ofertas' }, { status: 500 });
  }

  let techApproved = 0;
  let vitalApproved = 0;
  for (const row of offers ?? []) {
    const cat = (row as { category?: string | null }).category;
    const { tech, vital } = classifyForObjectives(cat);
    if (tech) techApproved += 1;
    if (vital) vitalApproved += 1;
  }

  return NextResponse.json({
    period,
    since,
    techApproved,
    vitalApproved,
    targets: { tech: MOD_OBJECTIVE_TECH_COUNT, vital: MOD_OBJECTIVE_VITAL_COUNT },
  });
}
