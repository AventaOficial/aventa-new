/**
 * Universo retailerDiscovery. Process memory.
 * No mezclar con source health, qualification, surfaceDiscovery ni autonomousPct.
 */
import type { RetailerDiscoveryId, RetailerDiscoveryMatrixRow, SurfaceDiscoveryResult } from './types';
import { RETAILER_DISCOVERY_PROFILES } from './profiles';
import { evidenceYield } from './classify';

type Acc = {
  retailer: RetailerDiscoveryId;
  surfacesTested: number;
  candidates: number;
  offerEvidence: number;
  verifiedDeals: number;
  promotions: number;
  catalogOnly: number;
  potential: number;
  errors: number;
};

const acc = new Map<RetailerDiscoveryId, Acc>();

function emptyAcc(retailer: RetailerDiscoveryId): Acc {
  return {
    retailer,
    surfacesTested: 0,
    candidates: 0,
    offerEvidence: 0,
    verifiedDeals: 0,
    promotions: 0,
    catalogOnly: 0,
    potential: 0,
    errors: 0,
  };
}

export function recordRetailerSurfaceDiscovery(row: SurfaceDiscoveryResult) {
  const prev = acc.get(row.retailer) ?? emptyAcc(row.retailer);
  prev.surfacesTested += 1;
  prev.candidates += row.candidateCount;
  prev.offerEvidence += row.offerEvidenceCount;
  prev.verifiedDeals += row.verifiedDeals;
  prev.promotions += row.promotionCount;
  prev.catalogOnly += row.catalogOnlyCount;
  prev.potential += row.potentialCount;
  prev.errors += row.errors;
  acc.set(row.retailer, prev);
}

export function resetRetailerDiscoveryMetrics() {
  acc.clear();
}

export function summarizeRetailerDiscoveryMatrix(): RetailerDiscoveryMatrixRow[] {
  return RETAILER_DISCOVERY_PROFILES.map((profile) => {
    const live = acc.get(profile.retailer);
    return {
      retailer: profile.retailer,
      displayName: profile.displayName,
      status: profile.complianceStatus,
      implementationStatus: profile.implementationStatus,
      surfacesTested: live?.surfacesTested ?? 0,
      candidates: live?.candidates ?? 0,
      evidenceYield: evidenceYield(live?.offerEvidence ?? 0, live?.candidates ?? 0),
      verifiedDeals: live?.verifiedDeals ?? 0,
      promotions: live?.promotions ?? 0,
      catalogOnly: live?.catalogOnly ?? 0,
      potential: live?.potential ?? 0,
      errors: live?.errors ?? 0,
      antiBotRisk: profile.antiBotRisk,
      recommendation: profile.recommendation,
    };
  });
}
