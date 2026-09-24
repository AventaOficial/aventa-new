/**
 * Roles of existing analytics tables. Historical rows stay where they are.
 * Ranking must read aggregates, not these raw tables, on the request path.
 */

export const ANALYTICS_ROLES = {
  offer_events: {
    role: 'raw_event',
    answers: 'volume of views, outbound, share, cazar_cta',
  },
  product_events: {
    role: 'raw_event',
    answers: 'canonical funnel names; do not add these counts to offer_events',
  },
  offer_votes: {
    role: 'raw_event',
    answers: 'one row per offer and user; live weight is ranking_momentum',
  },
  offer_favorites: {
    role: 'raw_event',
    answers: 'saves',
  },
  comments: {
    role: 'raw_event',
    answers: 'approved comments count as community activity',
  },
  reward_outbound_clicks: {
    role: 'attribution',
    answers: 'click identity; not the volume source of truth',
  },
  demand_offer_signals: {
    role: 'aggregate',
    answers: 'bounded demand counts for shadow rank',
  },
  price_intelligence_rollups: {
    role: 'derived_signal',
    answers: 'price knowledge for one subject and window',
  },
  hunter_supply_runs: {
    role: 'operational_telemetry',
    answers: 'what each source produced on a run',
  },
} as const;

export const VOLUME_OUTBOUND_SOURCE = 'offer_events' as const;
export const ATTRIBUTION_OUTBOUND_SOURCE = 'reward_outbound_clicks' as const;
