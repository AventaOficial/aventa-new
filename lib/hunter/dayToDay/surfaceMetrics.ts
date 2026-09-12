/**
 * Universo de superficies Day-to-Day. No mezclar con source health ni autonomousPct.
 */
export type SurfaceDiscoveryRow = {
  surfaceId: string;
  requests: number;
  candidates: number;
  products: number;
  verifiedDeals: number;
  promotions: number;
  potentialDeals: number;
  catalogOnly: number;
  errors: number;
  latencyMs: number;
  evidenceQuality: 'high' | 'medium' | 'low';
  productBindingSuccess: number;
};

const rows = new Map<string, SurfaceDiscoveryRow>();

function emptyRow(surfaceId: string): SurfaceDiscoveryRow {
  return {
    surfaceId,
    requests: 0,
    candidates: 0,
    products: 0,
    verifiedDeals: 0,
    promotions: 0,
    potentialDeals: 0,
    catalogOnly: 0,
    errors: 0,
    latencyMs: 0,
    evidenceQuality: 'low',
    productBindingSuccess: 0,
  };
}

function qualityOf(row: SurfaceDiscoveryRow): SurfaceDiscoveryRow['evidenceQuality'] {
  if (row.verifiedDeals + row.promotions > 0) return 'high';
  if (row.products > 0) return 'medium';
  return 'low';
}

export function recordSurfaceDiscovery(patch: Partial<SurfaceDiscoveryRow> & { surfaceId: string }) {
  const prev = rows.get(patch.surfaceId) ?? emptyRow(patch.surfaceId);
  const next: SurfaceDiscoveryRow = {
    ...prev,
    requests: prev.requests + (patch.requests ?? 0),
    candidates: prev.candidates + (patch.candidates ?? 0),
    products: prev.products + (patch.products ?? 0),
    verifiedDeals: prev.verifiedDeals + (patch.verifiedDeals ?? 0),
    promotions: prev.promotions + (patch.promotions ?? 0),
    potentialDeals: prev.potentialDeals + (patch.potentialDeals ?? 0),
    catalogOnly: prev.catalogOnly + (patch.catalogOnly ?? 0),
    errors: prev.errors + (patch.errors ?? 0),
    latencyMs: prev.latencyMs + (patch.latencyMs ?? 0),
    evidenceQuality: 'low',
    productBindingSuccess: 0,
  };
  const bound = next.verifiedDeals + next.promotions;
  next.productBindingSuccess = next.products > 0 ? Math.round((bound / next.products) * 1000) / 10 : 0;
  next.evidenceQuality = qualityOf(next);
  rows.set(patch.surfaceId, next);
}

export function getSurfaceDiscoveryMetrics(): SurfaceDiscoveryRow[] {
  return [...rows.values()];
}

export function resetSurfaceDiscoveryMetrics() {
  rows.clear();
}
