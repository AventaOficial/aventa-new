import { createServerClient } from '@/lib/supabase/server';
import { OFFER_EVENT_TO_CANONICAL } from '@/lib/analytics/funnelTaxonomy';

export type FunnelSnapshot = {
  windowHours: number;
  since: string;
  offerViews: number | null;
  outboundClicks: number | null;
  signups: number | null;
  logins: number | null;
  votes: number | null;
  saves: number | null;
  comments: number | null;
  submissions: number | null;
  note: string;
};

async function countOfferEvents(eventType: string, sinceIso: string): Promise<number | null> {
  const supabase = createServerClient();
  const { count, error } = await supabase
    .from('offer_events')
    .select('id', { count: 'exact', head: true })
    .eq('event_type', eventType)
    .gte('created_at', sinceIso);
  if (error) return null;
  return count ?? 0;
}

async function countProductEvents(eventName: string, sinceIso: string): Promise<number | null> {
  const supabase = createServerClient();
  const { count, error } = await supabase
    .from('product_events')
    .select('id', { count: 'exact', head: true })
    .eq('event_name', eventName)
    .gte('occurred_at', sinceIso);
  if (error) return null;
  return count ?? 0;
}

async function countRows(table: string, column: string, sinceIso: string): Promise<number | null> {
  const supabase = createServerClient();
  const { count, error } = await supabase
    .from(table)
    .select(column, { count: 'exact', head: true })
    .gte(column, sinceIso);
  if (error) return null;
  return count ?? 0;
}

/** Bounded window counts. Not a full-table scan of all history. */
export async function getFunnelSnapshot(windowHours = 24): Promise<FunnelSnapshot> {
  const hours = Math.min(24 * 30, Math.max(1, Math.floor(windowHours)));
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const [offerViews, outboundClicks, signups, logins, votes, saves, comments, submissions] = await Promise.all([
    countOfferEvents('view', since),
    countOfferEvents('outbound', since),
    countRows('profiles', 'created_at', since),
    countProductEvents('login', since),
    countRows('offer_votes', 'created_at', since),
    countRows('offer_favorites', 'created_at', since),
    countRows('comments', 'created_at', since),
    countProductEvents('submission', since),
  ]);

  return {
    windowHours: hours,
    since,
    offerViews,
    outboundClicks,
    signups,
    logins,
    votes,
    saves,
    comments,
    submissions,
    note: `offer_view maps from offer_events.view (${OFFER_EVENT_TO_CANONICAL.view}). outbound maps from offer_events.outbound. signup maps from profiles.created_at. votes, saves and comments map from offer_votes, offer_favorites and comments. This window is not D1/D7/D30 retention and last_seen_at is not a historical cohort.`,
  };
}
