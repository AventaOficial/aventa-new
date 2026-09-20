import { NextResponse } from 'next/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';
import { createServerClient } from '@/lib/supabase/server';
import { HUNTER_INTELLIGENCE_RUNS_TABLE, parseLabListFilters } from '@/lib/hunter/candidateIntelligence';
import { fetchLabReviewPage } from '@/lib/hunter/candidateIntelligence/labReviewQuery';

/**
 * GET — Hunter Lab Production Review.
 * - Sin run_id: lista runs recientes.
 * - Con run_id: candidatos filtrados + paginación + counters + reconciliation + metrics.
 * Observation + human labeling only. Never publishes.
 */
export async function GET(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let supabase;
  try {
    supabase = createServerClient();
  } catch {
    return NextResponse.json({ error: 'Supabase no configurado' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const filters = parseLabListFilters(searchParams);

  if (!filters) {
    const { data: runs, error } = await supabase
      .from(HUNTER_INTELLIGENCE_RUNS_TABLE)
      .select('*')
      .order('started_at', { ascending: false })
      .limit(40);
    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          runs: [],
          note: 'Aplica migraciones 20260920_hunter_candidate_intelligence*.sql en staging si la tabla no existe.',
        },
        { status: 200 },
      );
    }
    return NextResponse.json({ ok: true, runs: runs ?? [] });
  }

  const page = await fetchLabReviewPage(supabase, filters);
  if (!page.ok) {
    return NextResponse.json({
      ok: false,
      error: page.error,
      run: page.run,
      candidates: [],
      total: 0,
      page: page.page,
      page_size: page.pageSize,
      counters: page.counters,
      reconciliation: page.reconciliation,
      metrics: page.metrics,
      filter_options: page.filterOptions,
    });
  }

  return NextResponse.json({
    ok: true,
    run: page.run,
    candidates: page.candidates,
    total: page.total,
    page: page.page,
    page_size: page.pageSize,
    counters: page.counters,
    reconciliation: page.reconciliation,
    metrics: page.metrics,
    filter_options: page.filterOptions,
    note: 'FACT = observado en ledger/run · LABEL = humano · DERIVED = calculado. No publica.',
  });
}
