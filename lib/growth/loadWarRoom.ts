import { loadAffiliateCoverage } from '@/lib/affiliate/conversionBridge/loadCoverage';
import { buildAttributionTruth } from '@/lib/attribution/buildAttributionTruth';
import { getFunnelSnapshot } from '@/lib/analytics/funnelSnapshot';
import { createServerClient } from '@/lib/supabase/server';
import { SALES_WINDOW_START_MS } from './campaignContext';
import { buildGrowthWarRoomView, type GrowthWarRoomView } from './warRoom';

async function pageViewsSince(sinceIso: string): Promise<number | null> {
  try {
    const supabase = createServerClient();
    const { count, error } = await supabase
      .from('product_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_name', 'page_view')
      .gte('occurred_at', sinceIso);
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

export async function loadGrowthWarRoom(now = new Date()): Promise<GrowthWarRoomView> {
  const [day, week, month, truth, visitorsDay, visitorsWeek, visitorsMonth] = await Promise.all([
    getFunnelSnapshot(24),
    getFunnelSnapshot(24 * 7),
    getFunnelSnapshot(24 * 30),
    buildAttributionTruth(undefined, { now }),
    pageViewsSince(new Date(now.getTime() - 24 * 3600_000).toISOString()),
    pageViewsSince(new Date(now.getTime() - 7 * 24 * 3600_000).toISOString()),
    pageViewsSince(new Date(now.getTime() - 30 * 24 * 3600_000).toISOString()),
  ]);

  const sinceStart = now.getTime() >= SALES_WINDOW_START_MS;
  const sinceVisitors = sinceStart
    ? await pageViewsSince(new Date(SALES_WINDOW_START_MS).toISOString())
    : null;
  const provider = await loadAffiliateCoverage(now);

  return buildGrowthWarRoomView({
    nowMs: now.getTime(),
    conversionConnected: truth.conversion.connected,
    today: { visitors: visitorsDay, offerViews: day.offerViews, outboundClicks: day.outboundClicks },
    d7: { visitors: visitorsWeek, offerViews: week.offerViews, outboundClicks: week.outboundClicks },
    d30: { visitors: visitorsMonth, offerViews: month.offerViews, outboundClicks: month.outboundClicks },
    sinceLaunch: {
      visitors: sinceVisitors,
      offerViews: null,
      outboundClicks: null,
    },
    completenessPct: truth.completenessPct,
    outboundVolume: truth.outboundVolume,
    attributedClicks: truth.attributedClicks,
    byChannel: truth.byChannel,
    byCampaign: truth.byCampaign,
    byNetwork: truth.byNetwork,
    topOffers: truth.topOffers,
    provider,
  });
}
