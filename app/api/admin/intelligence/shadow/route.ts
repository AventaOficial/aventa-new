import { NextResponse } from 'next/server';
import { requireMetrics } from '@/lib/server/requireAdmin';
import { createServerClient } from '@/lib/supabase/server';
import { buildShadowDecision } from '@/lib/intelligence/decisions/shadow';
import { explainOfferLineage } from '@/lib/intelligence/lineage/explain';
import {
  compareRankShadow,
  RANK_SHADOW_MAX_OFFERS,
  RANKING_FEATURE_VERSION,
  scoreIntelligenceRank,
  type RankFeatureInput,
} from '@/lib/intelligence/ranking/features';
import { getHomeFeed } from '@/lib/offers/feedService';

function comparisonOf(inputs: RankFeatureInput[]) {
  const ranks = inputs.slice(0, RANK_SHADOW_MAX_OFFERS).map(scoreIntelligenceRank);
  return {
    ...compareRankShadow(ranks),
    offers: ranks.map((rank) => ({
      offerId: rank.offerId,
      currentScore: rank.currentScore,
      intelligenceScore: rank.intelligenceScore,
      explanations: rank.explanations,
      lineage: explainOfferLineage({
        rankVersion: rank.version,
        priceSignal: rank.explanations.find((row) => row.feature === 'price_quality')?.reason ?? null,
        community: rank.explanations.find((row) => row.feature === 'community_consensus')?.reason ?? null,
        demand: rank.explanations.find((row) => row.feature === 'demand_signal')?.reason ?? null,
        outcome: null,
      }),
    })),
  };
}

export async function GET(request: Request) {
  const auth = await requireMetrics(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(request.url);
  const limit = Math.min(RANK_SHADOW_MAX_OFFERS, Math.max(1, Number(url.searchParams.get('limit') ?? '12') || 12));
  const feed = await getHomeFeed({ limit, view: 'top', period: 'week' });
  if (!feed.success) return NextResponse.json({ error: feed.error }, { status: 503 });

  const inputs: RankFeatureInput[] = feed.data.map((offer) => ({
    offerId: offer.id,
    currentScore: offer.ranking_blend ?? offer.score ?? 0,
    community: { upVotes: offer.up_votes ?? 0, downVotes: offer.down_votes ?? 0 },
  }));

  return NextResponse.json({
    ...comparisonOf(inputs),
    note: 'community headcount only; price, demand and source stay null until a caller supplies them',
    persisted: false,
  });
}

export async function POST(request: Request) {
  const auth = await requireMetrics(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await request.json().catch(() => null)) as {
    offers?: RankFeatureInput[];
    persist?: boolean;
  } | null;
  const offers = body?.offers ?? [];
  if (offers.length === 0 || offers.length > RANK_SHADOW_MAX_OFFERS) {
    return NextResponse.json({ error: `offers must contain 1 to ${RANK_SHADOW_MAX_OFFERS} rows` }, { status: 400 });
  }
  if (offers.some((offer) => !offer?.offerId || !Number.isFinite(offer.currentScore) || !offer.community)) {
    return NextResponse.json({ error: 'each offer needs offerId, currentScore and community' }, { status: 400 });
  }

  const comparison = comparisonOf(offers);
  if (!body?.persist) return NextResponse.json({ ...comparison, persisted: false });

  const decision = buildShadowDecision({
    system: 'ranking_intelligence',
    version: RANKING_FEATURE_VERSION,
    decision: comparison.divergence.length > 0 ? 'order_would_change' : 'order_unchanged',
    evidence: comparison.divergence.slice(0, 20),
    subjectKey: [...comparison.currentOrder].sort().join(',').slice(0, 120) || 'empty',
  });
  const supabase = createServerClient();
  const { error } = await supabase.from('intelligence_shadow_decisions').upsert(
    {
      idempotency_key: decision.idempotencyKey,
      system: decision.system,
      stage: decision.stage,
      version: decision.version,
      decision: decision.decision,
      evidence: decision.evidence,
      decided_at: decision.decidedAt,
      mutates_production: false,
    },
    { onConflict: 'idempotency_key' },
  );
  if (error) {
    return NextResponse.json(
      { ...comparison, persisted: false, error: 'migration_pending', detail: error.message },
      { status: 503 },
    );
  }
  return NextResponse.json({ ...comparison, persisted: true, idempotencyKey: decision.idempotencyKey });
}
