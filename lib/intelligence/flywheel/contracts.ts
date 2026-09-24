/**
 * Flywheel contracts. Each link says what crosses, who owns it, and where it breaks.
 * Ranking and discovery must not import demand features until this list marks that link connected.
 */

export type FlywheelStatus = 'connected' | 'partial' | 'broken';

export type FlywheelLink = {
  from: string;
  to: string;
  crosses: string;
  owner: string;
  schema: string;
  latency: string;
  quality: string;
  corruption: string;
  validation: string;
  observation: string;
  status: FlywheelStatus;
  brokenBecause: string | null;
};

export const FLYWHEEL_LINKS: FlywheelLink[] = [
  {
    from: 'users',
    to: 'demand',
    crosses: 'views, outbound, votes, saves, comments as counts. No user id, email, or IP.',
    owner: 'lib/intelligence/demand',
    schema: 'offer_events + product_events aggregated to demand features',
    latency: 'admin read, window ≤ 7 days, ≤ 100 offers',
    quality: 'partial — bounded sample, not a census at 1M events',
    corruption: 'bots, vote rings, rate-limit memory fallback',
    validation: 'window cap, offer cap, PII keys stripped',
    observation: 'GET /api/admin/intelligence/demand',
    status: 'partial',
    brokenBecause: 'features are not consumed by ranking or discovery',
  },
  {
    from: 'demand',
    to: 'supply_discovery',
    crosses: 'nothing automatic',
    owner: 'none — gap',
    schema: 'no table joins demand features to hunter sources',
    latency: 'none',
    quality: 'absent',
    corruption: 'n/a',
    validation: 'ranking and feed must not import lib/intelligence',
    observation: 'flywheel contract test',
    status: 'broken',
    brokenBecause: 'discovery does not read what users click',
  },
  {
    from: 'supply',
    to: 'price_memory',
    crosses: 'product_price_snapshots (ML, one row per product per day) and offer_price_snapshots',
    owner: 'existing price engines; lib/intelligence/price only reads',
    schema: 'product_price_snapshots, offer_price_snapshots',
    latency: 'point read ≤ 200 rows per subject',
    quality: 'ML history is real; offer snapshots are sparse',
    corruption: 'mixed currency, fabricated list price',
    validation: 'currency refusal, list price only when present',
    observation: 'deal intelligence telemetry + price summary counter',
    status: 'partial',
    brokenBecause: 'offer-level history is thin, so confidence stays low',
  },
  {
    from: 'price_memory',
    to: 'deal_quality',
    crosses: 'historyReady and price provenance into opportunity score',
    owner: 'lib/supply/intelligence — pre-existing, not this layer',
    schema: 'in-memory OpportunityEvidence',
    latency: 'per candidate',
    quality: 'evidence-gated',
    corruption: 'artificial list price',
    validation: 'trusted provenance required for discount math',
    observation: 'existing opportunity tests',
    status: 'connected',
    brokenBecause: null,
  },
  {
    from: 'deal_quality',
    to: 'ranking',
    crosses: 'human approval then votes. Machine quality does not auto-publish.',
    owner: 'moderation + ofertas_ranked_general',
    schema: 'offers.status, ranking_momentum',
    latency: 'human',
    quality: 'high when moderated, low when the queue is only UGC',
    corruption: 'approving stale or price-changed offers',
    validation: 'freshness presentation, moderation SLA',
    observation: 'moderation ops stats, freshness queue',
    status: 'partial',
    brokenBecause: 'shadow rank can explain a different order; the feed still sorts by ranking_blend',
  },
  {
    from: 'ranking',
    to: 'users',
    crosses: 'feed order, offer page, outbound click',
    owner: 'feed + track-outbound',
    schema: 'ofertas_ranked_general, offer_events, reward_outbound_clicks',
    latency: 'request',
    quality: 'usable',
    corruption: 'dead deals shown as fresh',
    validation: 'freshness CTA and noindex',
    observation: 'funnel snapshot',
    status: 'partial',
    brokenBecause: 'engagement does not change the next discovery cycle',
  },
  {
    from: 'outbound',
    to: 'transaction',
    crosses: 'click id and idempotency key. Conversion and commission stay not_connected.',
    owner: 'lib/intelligence/transaction + lib/attribution',
    schema: 'CanonicalEconomicEvent; no settlement write',
    latency: 'request for the click; conversion is unwired',
    quality: 'click identity is real; economic outcome is not',
    corruption: 'treating volume clicks as confirmed revenue',
    validation: 'layer promotion refused; settlement state rejected',
    observation: 'transaction cross-layer refusal counter',
    status: 'partial',
    brokenBecause: 'no network conversion ingest',
  },
];

export function flywheelBreaks(): FlywheelLink[] {
  return FLYWHEEL_LINKS.filter((link) => link.status !== 'connected');
}
