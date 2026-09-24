/**
 * Reconstructable hops. A missing hop stays missing instead of being filled in.
 */

export type LineageHop = {
  layer: string;
  evidence: string | null;
  missing: boolean;
};

export function explainOfferLineage(input: {
  sourceId?: string | null;
  snapshotId?: string | null;
  priceSignal?: string | null;
  quality?: string | null;
  community?: string | null;
  demand?: string | null;
  rankVersion?: string | null;
  outboundClickId?: string | null;
  outcome?: string | null;
}): LineageHop[] {
  const hops: [string, string | null | undefined][] = [
    ['source', input.sourceId],
    ['raw_observation', input.snapshotId],
    ['price_evidence', input.priceSignal],
    ['quality', input.quality],
    ['community', input.community],
    ['demand', input.demand],
    ['ranking', input.rankVersion],
    ['outbound', input.outboundClickId],
    ['outcome', input.outcome],
  ];
  return hops.map(([layer, evidence]) => ({
    layer,
    evidence: evidence?.trim() ? evidence : null,
    missing: !evidence?.trim(),
  }));
}
