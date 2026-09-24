import { NextResponse } from 'next/server';
import { requireMetrics } from '@/lib/server/requireAdmin';
import { createServerClient } from '@/lib/supabase/server';
import { summarizeSourceRuns } from '@/lib/intelligence/supply/yield';

const SAMPLE_CAP = 500;
const WINDOW_MAX_HOURS = 24 * 30;

export async function GET(request: Request) {
  const auth = await requireMetrics(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(request.url);
  const hours = Math.min(
    WINDOW_MAX_HOURS,
    Math.max(1, Number(url.searchParams.get('sinceHours') ?? '168') || 168),
  );
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('hunter_supply_runs')
    .select(
      'source_id, source_family, source_lane, status, started_at, candidates_discovered, candidates_qualified, verified_deals, duplicates, catalog_only, rejected, pending, errors, duration_ms',
    )
    .gte('started_at', since)
    .order('started_at', { ascending: false })
    .limit(SAMPLE_CAP);

  if (error) return NextResponse.json({ error: error.message, sample: 'unavailable' }, { status: 503 });

  const rows = (data ?? []).map((row) => {
    const record = row as Record<string, unknown>;
    return {
      sourceId: String(record.source_id ?? ''),
      sourceFamily: String(record.source_family ?? ''),
      sourceLane: String(record.source_lane ?? ''),
      status: String(record.status ?? ''),
      startedAt: String(record.started_at ?? ''),
      candidatesDiscovered: Number(record.candidates_discovered ?? 0),
      candidatesQualified: Number(record.candidates_qualified ?? 0),
      verifiedDeals: Number(record.verified_deals ?? 0),
      duplicates: Number(record.duplicates ?? 0),
      catalogOnly: Number(record.catalog_only ?? 0),
      rejected: Number(record.rejected ?? 0),
      pending: Number(record.pending ?? 0),
      errors: Number(record.errors ?? 0),
      durationMs: Number(record.duration_ms ?? 0),
    };
  });

  return NextResponse.json({
    windowHours: hours,
    sample: `latest_${SAMPLE_CAP}_in_window`,
    currencyCost: 'UNKNOWN',
    categoryIntelligence: 'unavailable_no_category_on_hunter_supply_runs',
    brandIntelligence: 'unavailable_no_brand_entity',
    priceChangeFrequency: 'owned_by_price_intelligence',
    schedulerConsumesThisRanking: false,
    sources: summarizeSourceRuns(rows),
    publicationAllowed: false,
  });
}
