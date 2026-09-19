import { candidateIdentityKey, hasVerifiedOpportunitySignals } from './identity';
import type {
  AventaOpportunityEvaluation,
  HunterBenchmarkCandidate,
  HunterBenchmarkMetrics,
  HunterResult,
} from './types';

export function countCandidatesFound(result: HunterResult): number {
  return result.candidates.length;
}

export function countVerifiedOpportunities(candidates: HunterBenchmarkCandidate[]): number {
  return candidates.filter(hasVerifiedOpportunitySignals).length;
}

export function countDuplicates(candidates: HunterBenchmarkCandidate[]): number {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const candidate of candidates) {
    const key = candidateIdentityKey(candidate);
    if (!key) continue;
    if (seen.has(key)) {
      duplicates += 1;
    } else {
      seen.add(key);
    }
  }
  return duplicates;
}

type MatchRow = {
  hunter: HunterBenchmarkCandidate;
  aventa: AventaOpportunityEvaluation | null;
};

function buildEvaluationIndex(
  evaluations: AventaOpportunityEvaluation[],
): Map<string, AventaOpportunityEvaluation> {
  const index = new Map<string, AventaOpportunityEvaluation>();
  for (const evaluation of evaluations) {
    index.set(evaluation.candidateKey, evaluation);
    if (evaluation.sourceUrl) {
      index.set(`url:${evaluation.sourceUrl}`, evaluation);
    }
  }
  return index;
}

function matchCandidates(
  candidates: HunterBenchmarkCandidate[],
  evaluations: AventaOpportunityEvaluation[],
): MatchRow[] {
  const index = buildEvaluationIndex(evaluations);
  return candidates.map((candidate) => {
    const key = candidateIdentityKey(candidate);
    const aventa = key ? index.get(key) ?? null : null;
    return { hunter: candidate, aventa };
  });
}

export function countFalsePositives(
  candidates: HunterBenchmarkCandidate[],
  evaluations: AventaOpportunityEvaluation[],
): number {
  const rows = matchCandidates(candidates, evaluations);
  return rows.filter((row) => {
    if (!hasVerifiedOpportunitySignals(row.hunter)) return false;
    if (!row.aventa) return true;
    return !row.aventa.isOpportunity;
  }).length;
}

export function countTruePositives(
  candidates: HunterBenchmarkCandidate[],
  evaluations: AventaOpportunityEvaluation[],
): number {
  const rows = matchCandidates(candidates, evaluations);
  return rows.filter(
    (row) =>
      hasVerifiedOpportunitySignals(row.hunter) &&
      row.aventa !== null &&
      row.aventa.isOpportunity,
  ).length;
}

export function countFalseNegatives(
  evaluations: AventaOpportunityEvaluation[],
  candidates: HunterBenchmarkCandidate[],
): number {
  const hunterKeys = new Set(
    candidates.map(candidateIdentityKey).filter((key): key is string => key !== null),
  );
  return evaluations.filter(
    (evaluation) => evaluation.isOpportunity && !hunterKeys.has(evaluation.candidateKey),
  ).length;
}

export function computePriceAccuracy(
  candidates: HunterBenchmarkCandidate[],
  evaluations: AventaOpportunityEvaluation[],
): number | null {
  const rows = matchCandidates(candidates, evaluations);
  const deltas: number[] = [];
  for (const row of rows) {
    const hunterPrice = row.hunter.currentPrice?.amount;
    const aventaPrice = row.aventa?.currentPrice;
    if (
      hunterPrice === undefined ||
      hunterPrice === null ||
      aventaPrice === null ||
      aventaPrice === undefined ||
      aventaPrice <= 0
    ) {
      continue;
    }
    const delta = Math.abs(hunterPrice - aventaPrice) / aventaPrice;
    if (Number.isFinite(delta)) deltas.push(delta);
  }
  if (deltas.length === 0) return null;
  const avgDelta = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
  return Math.max(0, 1 - avgDelta);
}

export function computeDetectionLatencyMs(
  candidates: HunterBenchmarkCandidate[],
  evaluations: AventaOpportunityEvaluation[],
): number | null {
  const rows = matchCandidates(candidates, evaluations);
  const latencies: number[] = [];
  for (const row of rows) {
    if (!row.aventa) continue;
    const hunterAt = Date.parse(row.hunter.discoveredAt);
    const aventaAt = Date.parse(row.aventa.evaluatedAt);
    if (!Number.isFinite(hunterAt) || !Number.isFinite(aventaAt)) continue;
    latencies.push(Math.max(0, aventaAt - hunterAt));
  }
  if (latencies.length === 0) return null;
  latencies.sort((a, b) => a - b);
  const mid = Math.floor(latencies.length / 2);
  if (latencies.length % 2 === 0) {
    return Math.round((latencies[mid - 1] + latencies[mid]) / 2);
  }
  return Math.round(latencies[mid]);
}

export function computePrecision(
  truePositives: number,
  falsePositives: number,
): number | null {
  const denominator = truePositives + falsePositives;
  if (denominator === 0) return null;
  return truePositives / denominator;
}

export function computeHunterBenchmarkMetrics(
  result: HunterResult,
  evaluations: AventaOpportunityEvaluation[],
): HunterBenchmarkMetrics {
  const candidates = result.candidates;
  const truePositives = countTruePositives(candidates, evaluations);
  const falsePositives = countFalsePositives(candidates, evaluations);
  return {
    candidatesFound: countCandidatesFound(result),
    verifiedOpportunities: countVerifiedOpportunities(candidates),
    falsePositives,
    duplicates: countDuplicates(candidates),
    priceAccuracy: computePriceAccuracy(candidates, evaluations),
    detectionLatencyMs: computeDetectionLatencyMs(candidates, evaluations),
    precision: computePrecision(truePositives, falsePositives),
    truePositives,
    falseNegatives: countFalseNegatives(evaluations, candidates),
  };
}
