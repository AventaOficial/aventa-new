/**
 * In-memory observability for ML affiliate provider (no PII / secrets).
 */

export type MercadoLibreAffiliateMetrics = {
  providerRequests: number;
  providerSuccess: number;
  providerFailures: number;
  providerRateLimited: number;
  eventsReceived: number;
  conversionsNormalized: number;
  commissionsNormalized: number;
  unattributed: number;
  unresolved: number;
  duplicates: number;
  revisions: number;
  reconciliationMatches: number;
  reconciliationMismatches: number;
  lastSuccessfulSyncAt: string | null;
  lastFailedSyncAt: string | null;
  lastErrorCode: string | null;
};

const metrics: MercadoLibreAffiliateMetrics = {
  providerRequests: 0,
  providerSuccess: 0,
  providerFailures: 0,
  providerRateLimited: 0,
  eventsReceived: 0,
  conversionsNormalized: 0,
  commissionsNormalized: 0,
  unattributed: 0,
  unresolved: 0,
  duplicates: 0,
  revisions: 0,
  reconciliationMatches: 0,
  reconciliationMismatches: 0,
  lastSuccessfulSyncAt: null,
  lastFailedSyncAt: null,
  lastErrorCode: null,
};

export function getMercadoLibreAffiliateMetrics(): Readonly<MercadoLibreAffiliateMetrics> {
  return { ...metrics };
}

export function resetMercadoLibreAffiliateMetricsForTests(): void {
  metrics.providerRequests = 0;
  metrics.providerSuccess = 0;
  metrics.providerFailures = 0;
  metrics.providerRateLimited = 0;
  metrics.eventsReceived = 0;
  metrics.conversionsNormalized = 0;
  metrics.commissionsNormalized = 0;
  metrics.unattributed = 0;
  metrics.unresolved = 0;
  metrics.duplicates = 0;
  metrics.revisions = 0;
  metrics.reconciliationMatches = 0;
  metrics.reconciliationMismatches = 0;
  metrics.lastSuccessfulSyncAt = null;
  metrics.lastFailedSyncAt = null;
  metrics.lastErrorCode = null;
}

export function recordMercadoLibreAffiliateFailure(code: string): void {
  metrics.providerRequests += 1;
  metrics.providerFailures += 1;
  metrics.lastFailedSyncAt = new Date().toISOString();
  metrics.lastErrorCode = code;
}
