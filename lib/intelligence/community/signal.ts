/**
 * Unweighted community headcount for shadow explanation.
 * Live rank keeps ranking_momentum, which already applies reputation weights.
 * This signal cannot mint an offer.
 */

export type CommunitySignal = {
  consensus: number | null;
  disagreement: boolean;
  confidence: number;
  reportDensity: number | null;
  value: number | null;
  weighting: 'unweighted_headcount';
  liveRankUses: 'ranking_momentum';
  canMint: false;
};

const MIN_VOTES_FOR_SIGNAL = 3;

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function communitySignal(input: {
  upVotes: number;
  downVotes: number;
  reports?: number;
}): CommunitySignal {
  const up = Math.max(0, Math.floor(input.upVotes || 0));
  const down = Math.max(0, Math.floor(input.downVotes || 0));
  const reports = Math.max(0, Math.floor(input.reports ?? 0));
  const total = up + down;
  const consensus = total > 0 ? round4(up / total) : null;
  const disagreement =
    up >= 2 && down >= 2 && consensus != null && consensus >= 0.35 && consensus <= 0.65;
  const reportDensity = total + reports > 0 ? round4(reports / (total + reports)) : null;

  let confidence = 0;
  if (total >= MIN_VOTES_FOR_SIGNAL) confidence = Math.min(0.9, 0.3 + total / 50);
  if (disagreement) confidence *= 0.6;
  if (reports >= 2) confidence *= 0.5;

  const value =
    consensus != null && total >= MIN_VOTES_FOR_SIGNAL
      ? round4(consensus * (reports >= 2 ? 0.5 : 1))
      : null;

  return {
    consensus,
    disagreement,
    confidence: round4(confidence),
    reportDensity,
    value,
    weighting: 'unweighted_headcount',
    liveRankUses: 'ranking_momentum',
    canMint: false,
  };
}
