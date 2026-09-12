import type { SupabaseClient } from '@supabase/supabase-js';
import type { IngestSourceId, IngestSourceStats } from '@/lib/bots/ingest/types';
import type { CommunityQualityEvaluation } from './communityPipeline';
import { inferSupplyRunStatus, recordSupplyRuns } from './recordSupplyRun';
import type { SupplyFamily, SupplyRouterReport, SupplySourceId } from './types';
import type { RecordSupplyRunOutcome, SupplyRunInput, SupplyRunStatus } from './truthTypes';

export { inferSupplyRunStatus };

const INGEST_TO_SUPPLY: Record<
  IngestSourceId,
  { sourceId: SupplySourceId | string; family: SupplyFamily }
> = {
  ml_api: { sourceId: 'ml_api_legacy', family: 'official_api' },
  ml_worker: { sourceId: 'ml_worker', family: 'external_worker' },
  amazon_asin: { sourceId: 'amazon_asin', family: 'official_api' },
  env_urls: { sourceId: 'env_urls', family: 'core' },
  rss: { sourceId: 'rss', family: 'core' },
  chedraui_mx: { sourceId: 'chedraui_mx', family: 'retailer_public' },
  bodega_aurrera_mx: { sourceId: 'bodega_aurrera_mx', family: 'retailer_public' },
  walmart_mx: { sourceId: 'walmart_mx', family: 'retailer_public' },
};

export type QualificationCounts = {
  verifiedDeals: number;
  promotions: number;
  potentialDeals: number;
  catalogOnly: number;
};

export function emptyQualificationCounts(): QualificationCounts {
  return { verifiedDeals: 0, promotions: 0, potentialDeals: 0, catalogOnly: 0 };
}

export function bumpQualificationCounts(
  counts: QualificationCounts,
  qualification: string | null | undefined,
): QualificationCounts {
  if (qualification === 'VERIFIED_DEAL') counts.verifiedDeals += 1;
  else if (qualification === 'PROMOTION') counts.promotions += 1;
  else if (qualification === 'POTENTIAL_DEAL') counts.potentialDeals += 1;
  else if (qualification === 'NO_VERIFIED_DEAL') counts.catalogOnly += 1;
  return counts;
}

export function trackIngestQualification(
  bag: Partial<Record<IngestSourceId, QualificationCounts>>,
  source: IngestSourceId,
  qualification: string | null | undefined,
) {
  if (!bag[source]) bag[source] = emptyQualificationCounts();
  bumpQualificationCounts(bag[source]!, qualification);
}

export function persistSupplyRouterReport(
  report: SupplyRouterReport,
  opts?: {
    supabase?: SupabaseClient | null;
    runId?: string;
    shadowCycleId?: string | null;
    allowInTests?: boolean;
  },
): Promise<RecordSupplyRunOutcome[]> {
  const runId = opts?.runId ?? `router:${report.startedAt}`;
  const inputs: SupplyRunInput[] = report.runs.map((run) => {
    const mine = report.uniqueCandidates.filter((c) => c.sourceId === run.sourceId);
    return {
      runId,
      sourceId: run.sourceId,
      sourceFamily: run.family,
      startedAt: report.startedAt,
      finishedAt: report.finishedAt,
      status: inferSupplyRunStatus({
        attempted: run.attempted,
        ok: run.ok,
        isolatedFailure: run.isolatedFailure,
        skippedReason: run.skippedReason,
        candidates: run.candidates,
        errors: run.errors,
      }),
      candidatesDiscovered: run.candidates,
      candidatesQualified: run.unique,
      verifiedDeals: run.verifiedDeals,
      promotions: run.promotions,
      potentialDeals: mine.filter((c) => c.qualification === 'POTENTIAL_DEAL').length,
      catalogOnly: run.catalogOnly,
      duplicates: run.duplicates,
      rejected: mine.filter((c) => c.verifierDecision === 'reject').length,
      pending: mine.filter((c) => c.verifierDecision !== 'reject').length,
      errors: run.errors,
      shadowCycleId: opts?.shadowCycleId ?? null,
    };
  });
  return recordSupplyRuns(
    inputs,
    opts?.supabase !== undefined
      ? { supabase: opts.supabase, allowInTests: opts?.allowInTests }
      : { allowInTests: opts?.allowInTests },
  );
}

export function persistIngestSupplyRuns(input: {
  runId: string;
  startedAt: string;
  finishedAt: string;
  sourceStats: Partial<Record<IngestSourceId, IngestSourceStats>>;
  qualificationBySource?: Partial<Record<IngestSourceId, QualificationCounts>>;
  rejectedBySource?: Partial<Record<IngestSourceId, number>>;
  pendingBySource?: Partial<Record<IngestSourceId, number>>;
  shadowCycleId?: string | null;
  supabase?: SupabaseClient | null;
  allowInTests?: boolean;
}): Promise<RecordSupplyRunOutcome[]> {
  const rows: SupplyRunInput[] = [];
  for (const [source, stats] of Object.entries(input.sourceStats) as Array<
    [IngestSourceId, IngestSourceStats]
  >) {
    const activity =
      (stats.collected ?? 0) +
      (stats.evaluated ?? 0) +
      (stats.inserted ?? 0) +
      (stats.duplicate ?? 0) +
      (stats.skipped ?? 0) +
      (stats.errors ?? 0);
    if (activity <= 0) continue;
    const mapped = INGEST_TO_SUPPLY[source] ?? { sourceId: source, family: 'core' as const };
    const qual = input.qualificationBySource?.[source] ?? emptyQualificationCounts();
    const errors = stats.errors ?? 0;
    const status: SupplyRunStatus =
      errors > 0 && (stats.collected ?? 0) <= 0
        ? 'failed'
        : (stats.collected ?? 0) <= 0
          ? 'zero'
          : errors > 0
            ? 'degraded'
            : 'ok';
    rows.push({
      runId: input.runId,
      sourceId: mapped.sourceId,
      sourceFamily: mapped.family,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      status,
      candidatesDiscovered: stats.collected,
      candidatesQualified: stats.evaluated,
      verifiedDeals: qual.verifiedDeals,
      promotions: qual.promotions,
      potentialDeals: qual.potentialDeals,
      catalogOnly: qual.catalogOnly,
      duplicates: stats.duplicate,
      rejected: input.rejectedBySource?.[source] ?? 0,
      pending: input.pendingBySource?.[source] ?? stats.inserted,
      errors,
      shadowCycleId: input.shadowCycleId ?? null,
    });
  }
  return recordSupplyRuns(
    rows,
    input.supabase !== undefined
      ? { supabase: input.supabase, allowInTests: input.allowInTests }
      : { allowInTests: input.allowInTests },
  );
}

export function persistCommunitySupplyRun(input: {
  runId: string;
  startedAt: string;
  finishedAt?: string;
  evaluation: CommunityQualityEvaluation | null;
  duplicate?: boolean;
  insertedPending?: boolean;
  qualityError?: boolean;
  supabase?: SupabaseClient | null;
  allowInTests?: boolean;
}): Promise<RecordSupplyRunOutcome[]> {
  const finishedAt = input.finishedAt ?? new Date().toISOString();
  const ev = input.evaluation;
  const q = ev?.qualification ?? null;
  const status: SupplyRunStatus = input.qualityError
    ? 'degraded'
    : input.duplicate
      ? 'ok'
      : q
        ? 'ok'
        : 'degraded';
  return recordSupplyRuns(
    [
      {
        runId: input.runId,
        sourceId: 'community',
        sourceFamily: 'community',
        startedAt: input.startedAt,
        finishedAt,
        status,
        candidatesDiscovered: 1,
        candidatesQualified: q ? 1 : 0,
        verifiedDeals: q === 'VERIFIED_DEAL' ? 1 : 0,
        promotions: q === 'PROMOTION' ? 1 : 0,
        potentialDeals: q === 'POTENTIAL_DEAL' ? 1 : 0,
        catalogOnly: q === 'NO_VERIFIED_DEAL' || !q ? 1 : 0,
        duplicates: input.duplicate ? 1 : 0,
        rejected: ev?.verifierDecision === 'reject' ? 1 : 0,
        pending: input.insertedPending || (!input.duplicate && ev?.persistStatus === 'pending') ? 1 : 0,
        errors: input.qualityError || ev?.qualityError ? 1 : 0,
      },
    ],
    input.supabase !== undefined
      ? { supabase: input.supabase, allowInTests: input.allowInTests }
      : { allowInTests: input.allowInTests },
  );
}
