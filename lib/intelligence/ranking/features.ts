/**
 * Shadow rank. The live feed keeps ranking_blend.
 * Intelligence score is an explanation, not a sort key for the product.
 */

import { communitySignal } from '@/lib/intelligence/community/signal';
import { demandSignal } from '@/lib/intelligence/demand/signal';

export const RANKING_FEATURE_VERSION = 'rank-intel-v1';
export const INTELLIGENCE_RANK_MODE = 'shadow' as const;
export const RANK_SHADOW_MAX_OFFERS = 40;

export type FeatureMode = 'active' | 'observe_only' | 'disabled';

/** What the live feed uses, and what this layer is allowed to compute. */
export const RANKING_FEATURE_MODES = {
  ranking_blend: 'active',
  price_quality: 'observe_only',
  price_confidence: 'observe_only',
  freshness: 'observe_only',
  demand_signal: 'observe_only',
  community_consensus: 'observe_only',
  source_confidence: 'observe_only',
  coupon_available: 'observe_only',
  conversion_signal: 'disabled',
} as const satisfies Record<string, FeatureMode>;

export type RankFeatureInput = {
  offerId: string;
  currentScore: number;
  price?: {
    confidence: number;
    anomaly: 'insufficient' | 'none' | 'low' | 'high';
    trend: 'insufficient' | 'down' | 'flat' | 'up';
    discountDepth: number | null;
    samples: number;
  } | null;
  demand?: {
    views: number;
    outbound: number;
    votes: number;
    saves: number;
    comments: number;
  } | null;
  community: {
    upVotes: number;
    downVotes: number;
    reports?: number;
  };
  freshness?: {
    hoursSinceCheck: number | null;
    status: string | null;
  } | null;
  sourceReliability?: number | null;
  coupon?: {
    verified: boolean;
    confidence: number;
    showAsAvailable: boolean;
    discountValue: number | null;
  } | null;
};

export type RankExplanation = {
  feature: keyof typeof RANKING_FEATURE_MODES;
  mode: FeatureMode;
  value: number | null;
  reason: string;
};

export type IntelligenceRank = {
  version: typeof RANKING_FEATURE_VERSION;
  mode: typeof INTELLIGENCE_RANK_MODE;
  offerId: string;
  currentScore: number;
  intelligenceScore: number | null;
  appliedToFeed: false;
  explanations: RankExplanation[];
};

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function priceQuality(input: RankFeatureInput['price']): RankExplanation {
  if (!input || input.samples < 8 || input.confidence < 0.5) {
    return {
      feature: 'price_quality',
      mode: 'observe_only',
      value: null,
      reason: 'history_insufficient_for_a_price_signal',
    };
  }
  if (input.anomaly === 'high') {
    return {
      feature: 'price_quality',
      mode: 'observe_only',
      value: 0.15,
      reason: 'price_above_band_is_suspicious_not_a_deal',
    };
  }
  if (input.anomaly === 'low' && (input.discountDepth ?? 0) > 0) {
    return {
      feature: 'price_quality',
      mode: 'observe_only',
      value: round4(Math.min(1, 0.55 + (input.discountDepth ?? 0))),
      reason: 'low_band_with_depth_and_history',
    };
  }
  if (input.trend === 'down') {
    return { feature: 'price_quality', mode: 'observe_only', value: 0.5, reason: 'downtrend_with_history' };
  }
  return {
    feature: 'price_quality',
    mode: 'observe_only',
    value: 0.35,
    reason: 'stable_history_not_a_discount',
  };
}

function freshnessFeature(input: RankFeatureInput['freshness']): RankExplanation {
  if (!input || input.hoursSinceCheck == null || !Number.isFinite(input.hoursSinceCheck)) {
    return { feature: 'freshness', mode: 'observe_only', value: null, reason: 'no_check_timestamp' };
  }
  if (input.status === 'out_of_stock' || input.status === 'error') {
    return { feature: 'freshness', mode: 'observe_only', value: 0.05, reason: 'not_available' };
  }
  if (input.hoursSinceCheck <= 24) {
    return { feature: 'freshness', mode: 'observe_only', value: 0.95, reason: 'checked_within_24h' };
  }
  if (input.hoursSinceCheck <= 72) {
    return { feature: 'freshness', mode: 'observe_only', value: 0.6, reason: 'checked_within_72h' };
  }
  return { feature: 'freshness', mode: 'observe_only', value: 0.2, reason: 'stale_check' };
}

export function scoreIntelligenceRank(input: RankFeatureInput): IntelligenceRank {
  const community = communitySignal(input.community);
  const demand = demandSignal(input.demand ?? null);
  const source =
    input.sourceReliability == null || !Number.isFinite(input.sourceReliability)
      ? null
      : round4(Math.max(0, Math.min(1, input.sourceReliability)));

  const explanations: RankExplanation[] = [
    {
      feature: 'ranking_blend',
      mode: 'active',
      value: input.currentScore,
      reason: 'live feed sort key; reputation-weighted momentum plus time decay live in the view',
    },
    priceQuality(input.price),
    {
      feature: 'price_confidence',
      mode: 'observe_only',
      value: input.price && input.price.samples >= 2 ? round4(Math.max(0, Math.min(1, input.price.confidence))) : null,
      reason: input.price ? 'sample_size_source_diversity_and_age' : 'no_price_history',
    },
    freshnessFeature(input.freshness),
    {
      feature: 'demand_signal',
      mode: 'observe_only',
      value: demand.value,
      reason: demand.reason,
    },
    {
      feature: 'community_consensus',
      mode: 'observe_only',
      value: community.value,
      reason:
        community.value == null
          ? 'fewer_than_3_votes_is_too_easy_to_swing'
          : community.disagreement
            ? 'both_sides_present'
            : 'unweighted_up_share_reports_dampen',
    },
    {
      feature: 'source_confidence',
      mode: 'observe_only',
      value: source,
      reason: source == null ? 'no_source_reliability' : 'supply_run_reliability',
    },
    {
      feature: 'coupon_available',
      mode: 'observe_only',
      value:
        input.coupon?.verified && input.coupon.showAsAvailable
          ? round4(Math.max(0, Math.min(1, input.coupon.confidence)))
          : null,
      reason: input.coupon?.verified && input.coupon.showAsAvailable
        ? input.coupon.discountValue == null
          ? 'verified_coupon_savings_not_priced'
          : 'verified_coupon_in_freshness_window'
        : 'unverified_or_stale_coupon_does_not_score',
    },
    {
      feature: 'conversion_signal',
      mode: 'disabled',
      value: null,
      reason: 'conversion_ingest_not_connected',
    },
  ];

  const observed = explanations.filter((row) => row.mode === 'observe_only' && row.value != null);
  const intelligenceScore =
    observed.length > 0
      ? round4(observed.reduce((acc, row) => acc + (row.value ?? 0), 0) / observed.length)
      : null;

  return {
    version: RANKING_FEATURE_VERSION,
    mode: INTELLIGENCE_RANK_MODE,
    offerId: input.offerId,
    currentScore: input.currentScore,
    intelligenceScore,
    appliedToFeed: false,
    explanations,
  };
}

export function compareRankShadow(rows: IntelligenceRank[]): {
  version: typeof RANKING_FEATURE_VERSION;
  mode: typeof INTELLIGENCE_RANK_MODE;
  appliedToFeed: false;
  currentOrder: string[];
  intelligenceOrder: string[];
  divergence: string[];
} {
  const bounded = rows.slice(0, RANK_SHADOW_MAX_OFFERS);
  const currentOrder = [...bounded]
    .sort((a, b) => b.currentScore - a.currentScore || a.offerId.localeCompare(b.offerId))
    .map((row) => row.offerId);
  const intelligenceOrder = [...bounded]
    .sort((a, b) => {
      if (a.intelligenceScore == null && b.intelligenceScore == null) {
        return b.currentScore - a.currentScore || a.offerId.localeCompare(b.offerId);
      }
      if (a.intelligenceScore == null) return 1;
      if (b.intelligenceScore == null) return -1;
      if (b.intelligenceScore !== a.intelligenceScore) return b.intelligenceScore - a.intelligenceScore;
      return b.currentScore - a.currentScore || a.offerId.localeCompare(b.offerId);
    })
    .map((row) => row.offerId);
  return {
    version: RANKING_FEATURE_VERSION,
    mode: INTELLIGENCE_RANK_MODE,
    appliedToFeed: false,
    currentOrder,
    intelligenceOrder,
    divergence: currentOrder.filter((id, index) => intelligenceOrder[index] !== id),
  };
}
