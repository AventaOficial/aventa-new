/**
 * Universo supplyOrchestration. Process memory.
 * No mezclar con source health, qualification counters ni autonomousPct.
 */
import type { SupplyContributionRow, SupplyRouterReport, SupplySourceId } from './types';

let lastRun: SupplyRouterReport | null = null;

export function recordSupplyRouterRun(report: SupplyRouterReport) {
  lastRun = report;
}

export function peekLastSupplyRouterRun(): SupplyRouterReport | null {
  return lastRun;
}

export function resetSupplyOrchestrationMetrics() {
  lastRun = null;
}

export function contributionRows(report: SupplyRouterReport | null): SupplyContributionRow[] {
  if (!report) return [];
  const totalVerified = report.runs.reduce((n, r) => n + r.verifiedDeals, 0);
  return report.runs.map((r) => ({
    sourceId: r.sourceId as SupplySourceId,
    family: r.family,
    candidates: r.candidates,
    unique: r.unique,
    verified: r.verifiedDeals,
    duplicates: r.duplicates,
    errors: r.errors,
    contributionPct:
      totalVerified > 0 ? Math.round((r.verifiedDeals / totalVerified) * 1000) / 10 : 0,
  }));
}

export function summarizeLastSupplyRun() {
  const run = lastRun;
  return {
    candidatesDiscovered: run?.candidatesDiscovered ?? 0,
    candidatesQualified: run?.candidatesQualified ?? 0,
    verifiedDeals: run?.verifiedDeals ?? 0,
    promotions: run?.promotions ?? 0,
    catalogOnly: run?.catalogOnly ?? 0,
    duplicates: run?.duplicates ?? 0,
    rejected: run?.rejected ?? 0,
    pending: run?.pending ?? 0,
    sourceFailures: run?.sourceFailures ?? 0,
    communityShare: run?.communityShare ?? 0,
    machineShare: run?.machineShare ?? 0,
    verifiedDealRate: run?.verifiedDealRate ?? 0,
    duplicateRate: run?.duplicateRate ?? 0,
    persisted: false as const,
  };
}
