import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import type { ScoreBreakdown } from '@/lib/bots/ingest/scoreIngestCandidate';
import type { IngestSingleResult } from '@/lib/bots/ingest/types';
import { buildHunterCandidateRecord } from './buildCandidateRecord';
import { buildHunterIntelligenceRunSummary } from './runReport';
import type { Disposition } from './taxonomy';
import type { HunterCandidateRecord, HunterIntelligenceRunSummary } from './types';

export type ObservedResolved = {
  meta: ParsedOfferMetadata;
  decision: 'auto_approve' | 'pending' | 'reject';
  total: number;
  breakdown: ScoreBreakdown;
  machineQualityDecision?: string | null;
  dqeQualification?: string | null;
  reasonCodes?: string[];
  negativeMemoryLevel?: string | null;
};

/**
 * Build durable Candidate Intelligence records for one external worker batch.
 * Captures identity-invalid, pool-truncated, evaluated, suppressed, and mint outcomes.
 * Does not mint. Does not change publication gates.
 */
export function observeExternalWorkerBatch(input: {
  runId: string;
  startedAt: string;
  finishedAt: string;
  source?: string;
  dryRun: boolean;
  /** Raw discovery count before identity filter. */
  rawCandidateUrls: Array<{ url: string; title?: string | null; reason?: string }>;
  /** URLs that became IngestItems (identity-valid). */
  itemUrls: string[];
  /** URLs actually evaluated (after candidatePoolMax slice). */
  sliceUrls: string[];
  /** Final ingest results (may omit pool-cut / identity-invalid). */
  results: IngestSingleResult[];
  /** Meta captured during evaluation (url → meta). */
  metaByUrl: Map<string, ParsedOfferMetadata>;
  /** Score context for resolved / scored candidates. */
  resolvedByUrl: Map<string, ObservedResolved>;
  /** URLs suppressed by negative memory (already in results, used for NM level). */
  nmSuppressedUrls?: Set<string>;
  /** URLs that passed quality but missed diversity shortlist (silent drop today). */
  diversityCutUrls?: string[];
}): { records: HunterCandidateRecord[]; summary: HunterIntelligenceRunSummary } {
  const source = input.source ?? 'ml_worker';
  const seenKeys = new Set<string>();
  const records: HunterCandidateRecord[] = [];

  const push = (rec: HunterCandidateRecord) => {
    const key = `${rec.candidateKey}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    records.push(rec);
  };

  const itemSet = new Set(input.itemUrls.map((u) => u.toLowerCase()));
  const sliceSet = new Set(input.sliceUrls.map((u) => u.toLowerCase()));
  const resultUrls = new Set(input.results.map((r) => r.url.toLowerCase()));

  // 1) Identity-invalid / blocked at intake (never reach results today).
  for (const raw of input.rawCandidateUrls) {
    const url = raw.url?.trim();
    if (!url) continue;
    if (itemSet.has(url.toLowerCase())) continue;
    push(
      buildHunterCandidateRecord({
        runId: input.runId,
        source,
        url,
        meta: null,
        status: 'skipped',
        reason: raw.reason ?? 'identity_invalid',
        evidence: { titleHint: raw.title ?? null, intake: true },
      }),
    );
  }

  // 2) Pool truncated (identity-valid but beyond candidatePoolMax).
  for (const url of input.itemUrls) {
    if (sliceSet.has(url.toLowerCase())) continue;
    if (resultUrls.has(url.toLowerCase())) continue;
    push(
      buildHunterCandidateRecord({
        runId: input.runId,
        source,
        url,
        meta: input.metaByUrl.get(url) ?? null,
        status: 'skipped',
        reason: 'candidate_pool_truncated',
        evidence: { poolCut: true },
      }),
    );
  }

  // 3) Diversity / budget cut after resolve (silent today).
  for (const url of input.diversityCutUrls ?? []) {
    if (resultUrls.has(url.toLowerCase())) continue;
    const resolved = input.resolvedByUrl.get(url);
    push(
      buildHunterCandidateRecord({
        runId: input.runId,
        source,
        url,
        meta: resolved?.meta ?? input.metaByUrl.get(url) ?? null,
        status: 'skipped',
        reason: 'diversity_cut',
        scoreDecision: resolved?.decision ?? null,
        scoreTotal: resolved?.total ?? null,
        breakdown: resolved?.breakdown ?? null,
        machineEligible: true,
        machineQualityDecision: resolved?.machineQualityDecision ?? null,
        dqeQualification: resolved?.dqeQualification ?? null,
        reasonCodes: resolved?.reasonCodes ?? [],
        diversityCut: true,
        evidence: { diversityCut: true },
      }),
    );
  }

  // 4) Every explicit result row.
  for (const result of input.results) {
    const url = result.url;
    const resolved = input.resolvedByUrl.get(url);
    const meta = resolved?.meta ?? input.metaByUrl.get(url) ?? null;
    const nm = input.nmSuppressedUrls?.has(url) === true;

    let status: 'skipped' | 'inserted' | 'duplicate' | 'error' | 'would_insert' | 'resolved' =
      result.status === 'inserted'
        ? 'inserted'
        : result.status === 'duplicate'
          ? 'duplicate'
          : result.status === 'error'
            ? 'error'
            : 'skipped';
    let reason: string | null =
      result.status === 'skipped'
        ? result.reason
        : result.status === 'error'
          ? result.message
          : result.status === 'duplicate'
            ? result.duplicateKind ?? 'duplicate'
            : null;

    let dispositionOverride: Disposition | null = null;
    if (result.status === 'inserted' && input.dryRun) {
      status = 'would_insert';
      reason = 'dry_run_simulated';
    }

    push(
      buildHunterCandidateRecord({
        runId: input.runId,
        source: result.source ?? source,
        url,
        meta,
        status,
        reason,
        scoreDecision: resolved?.decision ?? null,
        scoreTotal: resolved?.total ?? null,
        breakdown: resolved?.breakdown ?? null,
        machineEligible: resolved ? true : null,
        machineQualityDecision: resolved?.machineQualityDecision ?? null,
        dqeQualification: resolved?.dqeQualification ?? null,
        reasonCodes: resolved?.reasonCodes ?? [],
        negativeMemoryLevel: nm ? 'SUPPRESS' : resolved?.negativeMemoryLevel ?? null,
        insertedOfferId:
          result.status === 'inserted' && !input.dryRun ? result.offerId : null,
        duplicateOf: result.status === 'duplicate' ? result.duplicateKind ?? 'duplicate' : null,
        dispositionOverride,
        evidence: {
          ingestStatus: result.status,
          dryRun: input.dryRun,
        },
      }),
    );
  }

  const summary = buildHunterIntelligenceRunSummary({
    runId: input.runId,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    records,
  });

  return { records, summary };
}
