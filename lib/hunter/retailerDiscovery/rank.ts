import type { RetailerDiscoveryProfile, RetailerDiscoveryRun, RetailerDiscoveryStatus } from './types';

const COMPLIANCE_RANK: Record<RetailerDiscoveryStatus, number> = {
  READY: 5,
  DEGRADED: 3,
  CATALOG_ONLY: 2,
  NOT_CONFIGURED: 1,
  DISABLED: 0,
  BLOCKED_PENDING_POLICY_REVIEW: -1,
};

const COMPLEXITY_PENALTY = { low: 0, medium: 1, high: 2 } as const;

/**
 * Ranking por evidencia, no por volumen.
 * 1 evidence yield  2 stability  3 compliance  4 quality  5 complexity  6 frequency
 */
export function rankRetailerRuns(
  profiles: RetailerDiscoveryProfile[],
  runs: RetailerDiscoveryRun[],
): RetailerDiscoveryProfile[] {
  const byId = new Map(runs.map((r) => [r.retailer, r]));
  return [...profiles].sort((a, b) => {
    const ra = byId.get(a.retailer);
    const rb = byId.get(b.retailer);
    const yieldA = ra?.evidenceYield ?? 0;
    const yieldB = rb?.evidenceYield ?? 0;
    if (yieldB !== yieldA) return yieldB - yieldA;
    const stabA = ra ? (ra.antiBot ? 0 : 1) - (ra.errors > 0 ? 1 : 0) : 0;
    const stabB = rb ? (rb.antiBot ? 0 : 1) - (rb.errors > 0 ? 1 : 0) : 0;
    if (stabB !== stabA) return stabB - stabA;
    const comp = COMPLIANCE_RANK[b.complianceStatus] - COMPLIANCE_RANK[a.complianceStatus];
    if (comp !== 0) return comp;
    const qualA = (ra?.verifiedDeals ?? 0) + (ra?.promotionCount ?? 0);
    const qualB = (rb?.verifiedDeals ?? 0) + (rb?.promotionCount ?? 0);
    if (qualB !== qualA) return qualB - qualA;
    const cx = COMPLEXITY_PENALTY[a.complexity] - COMPLEXITY_PENALTY[b.complexity];
    if (cx !== 0) return cx;
    const freq = (b.expectedSupplyFrequency === 'low' ? 1 : 0) - (a.expectedSupplyFrequency === 'low' ? 1 : 0);
    return freq;
  });
}
