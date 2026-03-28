import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireModeration } from '@/lib/server/requireAdmin';
import {
  getObjectiveTargets,
  periodStartIso,
  classifyCategoryForObjectives,
  isQualityObjectiveOffer,
  type ModerationObjectivePeriod,
} from '@/lib/moderation/objectives';

/**
 * Objetivos editoriales diarios/semanales:
 * - total aprobadas
 * - aprobadas de calidad
 * - distribución por categoría
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

  const targets = getObjectiveTargets(period);
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
      totalApproved: 0,
      qualityApproved: 0,
      categoryApproved: Object.fromEntries(Object.keys(targets.categories).map((k) => [k, 0])),
      targets,
    });
  }

  let offers: Array<{ id: string; category?: string | null; status?: string; moderator_comment?: string | null }> = [];
  let offErr: { message: string } | null = null;
  {
    const first = await supabase
      .from('offers')
      .select('id, category, status, moderator_comment')
      .in('id', offerIds)
      .in('status', ['approved', 'published']);
    if (first.error && first.error.message?.toLowerCase().includes('moderator_comment')) {
      const fallback = await supabase
        .from('offers')
        .select('id, category, status')
        .in('id', offerIds)
        .in('status', ['approved', 'published']);
      offErr = fallback.error ? { message: fallback.error.message } : null;
      offers = ((fallback.data ?? []) as Array<{ id: string; category?: string | null; status?: string }>).map((r) => ({
        ...r,
        moderator_comment: null,
      }));
    } else {
      offErr = first.error ? { message: first.error.message } : null;
      offers = (first.data ?? []) as Array<{ id: string; category?: string | null; status?: string; moderator_comment?: string | null }>;
    }
  }

  if (offErr) {
    console.error('[moderation-objectives] offers', offErr.message);
    return NextResponse.json({ error: 'No se pudieron cargar ofertas' }, { status: 500 });
  }

  const categoryApproved: Record<string, number> = Object.fromEntries(
    Object.keys(targets.categories).map((k) => [k, 0]),
  );
  let qualityApproved = 0;
  for (const row of offers) {
    const cat = classifyCategoryForObjectives(row.category ?? null);
    if (cat && categoryApproved[cat] != null) categoryApproved[cat] += 1;
    if (isQualityObjectiveOffer(row)) qualityApproved += 1;
  }

  return NextResponse.json({
    period,
    since,
    totalApproved: offers.length,
    qualityApproved,
    categoryApproved,
    targets,
  });
}
