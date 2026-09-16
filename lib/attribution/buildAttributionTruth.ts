/**
 * Attribution Truth — snapshot CEO (read-only).
 *
 * SoT:
 * - Persisted attributed clicks → `reward_outbound_clicks` (OUTBOUND_ATTRIBUTION_SOT)
 * - Behavioral outbound volume → `offer_events` event_type=outbound (OUTBOUND_VOLUME_SOT)
 *
 * Nunca inventa revenue/conversiones/comisiones.
 * Nunca trata offer_events como click_id.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { OUTBOUND_ATTRIBUTION_SOT, OUTBOUND_VOLUME_SOT } from '@/lib/analytics/outboundClickContract';
import { isAttributionChannel } from '@/lib/attribution/channels';

export type AttributionClickRow = {
  id?: string | null;
  offer_id?: string | null;
  network?: string | null;
  channel?: string | null;
  campaign_key?: string | null;
  destination_url?: string | null;
  original_destination_url?: string | null;
  created_at?: string | null;
};

export type AttributionBreakdownRow = { key: string; clicks: number };

export type AttributionWindowTruth = {
  label: 'today' | 'h24' | 'd7';
  sinceIso: string;
  /** offer_events outbound count (volume SoT). */
  outboundVolume: number | null;
  /** Filas reward_outbound_clicks en ventana (attribution SoT). */
  persistedClicks: number;
  uniqueClickIds: number;
  /** Ver isPersistedClickAttributionComplete. */
  attributionComplete: number;
  /** persistedClicks - attributionComplete. */
  attributionGap: number;
  completenessPct: number | null;
  withChannel: number;
  withCampaign: number;
  withDestination: number;
  withOriginalDestination: number;
  missingDestination: number;
  byChannel: Array<{ channel: string; clicks: number }>;
  byNetwork: Array<{ network: string; clicks: number }>;
  byCampaign: Array<{ campaignKey: string; clicks: number }>;
  topOffers: Array<{ offerId: string; clicks: number }>;
};

export type AttributionNotConnected = {
  connected: false;
  count: null;
  label: 'not connected';
};

/**
 * Snapshot CEO.
 * Campos top-level = ventana primaria h24 (compat con circuitBottleneck / health).
 */
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
  attributionComplete: number | null;
  attributionGap: number | null;
  byChannel: Array<{ channel: string; clicks: number }>;
  byNetwork: Array<{ network: string; clicks: number }>;
  byCampaign: Array<{ campaignKey: string; clicks: number }>;
  topOffers: Array<{ offerId: string; clicks: number }>;
  windows: {
    today: AttributionWindowTruth;
    h24: AttributionWindowTruth;
    d7: AttributionWindowTruth;
  };
  /** Siempre not connected hasta ingest real. */
  conversion: AttributionNotConnected;
  commission: AttributionNotConnected;
  /** Siempre null — no inventar dinero. */
  conversions: null;
  confirmedRevenueCents: null;
  note: string;
  status: 'healthy' | 'degraded' | 'blocked' | 'unknown';
};

const NOT_CONNECTED: AttributionNotConnected = {
  connected: false,
  count: null,
  label: 'not connected',
};

const CLICK_SELECT =
  'id, offer_id, network, channel, campaign_key, destination_url, original_destination_url, created_at';

/** Cap de filas para agregación in-memory. Documentado: rollup futuro si > este umbral sostenido. */
export const ATTRIBUTION_TRUTH_ROW_CAP = 5000;

/**
 * Completeness determinística (v1):
 * - offer_id presente
 * - channel allowlisted y ≠ unknown
 * - destination_url no vacía
 *
 * campaign_key es opcional (muchos clicks orgánicos no tienen campaña).
 * Se reporta aparte como withCampaign.
 */
export function isPersistedClickAttributionComplete(row: AttributionClickRow): boolean {
  const offerId = (row.offer_id ?? '').trim();
  if (!offerId) return false;
  const channel = (row.channel ?? '').trim().toLowerCase();
  if (!isAttributionChannel(channel) || channel === 'unknown') return false;
  const dest = (row.destination_url ?? '').trim();
  if (!dest) return false;
  return true;
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

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

/** Agrega filas ya filtradas a una ventana. Pure — testeable sin DB. */
export function aggregateAttributionWindow(input: {
  label: AttributionWindowTruth['label'];
  sinceIso: string;
  rows: AttributionClickRow[];
  outboundVolume: number | null;
}): AttributionWindowTruth {
  const rows = input.rows;
  const persistedClicks = rows.length;
  const uniqueClickIds = new Set(
    rows.map((r) => (r.id ?? '').trim()).filter(Boolean),
  ).size;
  const attributionComplete = rows.filter(isPersistedClickAttributionComplete).length;
  const attributionGap = Math.max(0, persistedClicks - attributionComplete);
  const withChannel = rows.filter((r) => {
    const c = (r.channel ?? '').trim().toLowerCase();
    return isAttributionChannel(c) && c !== 'unknown';
  }).length;
  const withCampaign = rows.filter((r) => Boolean((r.campaign_key ?? '').trim())).length;
  const withDestination = rows.filter((r) => Boolean((r.destination_url ?? '').trim())).length;
  const withOriginalDestination = rows.filter((r) =>
    Boolean((r.original_destination_url ?? '').trim()),
  ).length;
  const missingDestination = persistedClicks - withDestination;
  const completenessPct =
    persistedClicks > 0
      ? Math.round((attributionComplete / persistedClicks) * 1000) / 10
      : null;

  return {
    label: input.label,
    sinceIso: input.sinceIso,
    outboundVolume: input.outboundVolume,
    persistedClicks,
    uniqueClickIds,
    attributionComplete,
    attributionGap,
    completenessPct,
    withChannel,
    withCampaign,
    withDestination,
    withOriginalDestination,
    missingDestination,
    byChannel: topCounts(rows.map((r) => r.channel)).map((x) => ({
      channel: x.key,
      clicks: x.n,
    })),
    byNetwork: topCounts(rows.map((r) => r.network)).map((x) => ({
      network: x.key,
      clicks: x.n,
    })),
    byCampaign: topCounts(rows.map((r) => r.campaign_key))
      .filter((x) => x.key !== 'unknown')
      .map((x) => ({ campaignKey: x.key, clicks: x.n })),
    topOffers: topCounts(rows.map((r) => r.offer_id))
      .filter((x) => x.key !== 'unknown')
      .map((x) => ({ offerId: x.key, clicks: x.n })),
  };
}

function emptyWindow(
  label: AttributionWindowTruth['label'],
  sinceIso: string,
): AttributionWindowTruth {
  return aggregateAttributionWindow({
    label,
    sinceIso,
    rows: [],
    outboundVolume: null,
  });
}

export async function buildAttributionTruth(
  supabase?: SupabaseClient | null,
  opts?: { windowHours?: number; now?: Date },
): Promise<AttributionTruthSnapshot> {
  const now = opts?.now ?? new Date();
  const windowHours = Math.max(1, Math.min(168, opts?.windowHours ?? 24));
  const generatedAt = now.toISOString();
  const todayStart = startOfUtcDay(now);
  const h24Since = new Date(now.getTime() - 24 * 3600_000);
  const d7Since = new Date(now.getTime() - 7 * 24 * 3600_000);
  const primarySince = new Date(now.getTime() - windowHours * 3600_000);

  const emptyWindows = {
    today: emptyWindow('today', todayStart.toISOString()),
    h24: emptyWindow('h24', h24Since.toISOString()),
    d7: emptyWindow('d7', d7Since.toISOString()),
  };

  const empty = (
    note: string,
    status: AttributionTruthSnapshot['status'],
  ): AttributionTruthSnapshot => ({
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
    attributionComplete: null,
    attributionGap: null,
    byChannel: [],
    byNetwork: [],
    byCampaign: [],
    topOffers: [],
    windows: emptyWindows,
    conversion: NOT_CONNECTED,
    commission: NOT_CONNECTED,
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

  const [
    { count: volToday },
    { count: volH24 },
    { count: volD7 },
    { data: clicks, error: clickError },
  ] = await Promise.all([
    client
      .from('offer_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'outbound')
      .gte('created_at', todayStart.toISOString()),
    client
      .from('offer_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'outbound')
      .gte('created_at', h24Since.toISOString()),
    client
      .from('offer_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'outbound')
      .gte('created_at', d7Since.toISOString()),
    client
      .from('reward_outbound_clicks')
      .select(CLICK_SELECT)
      .gte('created_at', d7Since.toISOString())
      .order('created_at', { ascending: false })
      .limit(ATTRIBUTION_TRUTH_ROW_CAP),
  ]);

  if (clickError) {
    const msg = clickError.message.toLowerCase();
    if (msg.includes('does not exist') || msg.includes('column')) {
      return empty(`reward_outbound_clicks incompleto: ${clickError.message}`, 'blocked');
    }
    return empty(`click query failed: ${clickError.message}`, 'degraded');
  }

  const allRows = (clicks ?? []) as AttributionClickRow[];
  const inWindow = (since: Date) =>
    allRows.filter((r) => {
      const ts = Date.parse(String(r.created_at ?? ''));
      return Number.isFinite(ts) && ts >= since.getTime();
    });

  const windows = {
    today: aggregateAttributionWindow({
      label: 'today',
      sinceIso: todayStart.toISOString(),
      rows: inWindow(todayStart),
      outboundVolume: volToday ?? null,
    }),
    h24: aggregateAttributionWindow({
      label: 'h24',
      sinceIso: h24Since.toISOString(),
      rows: inWindow(h24Since),
      outboundVolume: volH24 ?? null,
    }),
    d7: aggregateAttributionWindow({
      label: 'd7',
      sinceIso: d7Since.toISOString(),
      rows: inWindow(d7Since),
      outboundVolume: volD7 ?? null,
    }),
  };

  // Primary = h24 salvo windowHours custom distinto (sigue h24 para CEO bottleneck).
  const primary =
    windowHours === 24
      ? windows.h24
      : aggregateAttributionWindow({
          label: 'h24',
          sinceIso: primarySince.toISOString(),
          rows: inWindow(primarySince),
          outboundVolume: volH24 ?? null,
        });

  let status: AttributionTruthSnapshot['status'] = 'healthy';
  if (primary.persistedClicks === 0 && (primary.outboundVolume ?? 0) > 0) {
    status = 'degraded';
  }
  if (
    primary.completenessPct != null &&
    primary.completenessPct < 40 &&
    primary.persistedClicks >= 5
  ) {
    status = 'degraded';
  }
  if (allRows.length >= ATTRIBUTION_TRUTH_ROW_CAP) {
    status = status === 'healthy' ? 'degraded' : status;
  }

  const cappedNote =
    allRows.length >= ATTRIBUTION_TRUTH_ROW_CAP
      ? ` · sample capped at ${ATTRIBUTION_TRUTH_ROW_CAP} rows (rollup futuro si se sostiene)`
      : '';

  return {
    generatedAt,
    windowHours,
    volumeSot: OUTBOUND_VOLUME_SOT,
    attributionSot: OUTBOUND_ATTRIBUTION_SOT,
    outboundVolume: primary.outboundVolume,
    attributedClicks: primary.persistedClicks,
    uniqueClickIds: primary.uniqueClickIds,
    withChannel: primary.withChannel,
    withCampaign: primary.withCampaign,
    missingDestination: primary.missingDestination,
    completenessPct: primary.completenessPct,
    attributionComplete: primary.attributionComplete,
    attributionGap: primary.attributionGap,
    byChannel: primary.byChannel,
    byNetwork: primary.byNetwork,
    byCampaign: primary.byCampaign,
    topOffers: primary.topOffers,
    windows,
    conversion: NOT_CONNECTED,
    commission: NOT_CONNECTED,
    conversions: null,
    confirmedRevenueCents: null,
    note:
      primary.persistedClicks === 0
        ? `Sin clicks atribuidos en ventana primaria${cappedNote}`
        : `Attribution SoT=${OUTBOUND_ATTRIBUTION_SOT}; volume SoT=${OUTBOUND_VOLUME_SOT}; conversion/commission/revenue = not connected${cappedNote}`,
    status,
  };
}
