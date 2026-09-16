/**
 * Attribution Truth — snapshot CEO (read-only).
 * Nunca inventa revenue. conversion/commission = null hasta ingest real.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { OUTBOUND_ATTRIBUTION_SOT, OUTBOUND_VOLUME_SOT } from '@/lib/analytics/outboundClickContract';

export type AttributionTruthSnapshot = {
  generatedAt: string;
  windowHours: number;
  volumeSot: typeof OUTBOUND_VOLUME_SOT;
  attributionSot: typeof OUTBOUND_ATTRIBUTION_SOT;
  outboundVolume: number | null;
  attributedClicks: number | null;
  uniqueClickIds: number | null;
  withChannel: number | null;
  withCampaign: number | null;
  missingDestination: number | null;
  completenessPct: number | null;
  byChannel: Array<{ channel: string; clicks: number }>;
  byNetwork: Array<{ network: string; clicks: number }>;
  byCampaign: Array<{ campaignKey: string; clicks: number }>;
  /** Siempre null — no hay conversion auto. */
  conversions: null;
  /** Siempre null — no inventar dinero. */
  confirmedRevenueCents: null;
  note: string;
  status: 'healthy' | 'degraded' | 'blocked' | 'unknown';
};

function topCounts(
  rows: Array<string | null | undefined>,
  limit = 8,
): Array<{ key: string; n: number }> {
  const map = new Map<string, number>();
  for (const raw of rows) {
    const k = (raw ?? '').trim() || 'unknown';
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([key, n]) => ({ key, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, limit);
}

export async function buildAttributionTruth(
  supabase?: SupabaseClient | null,
  opts?: { windowHours?: number },
): Promise<AttributionTruthSnapshot> {
  const windowHours = Math.max(1, Math.min(168, opts?.windowHours ?? 24));
  const generatedAt = new Date().toISOString();
  const sinceIso = new Date(Date.now() - windowHours * 3600_000).toISOString();

  const empty = (note: string, status: AttributionTruthSnapshot['status']): AttributionTruthSnapshot => ({
    generatedAt,
    windowHours,
    volumeSot: OUTBOUND_VOLUME_SOT,
    attributionSot: OUTBOUND_ATTRIBUTION_SOT,
    outboundVolume: null,
    attributedClicks: null,
    uniqueClickIds: null,
    withChannel: null,
    withCampaign: null,
    missingDestination: null,
    completenessPct: null,
    byChannel: [],
    byNetwork: [],
    byCampaign: [],
    conversions: null,
    confirmedRevenueCents: null,
    note,
    status,
  });

  let client = supabase ?? null;
  if (!client) {
    try {
      client = createServerClient();
    } catch {
      return empty('Supabase no disponible', 'unknown');
    }
  }

  const [{ count: volumeCount }, { data: clicks, error: clickError }] = await Promise.all([
    client
      .from('offer_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'outbound')
      .gte('created_at', sinceIso),
    client
      .from('reward_outbound_clicks')
      .select('id, network, channel, campaign_key, destination_url')
      .gte('created_at', sinceIso)
      .limit(5000),
  ]);

  if (clickError) {
    const msg = clickError.message.toLowerCase();
    if (msg.includes('does not exist')) {
      return empty('reward_outbound_clicks no disponible', 'blocked');
    }
    return empty(`click query failed: ${clickError.message}`, 'degraded');
  }

  const rows = clicks ?? [];
  const attributedClicks = rows.length;
  const uniqueClickIds = new Set(rows.map((r) => (r as { id: string }).id)).size;
  const withChannel = rows.filter((r) => {
    const c = (r as { channel?: string | null }).channel;
    return Boolean(c && c !== 'unknown');
  }).length;
  const withCampaign = rows.filter((r) =>
    Boolean((r as { campaign_key?: string | null }).campaign_key?.trim()),
  ).length;
  const missingDestination = rows.filter(
    (r) => !(r as { destination_url?: string | null }).destination_url?.trim(),
  ).length;

  const completenessPct =
    attributedClicks > 0
      ? Math.round(((withChannel + (attributedClicks - missingDestination)) / (attributedClicks * 2)) * 1000) /
        10
      : null;

  let status: AttributionTruthSnapshot['status'] = 'healthy';
  if (attributedClicks === 0 && (volumeCount ?? 0) > 0) status = 'degraded';
  if (completenessPct != null && completenessPct < 40 && attributedClicks >= 5) status = 'degraded';

  return {
    generatedAt,
    windowHours,
    volumeSot: OUTBOUND_VOLUME_SOT,
    attributionSot: OUTBOUND_ATTRIBUTION_SOT,
    outboundVolume: volumeCount ?? null,
    attributedClicks,
    uniqueClickIds,
    withChannel,
    withCampaign,
    missingDestination,
    completenessPct,
    byChannel: topCounts(rows.map((r) => (r as { channel?: string | null }).channel)).map((x) => ({
      channel: x.key,
      clicks: x.n,
    })),
    byNetwork: topCounts(rows.map((r) => (r as { network?: string | null }).network)).map((x) => ({
      network: x.key,
      clicks: x.n,
    })),
    byCampaign: topCounts(rows.map((r) => (r as { campaign_key?: string | null }).campaign_key))
      .filter((x) => x.key !== 'unknown')
      .map((x) => ({ campaignKey: x.key, clicks: x.n })),
    conversions: null,
    confirmedRevenueCents: null,
    note:
      attributedClicks === 0
        ? 'Sin clicks atribuidos en ventana (conversions/revenue = N/A)'
        : 'Conversions y revenue confirmed = N/A hasta ingest de red',
    status,
  };
}
