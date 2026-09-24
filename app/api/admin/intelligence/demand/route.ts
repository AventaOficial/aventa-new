import { NextResponse } from 'next/server';
import { requireMetrics } from '@/lib/server/requireAdmin';
import { createServerClient } from '@/lib/supabase/server';
import { buildDemandFeatures, clampDemandWindowHours, DEMAND_OFFER_LIMIT } from '@/lib/intelligence/demand/features';

export async function GET(request: Request) {
  const auth = await requireMetrics(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(request.url);
  const hours = clampDemandWindowHours(Number(url.searchParams.get('sinceHours') ?? '24'));
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc('demand_offer_signals', {
    p_since: since,
    p_limit: DEMAND_OFFER_LIMIT,
  });

  if (error) {
    return NextResponse.json(
      {
        error: 'migration_pending',
        detail: error.message,
        features: null,
      },
      { status: 503 },
    );
  }

  const signals = (data ?? []) as {
    offer_id: string;
    views: number;
    outbound: number;
    votes?: number;
    saves?: number;
    comments?: number;
  }[];
  const ids = signals.map((row) => row.offer_id).filter(Boolean);
  const categories = new Map<string, { category: string | null; store: string | null }>();
  if (ids.length > 0) {
    const { data: offers } = await supabase.from('offers').select('id, category, store').in('id', ids);
    for (const offer of offers ?? []) {
      const row = offer as { id: string; category: string | null; store: string | null };
      categories.set(row.id, { category: row.category, store: row.store });
    }
  }

  const features = buildDemandFeatures(
    signals.map((row) => ({
      offerId: row.offer_id,
      category: categories.get(row.offer_id)?.category ?? null,
      retailer: categories.get(row.offer_id)?.store ?? null,
      views: Number(row.views ?? 0),
      outbound: Number(row.outbound ?? 0),
      votes: Number(row.votes ?? 0),
      saves: Number(row.saves ?? 0),
      comments: Number(row.comments ?? 0),
    })),
  );

  return NextResponse.json({
    windowHours: hours,
    selection: 'event_led_offer_events_window',
    brand: 'unavailable_no_brand_column',
    doubleCountGuard: 'product_events excluded',
    features,
    personalizedRanking: false,
  });
}
