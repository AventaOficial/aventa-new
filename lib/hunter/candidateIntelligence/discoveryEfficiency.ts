/**
 * Discovery efficiency — request-cost proxy metrics.
 * When monetary API cost is unavailable, successful_discovery_request is the cost unit.
 */

export type DiscoveryEfficiencyInput = {
  /** Successful HTTP discovery requests (200). */
  successfulRequests: number;
  /** Failed requests (403/5xx/timeout). */
  failedRequests?: number;
  http403?: number;
  candidatesObserved: number;
  uniqueUrls: number;
  uniqueIdentities: number;
  uniqueProducts: number;
  /** WOULD_INSERT + INSERTED_PENDING (observation). */
  goodCandidates: number;
  /** Verified REAL_GOOD discount class among good. */
  verifiedGoodCandidates?: number;
  unknownDiscountCount?: number;
  realLowCount?: number;
};

export type DiscoveryEfficiencyReport = {
  candidate_per_request: number | null;
  unique_url_per_request: number | null;
  unique_product_per_request: number | null;
  unique_identity_per_request: number | null;
  good_candidate_per_request: number | null;
  /** Primary operational metric. */
  DISCOVERY_EFFICIENCY: number | null;
  request_cost_proxy: 'successful_discovery_request';
  request_cost_note: string;
  API_failure_rate: number | null;
  rate_403: number | null;
  repeat_rate: number | null;
  unknown_rate: number | null;
  quality_rate: number | null;
  classification: 'FACT' | 'INFERENCE';
};

function div(n: number, d: number): number | null {
  if (!(d > 0)) return null;
  return Math.round((n / d) * 10000) / 10000;
}

export function computeDiscoveryEfficiency(input: DiscoveryEfficiencyInput): DiscoveryEfficiencyReport {
  const req = input.successfulRequests;
  const failed = input.failedRequests ?? 0;
  const totalReq = req + failed;
  const verified = input.verifiedGoodCandidates ?? input.goodCandidates;

  return {
    candidate_per_request: div(input.candidatesObserved, req),
    unique_url_per_request: div(input.uniqueUrls, req),
    unique_product_per_request: div(input.uniqueProducts, req),
    unique_identity_per_request: div(input.uniqueIdentities, req),
    good_candidate_per_request: div(input.goodCandidates, req),
    DISCOVERY_EFFICIENCY: div(verified, req),
    request_cost_proxy: 'successful_discovery_request',
    request_cost_note:
      'Monetary API cost unavailable — cost proxy = count of successful discovery HTTP requests.',
    API_failure_rate: div(failed, totalReq),
    rate_403: div(input.http403 ?? 0, totalReq),
    repeat_rate: div(
      Math.max(0, input.candidatesObserved - input.uniqueUrls),
      input.candidatesObserved,
    ),
    unknown_rate: div(input.unknownDiscountCount ?? 0, input.candidatesObserved),
    quality_rate: div(input.goodCandidates, input.candidatesObserved),
    classification: req > 0 ? 'FACT' : 'INFERENCE',
  };
}
