/**
 * Demand as rates. Raw click totals are not popularity.
 */

export type DemandSignal = {
  value: number | null;
  outboundIntent: number | null;
  engagementQuality: number | null;
  reason: string;
};

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function demandSignal(input: {
  views: number;
  outbound: number;
  votes: number;
  saves: number;
  comments: number;
} | null): DemandSignal {
  if (!input || input.views < 5) {
    return {
      value: null,
      outboundIntent: null,
      engagementQuality: null,
      reason: 'insufficient_views_for_a_rate',
    };
  }
  const outboundIntent = round4(Math.max(0, input.outbound) / input.views);
  const engagementQuality = round4(
    Math.max(0, input.votes + input.saves + input.comments) / input.views,
  );
  return {
    value: round4(Math.min(1, outboundIntent * 0.7 + Math.min(1, engagementQuality) * 0.3)),
    outboundIntent,
    engagementQuality,
    reason: 'rate_not_raw_clicks',
  };
}
