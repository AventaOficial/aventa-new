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

/** Bounded window counts. Not a full-table scan of all history. */
export async function getFunnelSnapshot(windowHours = 24): Promise<FunnelSnapshot> {
  const hours = Math.min(24 * 30, Math.max(1, Math.floor(windowHours)));
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const [offerViews, outboundClicks, signups, logins, votes, saves, comments, submissions] = await Promise.all([
    countOfferEvents('view', since),
    countOfferEvents('outbound', since),
    countProductEvents('signup', since),
    countProductEvents('login', since),
    countProductEvents('vote', since),
    countProductEvents('save', since),
    countProductEvents('comment', since),
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
    note: `offer_view maps from offer_events.view (${OFFER_EVENT_TO_CANONICAL.view}). Counts are exact head counts on the window, not estimated.`,
  };
}
