/**
 * Hunter Lab Production Review — server-side queries (service_role / admin API).
 * Batched label loads; no N+1. Never publishes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  HUNTER_CANDIDATE_LABELS_TABLE,
  HUNTER_INTELLIGENCE_RUNS_TABLE,
  HUNTER_OFFER_CANDIDATES_TABLE,
} from './persist';
import {
  LAB_CANDIDATE_SELECT,
  computeLabLabelCounters,
  computeLabMetricsPrep,
  computeLabReconciliation,
  latestLabelsByCandidate,
  type LabCandidateRow,
  type LabLabelCounters,
  type LabListFilters,
  type LabMetricsPrep,
  type LabReconciliation,
} from './labReview';
import { classifyLabelOutcome } from './humanLabels';

function applyCandidateFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  q: any,
  filters: LabListFilters,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  let query = q.eq('run_id', filters.runId);
  if (filters.source) query = query.eq('source', filters.source);
  if (filters.retailer) query = query.eq('retailer', filters.retailer);
  if (filters.decision) query = query.eq('decision', filters.decision);
  if (filters.reasonCode) query = query.eq('reason_code', filters.reasonCode);
  if (filters.stage) query = query.eq('rejection_stage', filters.stage);
  if (filters.scoreMin != null && Number.isFinite(filters.scoreMin)) {
    query = query.gte('hunter_score', filters.scoreMin);
  }
  if (filters.scoreMax != null && Number.isFinite(filters.scoreMax)) {
    query = query.lte('hunter_score', filters.scoreMax);
  }
  if (filters.titleSearch) {
    query = query.ilike('title', `%${filters.titleSearch.replace(/%/g, '\\%')}%`);
  }
  return query;
}

/** Load labels for candidates of a run (batched). Returns latest per candidate. */
export async function fetchLatestLabelsForRun(
  supabase: SupabaseClient,
  runId: string,
): Promise<
  Map<
    string,
    {
      human_decision: string;
      reviewed_at: string;
      hunter_decision?: string | null;
      outcome: ReturnType<typeof classifyLabelOutcome>;
    }
  >
> {
  const { data: candIds, error: idErr } = await supabase
    .from(HUNTER_OFFER_CANDIDATES_TABLE)
    .select('id')
    .eq('run_id', runId);
  if (idErr || !candIds?.length) return new Map();

  const ids = candIds.map((r) => r.id as string);
  const allLabels: Array<{
    candidate_id: string;
    human_decision: string;
    reviewed_at: string;
    hunter_decision?: string | null;
  }> = [];

  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from(HUNTER_CANDIDATE_LABELS_TABLE)
      .select('candidate_id, human_decision, reviewed_at, hunter_decision')
      .in('candidate_id', chunk)
      .order('reviewed_at', { ascending: false });
    if (error) break;
    if (data) allLabels.push(...(data as typeof allLabels));
  }

  return latestLabelsByCandidate(allLabels);
}

export async function fetchLabReviewPage(
  supabase: SupabaseClient,
  filters: LabListFilters,
): Promise<{
  ok: boolean;
  error?: string;
  run: Record<string, unknown> | null;
  candidates: LabCandidateRow[];
  total: number;
  page: number;
  pageSize: number;
  counters: LabLabelCounters;
  reconciliation: LabReconciliation;
  metrics: LabMetricsPrep;
  filterOptions: {
    sources: string[];
    retailers: string[];
    decisions: string[];
    reasonCodes: string[];
    stages: string[];
  };
}> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const [{ data: run }, persistedHead, labelsMap] = await Promise.all([
    supabase.from(HUNTER_INTELLIGENCE_RUNS_TABLE).select('*').eq('run_id', filters.runId).maybeSingle(),
    supabase
      .from(HUNTER_OFFER_CANDIDATES_TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('run_id', filters.runId),
    fetchLatestLabelsForRun(supabase, filters.runId),
  ]);

  const persistedCount = persistedHead.count ?? 0;
  const recon = computeLabReconciliation({
    run: run as { candidate_count?: number; decision_breakdown?: Record<string, number> } | null,
    persistedCount,
  });
  const counters = computeLabLabelCounters({
    total: persistedCount,
    latestByCandidate: labelsMap,
  });
  const metrics = computeLabMetricsPrep({
    recon,
    counters,
    run: run as {
      would_insert_count?: number;
      rejected_count?: number;
      needs_review_count?: number;
      score_distribution?: Record<string, number>;
      decision_breakdown?: Record<string, number>;
    } | null,
  });

  const emptyFilterOptions = {
    sources: Array.isArray(run?.sources) ? (run!.sources as string[]) : [],
    retailers: Array.isArray(run?.retailers) ? (run!.retailers as string[]) : [],
    decisions: Object.keys(recon.decisionTotals),
    reasonCodes: Object.keys(
      (run?.rejection_breakdown as Record<string, number> | undefined) ?? {},
    ),
    stages: [] as string[],
  };

  const reviewedIds = [...labelsMap.keys()];
  const missed = filters.missedOpportunities === true;
  const humanFilter = missed ? 'FALSE_NEGATIVE' : filters.humanLabel;

  let idFilter: string[] | null = null;
  if (humanFilter) {
    idFilter = reviewedIds.filter((id) => labelsMap.get(id)?.human_decision === humanFilter);
  } else if (filters.reviewed === 'reviewed') {
    idFilter = reviewedIds;
  }

  // Missed opportunities: order by hunter_score DESC before paging.
  if (idFilter && (missed || humanFilter === 'FALSE_NEGATIVE') && idFilter.length > 0) {
    const scored: Array<{ id: string; score: number | null }> = [];
    const chunkSize = 200;
    for (let i = 0; i < idFilter.length; i += chunkSize) {
      const chunk = idFilter.slice(i, i + chunkSize);
      const { data } = await supabase
        .from(HUNTER_OFFER_CANDIDATES_TABLE)
        .select('id, hunter_score')
        .in('id', chunk);
      for (const row of data ?? []) {
        scored.push({
          id: row.id as string,
          score: row.hunter_score == null ? null : Number(row.hunter_score),
        });
      }
    }
    scored.sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
    idFilter = scored.map((s) => s.id);
  }

  if ((humanFilter || filters.reviewed === 'reviewed') && idFilter && idFilter.length === 0) {
    return {
      ok: true,
      run: (run as Record<string, unknown>) ?? null,
      candidates: [],
      total: 0,
      page,
      pageSize,
      counters,
      reconciliation: recon,
      metrics,
      filterOptions: emptyFilterOptions,
    };
  }

  // Large id sets: page over the id list then fetch those rows (avoids PostgREST .in limits).
  if (idFilter && idFilter.length > 200) {
    const pageIds = idFilter.slice(from, to + 1);
    if (pageIds.length === 0) {
      return {
        ok: true,
        run: (run as Record<string, unknown>) ?? null,
        candidates: [],
        total: idFilter.length,
        page,
        pageSize,
        counters,
        reconciliation: recon,
        metrics,
        filterOptions: emptyFilterOptions,
      };
    }
    let idQ = applyCandidateFilters(
      supabase.from(HUNTER_OFFER_CANDIDATES_TABLE).select(LAB_CANDIDATE_SELECT),
      filters,
    ).in('id', pageIds);
    if (missed || humanFilter === 'FALSE_NEGATIVE') {
      idQ = idQ.order('hunter_score', { ascending: false, nullsFirst: false });
    } else {
      idQ = idQ.order('discovered_at', { ascending: false });
    }
    const { data: rows, error } = await idQ;
    if (error) {
      return {
        ok: false,
        error: error.message,
        run: (run as Record<string, unknown>) ?? null,
        candidates: [],
        total: 0,
        page,
        pageSize,
        counters,
        reconciliation: recon,
        metrics,
        filterOptions: {
          sources: [],
          retailers: [],
          decisions: [],
          reasonCodes: [],
          stages: [],
        },
      };
    }
    const candidates = ((rows ?? []) as LabCandidateRow[]).map((c) => {
      const lab = labelsMap.get(c.id);
      return {
        ...c,
        human_label: lab?.human_decision ?? null,
        human_reviewed_at: lab?.reviewed_at ?? null,
        label_outcome: lab?.outcome ?? null,
      };
    });
    return {
      ok: true,
      run: (run as Record<string, unknown>) ?? null,
      candidates,
      total: idFilter.length,
      page,
      pageSize,
      counters,
      reconciliation: recon,
      metrics,
      filterOptions: {
        ...emptyFilterOptions,
        stages: [...new Set(candidates.map((c) => c.rejection_stage).filter(Boolean))].sort(),
      },
    };
  }

  let listQ = applyCandidateFilters(
    supabase.from(HUNTER_OFFER_CANDIDATES_TABLE).select(LAB_CANDIDATE_SELECT, { count: 'exact' }),
    filters,
  );

  if (idFilter) {
    listQ = listQ.in('id', idFilter);
  } else if (filters.reviewed === 'unreviewed' && reviewedIds.length > 0) {
    if (reviewedIds.length <= 200) {
      listQ = listQ.not('id', 'in', `(${reviewedIds.join(',')})`);
    }
  }

  const orderCol = missed || humanFilter === 'FALSE_NEGATIVE' ? 'hunter_score' : 'discovered_at';
  listQ = listQ.order(orderCol, { ascending: false, nullsFirst: false }).range(from, to);

  const { data: rows, error, count } = await listQ;
  if (error) {
    return {
      ok: false,
      error: error.message,
      run: (run as Record<string, unknown>) ?? null,
      candidates: [],
      total: 0,
      page,
      pageSize,
      counters,
      reconciliation: recon,
      metrics,
      filterOptions: {
        sources: [],
        retailers: [],
        decisions: [],
        reasonCodes: [],
        stages: [],
      },
    };
  }

  let candidates = (rows ?? []) as LabCandidateRow[];

  if (filters.reviewed === 'unreviewed' && reviewedIds.length > 200) {
    const reviewedSet = new Set(reviewedIds);
    candidates = candidates.filter((c) => !reviewedSet.has(c.id));
  }

  candidates = candidates.map((c) => {
    const lab = labelsMap.get(c.id);
    return {
      ...c,
      human_label: lab?.human_decision ?? null,
      human_reviewed_at: lab?.reviewed_at ?? null,
      label_outcome: lab?.outcome ?? null,
    };
  });

  return {
    ok: true,
    run: (run as Record<string, unknown>) ?? null,
    candidates,
    total: count ?? candidates.length,
    page,
    pageSize,
    counters,
    reconciliation: recon,
    metrics,
    filterOptions: {
      ...emptyFilterOptions,
      stages: [...new Set(candidates.map((c) => c.rejection_stage).filter(Boolean))].sort() as string[],
    },
  };
}
