import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import type { ScoreBreakdown } from '@/lib/bots/ingest/scoreIngestCandidate';
import type { IngestSingleResult } from '@/lib/bots/ingest/types';
import { buildHunterCandidateRecord } from './buildCandidateRecord';
import { buildHunterIntelligenceRunSummary } from './runReport';
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
 * Build durable Candidate Intelligence records for one ingest cycle / worker batch.
 * Captures discovery skips, pool/topk cuts, evaluated outcomes. Observation only.
 */
export function observeIngestBatch(input: {
  runId: string;
  startedAt: string;
  finishedAt: string;
  source?: string;
  dryRun: boolean;
  rawCandidateUrls: Array<{ url: string; title?: string | null; reason?: string; source?: string }>;
  itemUrls: string[];
  sliceUrls: string[];
  results: IngestSingleResult[];
  metaByUrl: Map<string, ParsedOfferMetadata>;
  resolvedByUrl: Map<string, ObservedResolved>;
  nmSuppressedUrls?: Set<string>;
  diversityCutUrls?: string[];
  topKCutUrls?: string[];
}): { records: HunterCandidateRecord[]; summary: HunterIntelligenceRunSummary } {
  const defaultSource = input.source ?? 'ml_api';
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
  const resultUrls = new Set(
    input.results.filter((r) => r.url?.trim()).map((r) => r.url.toLowerCase()),
  );

  for (const raw of input.rawCandidateUrls) {
    const url = raw.url?.trim();
    if (!url) continue;
    if (itemSet.has(url.toLowerCase())) continue;
    push(
      buildHunterCandidateRecord({
        runId: input.runId,
        source: raw.source ?? defaultSource,
        url,
        meta: null,
        status: 'skipped',
        reason: raw.reason ?? 'identity_invalid',
        evidence: { titleHint: raw.title ?? null, intake: true },
      }),
    );
  }

  for (const url of input.itemUrls) {
    if (sliceSet.has(url.toLowerCase())) continue;
    if (resultUrls.has(url.toLowerCase())) continue;
    push(
      buildHunterCandidateRecord({
        runId: input.runId,
        source: defaultSource,
        url,
        meta: input.metaByUrl.get(url) ?? null,
        status: 'skipped',
        reason: 'candidate_pool_truncated',
        evidence: { poolCut: true },
      }),
    );
  }

  for (const url of input.diversityCutUrls ?? []) {
    if (resultUrls.has(url.toLowerCase())) continue;
    const resolved = input.resolvedByUrl.get(url);
    push(
      buildHunterCandidateRecord({
        runId: input.runId,
        source: defaultSource,
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

  for (const url of input.topKCutUrls ?? []) {
    if (resultUrls.has(url.toLowerCase())) continue;
    const resolved = input.resolvedByUrl.get(url);
    push(
      buildHunterCandidateRecord({
        runId: input.runId,
        source: defaultSource,
        url,
        meta: resolved?.meta ?? input.metaByUrl.get(url) ?? null,
        status: 'skipped',
        reason: 'score_shortlist_cut',
        scoreDecision: resolved?.decision ?? null,
        scoreTotal: resolved?.total ?? null,
        breakdown: resolved?.breakdown ?? null,
        machineEligible: true,
        evidence: { topKCut: true },
      }),
    );
  }

  for (const result of input.results) {
    const url = result.url?.trim();
    if (!url) continue;
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

    if (result.status === 'inserted' && input.dryRun) {
      status = 'would_insert';
      reason = 'dry_run_simulated';
    }

    push(
      buildHunterCandidateRecord({
        runId: input.runId,
        source: result.source ?? defaultSource,
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

/** Alias for worker path. */
export function observeExternalWorkerBatch(
  input: Parameters<typeof observeIngestBatch>[0],
): ReturnType<typeof observeIngestBatch> {
  return observeIngestBatch(input);
}

/** discovered must equal sum of decisionBreakdown (each row is one terminal decision). */
export function assertZeroSilentDrops(summary: HunterIntelligenceRunSummary): {
  ok: boolean;
  discovered: number;
  terminalSum: number;
  gap: number;
} {
  const discovered = summary.candidateCount;
  const terminalSum = Object.values(summary.decisionBreakdown).reduce((a, b) => a + b, 0);
  return {
    ok: discovered === terminalSum,
    discovered,
    terminalSum,
    gap: discovered - terminalSum,
  };
}
