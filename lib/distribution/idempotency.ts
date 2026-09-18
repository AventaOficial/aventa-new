/**
 * Build deterministic idempotency key for offer×destination×version.
 * DB UNIQUE(offer_id, destination_id, distribution_version) is authoritative;
 * this string mirrors that triple for logs / conflict handling.
 */
export function buildDistributionIdempotencyKey(input: {
  offerId: string;
  destinationId: string;
  distributionVersion: number;
}): string {
  const version = Number.isFinite(input.distributionVersion)
    ? Math.max(1, Math.floor(input.distributionVersion))
    : 1;
  return `${input.offerId}:${input.destinationId}:v${version}`;
}
