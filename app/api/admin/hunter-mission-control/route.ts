import { NextResponse } from 'next/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';
import { createServerClient } from '@/lib/supabase/server';
import {
  fetchMissionControlReport,
  fetchUniversePage,
  parseUniverseFilters,
} from '@/lib/hunter/candidateIntelligence/universeQuery';

/**
 * GET /api/admin/hunter-mission-control
 *
 * Query: since, until, source, identity_type, discount_class, experiment_id,
 *        view=report|universe, page, page_size, aggregate_cap
 *
 * Returns: summary, coverage, novelty, stickiness, lossFunnel, reconciliation,
 *          experiments, dataQuality (+ temporalNovelty, labelAvailability, identityBreakdown)
 *
 * Observation only. Never publishes. Never depends on PostgREST default 1000 alone.
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
    return NextResponse.json(
      { error: 'Supabase no configurado', blocked: 'supabase_unconfigured' },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const filters = parseUniverseFilters(searchParams);
  if (!filters) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Requiere since + until (ISO). Ejemplo: ?since=2026-09-13T00:00:00.000Z&until=2026-09-20T23:59:59.999Z',
        blocked: 'missing_window',
      },
      { status: 400 },
    );
  }

  const view = searchParams.get('view')?.trim() || 'report';

  if (view === 'universe') {
    const page = await fetchUniversePage(supabase, filters);
    return NextResponse.json({
      ok: page.ok,
      error: page.error,
      candidates: page.candidates,
      total: page.total,
      page: page.page,
      page_size: page.pageSize,
      filters,
      note: 'Universo paginado (range). FACT only. No publica.',
    });
  }

  const result = await fetchMissionControlReport(supabase, filters);
  const report = result.report;

  return NextResponse.json({
    ok: result.ok,
    error: result.error,
    blocked: result.blocked ?? null,
    filters,
    summary: report?.summary ?? null,
    coverage: report?.coverage ?? null,
    novelty: report?.novelty ?? null,
    temporalNovelty: report?.temporalNovelty ?? null,
    stickiness: report?.stickiness ?? null,
    lossFunnel: report?.lossFunnel ?? null,
    causalBottleneck: report?.causalBottleneck ?? null,
    unknownBreakdown: report?.unknownBreakdown ?? null,
    discoveryEfficiency: report?.discoveryEfficiency ?? null,
    discoveryStrategy: report?.discoveryStrategy ?? null,
    sourceExpansion: report?.sourceExpansion ?? null,
    reconciliation: report?.reconciliation ?? null,
    experiments: {
      note: 'Filter by experiment_id. Shadow observation only.',
      experiment_id: filters.experimentId,
      identityBreakdown: report?.identityBreakdown ?? null,
    },
    dataQuality: report?.dataQuality ?? null,
    labelAvailability: report?.labelAvailability ?? null,
    identityBreakdown: report?.identityBreakdown ?? null,
    identityStrengthBreakdown: report?.identityStrengthBreakdown ?? null,
    answers: report?.answers ?? null,
    report,
    note: 'Mission Control aggregate. Observation only. Cap si blocked=aggregate_capped_*.',
  });
}
