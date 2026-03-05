import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireMetrics } from '@/lib/server/requireAdmin';

type Period = 'day' | 'week' | 'month';

type OfferWithRelations = {
  id: string;
  title: string;
  category?: string | null;
  created_at: string;
  offer_events?: Array<{ event_type: string; created_at: string }> | null;
  offer_votes?: Array<{ value: number }> | null;
};

function computeScoreFinal(score: number, createdAt: string): number {
  const hours = (Date.now() - new Date(createdAt).getTime()) / (1000 * 3600);
  const base = Math.max(hours + 2, 2);
  return Number((score / Math.pow(base, 1.5)).toFixed(2));
}

/**
 * GET: actividad de ofertas (vistas, outbound, shares, CTR) para Admin → Métricas.
 * Usa service role para no depender de RLS en offer_events (así los clics "Cazar oferta" se cuentan bien).
 * Query: ?period=day|week|month
 */
export async function GET(request: Request) {
  const auth = await requireMetrics(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const period = (searchParams.get('period') ?? 'week') as Period;
  if (!['day', 'week', 'month'].includes(period)) {
    return NextResponse.json({ error: 'period must be day, week or month' }, { status: 400 });
  }

  const days = period === 'day' ? 1 : period === 'week' ? 7 : 30;
  const dateLimit = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const limitIso = dateLimit.toISOString();

  const supabase = createServerClient();
  const { data: offers, error } = await supabase
    .from('offers')
    .select('id, title, category, created_at, offer_events(event_type, created_at), offer_votes(value)')
    .or('status.eq.approved,status.eq.published');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = (offers ?? []) as OfferWithRelations[];
  const rows = list
    .map((o) => {
      const events = (o.offer_events ?? []).filter((e) => e.created_at >= limitIso);
      const views = events.filter((e) => e.event_type === 'view').length;
      const outbound = events.filter((e) => e.event_type === 'outbound').length;
      const shares = events.filter((e) => e.event_type === 'share').length;
      const ctr = views > 0 ? Number(((outbound / views) * 100).toFixed(2)) : null;
      const votes = o.offer_votes ?? [];
      const score = votes.reduce(
        (s, v) => s + (v.value === 2 ? 2 : v.value === -1 ? -1 : v.value === 1 ? 1 : 0),
        0
      );
      const score_final = computeScoreFinal(score, o.created_at);
      return {
        id: o.id,
        title: o.title,
        category: o.category ?? null,
        views,
        outbound,
        shares,
        ctr,
        score,
        score_final,
        created_at: o.created_at,
      };
    })
    .filter((r) => r.views > 0 || r.outbound > 0);

  return NextResponse.json({ rows });
}
