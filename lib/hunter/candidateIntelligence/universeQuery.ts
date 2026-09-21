/**
 * Universe / window queries for Hunter Lab + Mission Control.
 * Server-side only. Paginated. No N+1. Observation only.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { HUNTER_OFFER_CANDIDATES_TABLE, HUNTER_CANDIDATE_LABELS_TABLE } from './persist';
import { LAB_CANDIDATE_SELECT, type LabCandidateRow, type LabListFilters } from './labReview';
import { buildMissionControlReport, type MissionControlReport } from './missionControl';
import { resolveCandidateIdentity } from './candidateIdentity';
import { latestLabelsByCandidate } from './labReview';

export type UniverseFilters = {
  since: string;
  until: string;
  runId?: string | null;
  source?: string | null;
  retailer?: string | null;
  decision?: string | null;
  reasonCode?: string | null;
  stage?: string | null;
  discountClass?: string | null;
  category?: string | null;
  query?: string | null;
  novelty?: 'novel' | 'repeated' | null;
  scoreMin?: number | null;
  scoreMax?: number | null;
  discountMin?: number | null;
  discountMax?: number | null;
  experimentId?: string | null;
  experimentVariant?: string | null;
  identityType?: string | null;
  page?: number;
  pageSize?: number;
  /** Cap for mission-control aggregation (not UI page). */
  aggregateCap?: number;
};

function applyUniverseFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  q: any,
  f: UniverseFilters,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  let query = q
    .gte('discovered_at', f.since)
    .lte('discovered_at', f.until);
  if (f.runId) query = query.eq('run_id', f.runId);
  if (f.source) query = query.eq('source', f.source);
  if (f.retailer) query = query.eq('retailer', f.retailer);
  if (f.decision) query = query.eq('decision', f.decision);
  if (f.reasonCode) query = query.eq('reason_code', f.reasonCode);
  if (f.stage) query = query.eq('rejection_stage', f.stage);
  if (f.discountClass) query = query.eq('discount_class', f.discountClass);
  if (f.category) query = query.eq('category', f.category);
  if (f.query) query = query.eq('rot_query', f.query);
  if (f.experimentId) query = query.eq('experiment_id', f.experimentId);
  if (f.experimentVariant) query = query.eq('experiment_variant', f.experimentVariant);
  if (f.novelty === 'novel') query = query.eq('discovery_count_in_run', 1);
  else if (f.novelty === 'repeated') query = query.gt('discovery_count_in_run', 1);
  if (f.scoreMin != null && Number.isFinite(f.scoreMin)) query = query.gte('hunter_score', f.scoreMin);
  if (f.scoreMax != null && Number.isFinite(f.scoreMax)) query = query.lte('hunter_score', f.scoreMax);
  if (f.discountMin != null && Number.isFinite(f.discountMin)) {
    query = query.gte('discount_percentage', f.discountMin);
  }
  if (f.discountMax != null && Number.isFinite(f.discountMax)) {
    query = query.lte('discount_percentage', f.discountMax);
  }
  return query;
}

export function parseUniverseFilters(searchParams: URLSearchParams): UniverseFilters | null {
  const since = searchParams.get('since')?.trim() || '';
  const until = searchParams.get('until')?.trim() || '';
  if (!since || !until) return null;

  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('page_size') ?? 50) || 50));
  const noveltyRaw = (searchParams.get('novelty') ?? '').trim().toLowerCase();
  let novelty: UniverseFilters['novelty'] = null;
  if (noveltyRaw === 'novel' || noveltyRaw === 'new') novelty = 'novel';
  else if (noveltyRaw === 'repeated' || noveltyRaw === 'repeat') novelty = 'repeated';

  const num = (k: string) => {
    const v = searchParams.get(k);
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  return {
    since,
    until,
    runId: searchParams.get('run_id')?.trim() || null,
    source: searchParams.get('source')?.trim() || null,
    retailer: searchParams.get('retailer')?.trim() || null,
    decision: searchParams.get('decision')?.trim() || null,
    reasonCode: searchParams.get('reason_code')?.trim() || null,
    stage: searchParams.get('stage')?.trim() || null,
    discountClass: searchParams.get('discount_class')?.trim() || null,
    category: searchParams.get('category')?.trim() || null,
    query: searchParams.get('query')?.trim() || searchParams.get('rot_query')?.trim() || null,
    novelty,
    scoreMin: num('score_min'),
    scoreMax: num('score_max'),
    discountMin: num('discount_min'),
    discountMax: num('discount_max'),
    experimentId: searchParams.get('experiment_id')?.trim() || null,
    experimentVariant: searchParams.get('experiment_variant')?.trim() || null,
    identityType: searchParams.get('identity_type')?.trim() || null,
    page,
    pageSize,
    aggregateCap: Math.min(5000, Math.max(100, Number(searchParams.get('aggregate_cap') ?? 2000) || 2000)),
  };
}

/** Paginated universe list for Lab. */
export async function fetchUniversePage(
  supabase: SupabaseClient,
  filters: UniverseFilters,
): Promise<{
  ok: boolean;
  error?: string;
  candidates: LabCandidateRow[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let countQ = applyUniverseFilters(
    supabase.from(HUNTER_OFFER_CANDIDATES_TABLE).select('id', { count: 'exact', head: true }),
    filters,
  );
  let dataQ = applyUniverseFilters(
    supabase.from(HUNTER_OFFER_CANDIDATES_TABLE).select(LAB_CANDIDATE_SELECT),
    filters,
  )
    .order('discovered_at', { ascending: false })
    .range(from, to);

  const [{ count, error: cErr }, { data, error: dErr }] = await Promise.all([countQ, dataQ]);
  if (cErr || dErr) {
    return {
      ok: false,
      error: cErr?.message || dErr?.message || 'universe query failed',
      candidates: [],
      total: 0,
      page,
      pageSize,
    };
  }
  return {
    ok: true,
    candidates: (data ?? []) as LabCandidateRow[],
    total: count ?? 0,
    page,
    pageSize,
  };
}

/** Mission Control aggregate for a time window. Caps rows to avoid OOM. */
export async function fetchMissionControlReport(
  supabase: SupabaseClient,
  filters: UniverseFilters,
): Promise<{ ok: boolean; error?: string; report: MissionControlReport | null; blocked?: string }> {
  const cap = filters.aggregateCap ?? 2000;
  const pageSize = Math.min(1000, cap);
  const rows: Array<Record<string, unknown>> = [];
  const selectCols = [
    'run_id',
    'canonical_url',
    'source_url',
    'source',
    'retailer',
    'title',
    'category',
    'sale_price',
    'original_price',
    'discount_percentage',
    'discount_class',
    'decision',
    'reason_code',
    'reason_detail',
    'rejection_stage',
    'hunter_score',
    'funnel_stage',
    'would_topk_cut',
    'would_diversity_cut',
    'diversity_cut',
    'negative_memory_level',
    'price_evidence',
    'product_fingerprint',
    'product_identifier',
    'rot_query',
    'rot_page',
    'rot_seed_id',
    'discovered_at',
    'experiment_id',
    'experiment_variant',
    'id',
  ].join(',');

  for (let from = 0; from < cap; from += pageSize) {
    const to = Math.min(from + pageSize - 1, cap - 1);
    const { data, error } = await applyUniverseFilters(
      supabase.from(HUNTER_OFFER_CANDIDATES_TABLE).select(selectCols),
      filters,
    )
      .order('discovered_at', { ascending: false })
      .range(from, to);
    if (error) {
      return { ok: false, error: error.message, report: null, blocked: 'supabase_query_failed' };
    }
    const batch = (data ?? []) as Array<Record<string, unknown>>;
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }

  if (rows.length === 0) {
    return {
      ok: true,
      report: buildMissionControlReport({
        candidates: [],
        since: filters.since,
        until: filters.until,
      }),
      blocked: 'empty_window',
    };
  }

  // Labels batched
  const ids = rows.map((r: Record<string, unknown>) => r.id as string).filter(Boolean);
  const allLabels: Array<{
    candidate_id: string;
    human_decision: string;
    reviewed_at: string;
    hunter_decision?: string | null;
  }> = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data: labs } = await supabase
      .from(HUNTER_CANDIDATE_LABELS_TABLE)
      .select('candidate_id, human_decision, reviewed_at, hunter_decision')
      .in('candidate_id', chunk)
      .order('reviewed_at', { ascending: false });
    if (labs) allLabels.push(...(labs as typeof allLabels));
  }
  const labelsMap = latestLabelsByCandidate(allLabels);

  // Non-overlapping baselines: [since-24h, since) and [since-7d, since)
  const sinceMs = Date.parse(filters.since);
  const histSelect =
    'canonical_url,source_url,product_fingerprint,product_identifier,source,rot_query,rot_page,rot_seed_id';
  const loadBaseline = async (fromIso: string, toExclusiveIso: string, limit: number) => {
    const out: Array<Record<string, unknown>> = [];
    const page = 1000;
    for (let from = 0; from < limit; from += page) {
      const to = Math.min(from + page - 1, limit - 1);
      const { data } = await supabase
        .from(HUNTER_OFFER_CANDIDATES_TABLE)
        .select(histSelect)
        .gte('discovered_at', fromIso)
        .lt('discovered_at', toExclusiveIso)
        .order('discovered_at', { ascending: false })
        .range(from, to);
      const batch = (data ?? []) as Array<Record<string, unknown>>;
      out.push(...batch);
      if (batch.length < page) break;
    }
    return out;
  };
  const b24Since = new Date(sinceMs - 24 * 60 * 60 * 1000).toISOString();
  const b7Since = new Date(sinceMs - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [hist24, hist7] = await Promise.all([
    loadBaseline(b24Since, filters.since, 3000),
    loadBaseline(b7Since, filters.since, 5000),
  ]);

  const toInput = (rowsH: Array<Record<string, unknown>>) =>
    rowsH.map((r) => ({
      canonicalUrl: r.canonical_url as string | null,
      sourceUrl: r.source_url as string | null,
      productFingerprint: r.product_fingerprint as string | null,
      productIdentifier: r.product_identifier as string | null,
      source: r.source as string | null,
      rotQuery: r.rot_query as string | null,
      rotPage: r.rot_page as number | null,
      rotSeedId: r.rot_seed_id as string | null,
    }));

  const toIds = (rowsH: Array<Record<string, unknown>>) => {
    const set = new Set<string>();
    for (const r of toInput(rowsH)) {
      const k = resolveCandidateIdentity(r).identityKey;
      if (k) set.add(k);
    }
    return set;
  };
  const toUrls = (rowsH: Array<Record<string, unknown>>) => {
    const set = new Set<string>();
    for (const r of rowsH) {
      const u = String(r.canonical_url ?? '')
        .trim()
        .toLowerCase();
      if (u) set.add(u);
    }
    return set;
  };

  const candidates = rows.map((r: Record<string, unknown>) => {
    const label = labelsMap.get(r.id as string);
    const identity = resolveCandidateIdentity({
      canonicalUrl: r.canonical_url as string | null,
      sourceUrl: r.source_url as string | null,
      productFingerprint: r.product_fingerprint as string | null,
      productIdentifier: r.product_identifier as string | null,
      source: r.source as string | null,
    });
    return {
      runId: r.run_id as string,
      canonicalUrl: r.canonical_url as string,
      sourceUrl: r.source_url as string | null,
      source: r.source as string | null,
      retailer: r.retailer as string | null,
      title: r.title as string | null,
      category: r.category as string | null,
      salePrice: r.sale_price as number | null,
      originalPrice: r.original_price as number | null,
      discountPercentage: r.discount_percentage as number | null,
      discountClass: r.discount_class as string | null,
      decision: r.decision as string,
      reasonCode: r.reason_code as string | null,
      reasonDetail: r.reason_detail as string | null,
      rejectionStage: r.rejection_stage as string | null,
      hunterScore: r.hunter_score as number | null,
      funnelStage: r.funnel_stage as string | null,
      wouldTopkCut: r.would_topk_cut as boolean | null,
      wouldDiversityCut: r.would_diversity_cut as boolean | null,
      diversityCut: r.diversity_cut as boolean | null,
      negativeMemoryLevel: r.negative_memory_level as string | null,
      priceEvidence: r.price_evidence as Record<string, unknown> | null,
      productFingerprint: r.product_fingerprint as string | null,
      productIdentifier: r.product_identifier as string | null,
      rotQuery: r.rot_query as string | null,
      rotPage: r.rot_page as number | null,
      rotSeedId: r.rot_seed_id as string | null,
      discoveredAt: r.discovered_at as string | null,
      experimentId: r.experiment_id as string | null,
      experimentVariant: r.experiment_variant as string | null,
      identityType: identity.identityType,
      sourceItemId: identity.sourceItemId,
      humanLabel: label?.human_decision ?? null,
      labelOutcome: label?.outcome ?? null,
    };
  });

  let filteredCandidates = candidates;
  if (filters.identityType) {
    filteredCandidates = candidates.filter((c) => c.identityType === filters.identityType);
  }

  const report = buildMissionControlReport({
    candidates: filteredCandidates,
    since: filters.since,
    until: filters.until,
    identities7d: toIds(hist7),
    identities24h: toIds(hist24),
    urls7d: toUrls(hist7),
    baseline24hRows: toInput(hist24),
    baseline7dRows: toInput(hist7),
  });

  const { count: totalInWindow } = await applyUniverseFilters(
    supabase.from(HUNTER_OFFER_CANDIDATES_TABLE).select('id', { count: 'exact', head: true }),
    filters,
  );

  return {
    ok: true,
    report,
    blocked:
      totalInWindow != null && totalInWindow > cap
        ? `aggregate_capped_at_${cap}_of_${totalInWindow}`
        : undefined,
  };
}

/** Bridge LabListFilters → UniverseFilters when since/until present on run query. */
export function labFiltersToUniverse(
  filters: LabListFilters & { since?: string | null; until?: string | null },
): UniverseFilters | null {
  if (!filters.since || !filters.until) return null;
  return {
    since: filters.since,
    until: filters.until,
    runId: filters.runId || null,
    source: filters.source,
    retailer: filters.retailer,
    decision: filters.decision,
    reasonCode: filters.reasonCode,
    stage: filters.stage,
    discountClass: filters.discountClass,
    novelty: filters.novelty,
    scoreMin: filters.scoreMin,
    scoreMax: filters.scoreMax,
    experimentId: filters.experimentId,
    experimentVariant: filters.experimentVariant,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}
