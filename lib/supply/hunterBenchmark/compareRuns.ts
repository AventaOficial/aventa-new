import { candidateIdentityKey } from './identity';
import { computeHunterBenchmarkMetrics } from './metrics';
import type {
  AventaOpportunityEvaluation,
  BenchmarkComparison,
  HunterResult,
} from './types';

export type CompareRunsInput = {
  hunterResult: HunterResult;
  aventaEvaluations: AventaOpportunityEvaluation[];
  comparedAt?: string;
};

export function compareHunterRun(input: CompareRunsInput): BenchmarkComparison {
  const comparedAt = input.comparedAt ?? new Date().toISOString();
  const metrics = computeHunterBenchmarkMetrics(
    input.hunterResult,
    input.aventaEvaluations,
  );

  let matchedCandidates = 0;
  for (const candidate of input.hunterResult.candidates) {
    const key = candidateIdentityKey(candidate);
    if (!key) continue;
    const matched = input.aventaEvaluations.some(
      (evaluation) => evaluation.candidateKey === key,
    );
    if (matched) matchedCandidates += 1;
  }

  return {
    hunterId: input.hunterResult.hunterId,
    runId: input.hunterResult.runId,
    sourceId: input.hunterResult.sourceId,
    comparedAt,
    metrics,
    matchedCandidates,
    unmatchedCandidates: input.hunterResult.candidates.length - matchedCandidates,
  };
}

export function compareMultipleHunterRuns(
  hunterResults: HunterResult[],
  aventaEvaluations: AventaOpportunityEvaluation[],
  comparedAt?: string,
): BenchmarkComparison[] {
  const at = comparedAt ?? new Date().toISOString();
  return hunterResults.map((hunterResult) =>
    compareHunterRun({
      hunterResult,
      aventaEvaluations,
      comparedAt: at,
    }),
  );
}

export function rankComparisonsByPrecision(
  comparisons: BenchmarkComparison[],
): BenchmarkComparison[] {
  return [...comparisons].sort((a, b) => {
    const aPrecision = a.metrics.precision ?? -1;
    const bPrecision = b.metrics.precision ?? -1;
    if (bPrecision !== aPrecision) return bPrecision - aPrecision;
    const aVerified = a.metrics.verifiedOpportunities;
    const bVerified = b.metrics.verifiedOpportunities;
    return bVerified - aVerified;
  });
}
