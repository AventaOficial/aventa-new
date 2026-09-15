import { createServerClient } from '@/lib/supabase/server';
import { getAffiliateProgramsRuntimeStatus } from '@/lib/affiliate/programCatalog';
import { getWriteQueueBacklog } from '@/lib/server/writeQueue';
import { buildEstimatedEconomy, filterProductionLedgerRows, sumLedgerCentsInRange, type EstimatedEconomy } from '@/lib/owner/estimatedEconomy';
import { isProductionFinancialRecord, isSyntheticFinancialRecord } from '@/lib/finance/financialRecordClass';
import {
  daysAgoUtc,
  monthYmdRange,
  OWNER_DASHBOARD_TZ,
  windowLastDays,
  windowToday,
  windowYesterday,
} from '@/lib/owner/mxTime';
import { fetchOfferHealthSummary, type OfferHealthSummary } from '@/lib/offers/offerHealthSummary';
import { buildSupplyFunnelSnapshot } from '@/lib/moderation/outcomes';
import {
  pickCircuitBottleneck,
  type CircuitBottleneck,
} from '@/lib/owner/circuitBottleneck';
import { OUTBOUND_VOLUME_SOT } from '@/lib/analytics/outboundClickContract';
import { buildModerationOpsStats } from '@/lib/moderation/moderationOpsStats';
import { buildSupplyToday } from '@/lib/hunter/supply/supplyToday';

export type TrafficLight = 'green' | 'yellow' | 'red';

export type PeriodKpis = {
  activeUsers: number | null;
  newUsers: number | null;
  offersApproved: number | null;
  offersPending: number | null;
  offersRejected: number | null;
  offersCreated: number | null;
  views: number | null;
  outbound: number | null;
  ctr: number | null;
  /** null = no calculable */
  available: boolean;
};

export type TopOfferRow = {
  id: string;
  title: string;
  outbound: number;
  views: number;
  ctr: number | null;
  store: string | null;
  category: string | null;
};

export type TopCategoryRow = {
  category: string;
  outbound: number;
  views: number;
  ctr: number | null;
};

export type OwnerAlert = {
  id: string;
  severity: TrafficLight;
  title: string;
  detail: string;
};

export type OwnerDashboardPayload = {
  generatedAt: string;
  timezone: string;
  summary: {
    status: TrafficLight;
    headline: string;
    subline: string;
  };
  growth: {
    weeklyPct: number | null;
    retention48hPct: number | null;
  };
  today: PeriodKpis;
  yesterday: PeriodKpis;
  week: PeriodKpis & {
    topOffers: TopOfferRow[];
    topCategories: TopCategoryRow[];
  };
  month: {
    outbound: number | null;
    views: number | null;
    ctr: number | null;
    ledgerGrossCents: number | null;
    ledgerAvailable: boolean;
    ledgerNote: string | null;
    estimatedRevenueCents: number | null;
    estimatedNote: string | null;
    topOffer: TopOfferRow | null;
  };
  moderation: {
    pending: number;
    /** Pending con created_at > 24h (SLA operativo). */
    pendingGt24h: number;
    /** Edad en horas de la pending más vieja, o null. */
    oldestPendingHours: number | null;
    rejectedToday: number | null;
    approvedToday: number | null;
    avgApprovalHours: number | null;
    slaHoursTarget: number;
    slaOk: boolean | null;
    slaNote: string | null;
    /** Pending→Live conversion (7d outcomes), 0–100 or null. */
    pendingToLivePct: number | null;
    /** Median pending→decision minutes (7d), or null. */
    medianDecisionMinutes: number | null;
    funnelNote: string | null;
    /** Throughput decisiones última hora (approve+reject). */
    throughputLastHour: number | null;
    /** ETA drenaje = backlog / throughput (horas). */
    hoursToDrain: number | null;
    claimedActive: number | null;
    highValueEstimate: number | null;
    slaBreachEstimate: number | null;
    pendingGt48h: number | null;
  };
  /** Ofertas approved/published no expiradas (feed-eligible). */
  liveDeals: number | null;
  /** Liability productiva (excluye QA). */
  userLiabilityConfirmedCents: number;
  /** Cuello de botella del circuito (STATUS → PROBLEM → IMPACT → ACTION). */
  circuitBottleneck: CircuitBottleneck;
  /** Supply Engine — solo métricas accionables para CEO. */
  supply: {
    mode: string;
    writeEnabled: boolean;
    discovered: number | null;
    verified: number | null;
    approvalReady: number | null;
    highQuality: number | null;
    pendingModeration: number | null;
    stickyObserved: number | null;
    freshDiscovered: number | null;
    stickyPdpSuccess: number | null;
    stickyEvidenceRich: number | null;
    stickyVerified: number | null;
    stickyApprovalReady: number | null;
    freshVerified: number | null;
    freshApprovalReady: number | null;
    qualityRatePct: number | null;
    topNiche: string | null;
    topQuery: string | null;
    topSource: string | null;
    bottleneck: 'discovery' | 'price_memory' | 'moderation' | 'none';
    action: string;
    priceMemoryReadyEligible7d: number | null;
    nichesEnabled: string[];
  };
  affiliation: {
    programsActive: number;
    programsTotal: number;
    amazonTagConfigured: boolean;
    mercadolibreTagConfigured: boolean;
    outboundByStore: { store: string; outbound: number }[];
    storeBreakdownNote: string;
  };
  operations: {
    integrityOk: boolean | null;
    integrityFailedChecks: number;
    writeQueuePending: number;
    writeQueueFailed: number;
  };
  alerts: OwnerAlert[];
  recommendedAction: {
    title: string;
    detail: string;
    href: string;
  };
  dataGaps: string[];
  economy: EstimatedEconomy;
  offerHealth: OfferHealthSummary;
};

async function countProfilesCreatedBetween(start: string, end: string): Promise<number> {
  const supabase = createServerClient();
  const { count, error } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', start)
    .lt('created_at', end);
  if (error) return 0;
  return count ?? 0;
}

async function countActiveUsersBetween(start: string, end: string): Promise<number | null> {
  const supabase = createServerClient();
  try {
    const { count, error } = await supabase
      .from('user_activity')
      .select('user_id', { count: 'exact', head: true })
      .gte('last_seen_at', start)
      .lt('last_seen_at', end);
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

async function countOfferEventsBetween(
  start: string,
  end: string,
  eventType: 'view' | 'outbound'
): Promise<number | null> {
  const supabase = createServerClient();
  const { count, error } = await supabase
    .from('offer_events')
    .select('id', { count: 'exact', head: true })
    .eq('event_type', eventType)
    .gte('created_at', start)
    .lt('created_at', end);
  if (error) return null;
  return count ?? 0;
}

async function countOffersCreatedBetween(start: string, end: string): Promise<number | null> {
  const supabase = createServerClient();
  const { count, error } = await supabase
    .from('offers')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', start)
    .lt('created_at', end);
  if (error) return null;
  return count ?? 0;
}

async function countModerationActions(action: 'approved' | 'rejected', start: string, end: string): Promise<number | null> {
  const supabase = createServerClient();
  const { count, error } = await supabase
    .from('moderation_logs')
    .select('id', { count: 'exact', head: true })
    .eq('action', action)
    .gte('created_at', start)
    .lt('created_at', end);
  if (error) return null;
  return count ?? 0;
}

async function countPendingOffers(): Promise<number> {
  const supabase = createServerClient();
  const { count, error } = await supabase
    .from('offers')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (error) return 0;
  return count ?? 0;
}

/** Edad de cola pending (SLA). Solo lectura. */
async function fetchPendingAgeStats(): Promise<{
  pendingGt24h: number;
  oldestPendingHours: number | null;
}> {
  const supabase = createServerClient();
  const cutoff24 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [{ count: gt24 }, { data: oldestRow }] = await Promise.all([
    supabase
      .from('offers')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lt('created_at', cutoff24),
    supabase
      .from('offers')
      .select('created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  let oldestPendingHours: number | null = null;
  const created = (oldestRow as { created_at?: string } | null)?.created_at;
  if (created) {
    const ms = Date.now() - new Date(created).getTime();
    if (Number.isFinite(ms) && ms >= 0) oldestPendingHours = Math.round(ms / 3_600_000);
  }
  return { pendingGt24h: gt24 ?? 0, oldestPendingHours };
}

/** Fuentes Hunter sin éxito reciente (stale). Solo lectura. */
async function countStaleHunterSources(staleMs = 6 * 60 * 60 * 1000): Promise<number | null> {
  const supabase = createServerClient();
  try {
    const { data, error } = await supabase
      .from('hunter_source_health')
      .select('source_id, enabled, last_success_at, last_run_at')
      .eq('enabled', true);
    if (error) return null;
    const cutoff = Date.now() - staleMs;
    let stale = 0;
    for (const row of data ?? []) {
      const r = row as {
        last_success_at?: string | null;
        last_run_at?: string | null;
      };
      const ts = r.last_success_at || r.last_run_at;
      if (!ts) {
        stale += 1;
        continue;
      }
      const t = new Date(ts).getTime();
      if (!Number.isFinite(t) || t < cutoff) stale += 1;
    }
    return stale;
  } catch {
    return null;
  }
}

async function buildPeriodKpis(start: string, end: string, includePendingSnapshot: boolean): Promise<PeriodKpis> {
  const [activeUsers, newUsers, views, outbound, approved, rejected, created] = await Promise.all([
    countActiveUsersBetween(start, end),
    countProfilesCreatedBetween(start, end),
    countOfferEventsBetween(start, end, 'view'),
    countOfferEventsBetween(start, end, 'outbound'),
    countModerationActions('approved', start, end),
    countModerationActions('rejected', start, end),
    countOffersCreatedBetween(start, end),
  ]);

  const pending = includePendingSnapshot ? await countPendingOffers() : null;
  const ctr =
    views != null && outbound != null && views > 0
      ? Math.round((outbound / views) * 10000) / 100
      : views === 0 && outbound === 0
        ? null
        : null;

  return {
    activeUsers,
    newUsers,
    offersApproved: approved,
    offersPending: pending,
    offersRejected: rejected,
    offersCreated: created,
    views,
    outbound,
    ctr,
    available: views != null && outbound != null,
  };
}

type EventRow = { offer_id: string; event_type: string };

async function fetchEventsInWindow(start: string, end: string): Promise<EventRow[] | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('offer_events')
    .select('offer_id, event_type')
    .gte('created_at', start)
    .lt('created_at', end)
    .in('event_type', ['view', 'outbound']);
  if (error) return null;
  return (data ?? []) as EventRow[];
}

async function aggregateTopOffers(start: string, end: string, limit = 5): Promise<TopOfferRow[]> {
  const events = await fetchEventsInWindow(start, end);
  if (!events) return [];

  const byOffer = new Map<string, { views: number; outbound: number }>();
  for (const e of events) {
    const cur = byOffer.get(e.offer_id) ?? { views: 0, outbound: 0 };
    if (e.event_type === 'view') cur.views += 1;
    if (e.event_type === 'outbound') cur.outbound += 1;
    byOffer.set(e.offer_id, cur);
  }

  const sorted = [...byOffer.entries()]
    .map(([id, agg]) => ({ id, ...agg }))
    .sort((a, b) => b.outbound - a.outbound || b.views - a.views)
    .slice(0, limit);

  if (sorted.length === 0) return [];

  const supabase = createServerClient();
  const { data: offers } = await supabase
    .from('offers')
    .select('id, title, store, category')
    .in(
      'id',
      sorted.map((s) => s.id)
    );

  const meta = new Map((offers ?? []).map((o: { id: string; title: string; store: string | null; category: string | null }) => [o.id, o]));

  return sorted.map((s) => {
    const o = meta.get(s.id);
    const ctr = s.views > 0 ? Math.round((s.outbound / s.views) * 10000) / 100 : null;
    return {
      id: s.id,
      title: o?.title?.slice(0, 80) ?? 'Oferta',
      outbound: s.outbound,
      views: s.views,
      ctr,
      store: o?.store ?? null,
      category: o?.category ?? null,
    };
  });
}

async function aggregateTopCategories(start: string, end: string, limit = 5): Promise<TopCategoryRow[]> {
  const topOffers = await aggregateTopOffers(start, end, 200);
  const byCat = new Map<string, { views: number; outbound: number }>();
  for (const row of topOffers) {
    const cat = row.category?.trim() || 'other';
    const cur = byCat.get(cat) ?? { views: 0, outbound: 0 };
    cur.views += row.views;
    cur.outbound += row.outbound;
    byCat.set(cat, cur);
  }
  return [...byCat.entries()]
    .map(([category, agg]) => ({
      category,
      views: agg.views,
      outbound: agg.outbound,
      ctr: agg.views > 0 ? Math.round((agg.outbound / agg.views) * 10000) / 100 : null,
    }))
    .sort((a, b) => b.outbound - a.outbound)
    .slice(0, limit);
}

async function avgApprovalHoursLast7d(): Promise<{ hours: number | null; note: string | null }> {
  const supabase = createServerClient();
  const since = daysAgoUtc(7);
  const { data: logs, error } = await supabase
    .from('moderation_logs')
    .select('offer_id, created_at')
    .eq('action', 'approved')
    .gte('created_at', since)
    .limit(200);
  if (error || !logs?.length) {
    return { hours: null, note: error ? 'No se pudo leer moderation_logs' : 'Sin aprobaciones en 7 días' };
  }

  const offerIds = [...new Set((logs as { offer_id: string }[]).map((l) => l.offer_id))];
  const { data: offers } = await supabase.from('offers').select('id, created_at').in('id', offerIds);
  const createdMap = new Map(
    (offers ?? []).map((o: { id: string; created_at: string }) => [o.id, new Date(o.created_at).getTime()])
  );

  const deltas: number[] = [];
  for (const log of logs as { offer_id: string; created_at: string }[]) {
    const created = createdMap.get(log.offer_id);
    if (created == null) continue;
    const approved = new Date(log.created_at).getTime();
    if (approved >= created) {
      deltas.push((approved - created) / (1000 * 60 * 60));
    }
  }
  if (deltas.length === 0) return { hours: null, note: 'Sin pares oferta–aprobación comparables' };
  const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  return { hours: Math.round(avg * 10) / 10, note: null };
}

async function ledgerGrossMonthCents(): Promise<{ cents: number | null; available: boolean; note: string | null }> {
  const supabase = createServerClient();
  const { ymdStart, ymdEnd, startIso, endIso } = monthYmdRange();
  const { data, error } = await supabase
    .from('affiliate_ledger_entries')
    .select(
      'amount_cents, period_start, period_end, status, created_at, external_ref, source, notes, meta, tracking_tag',
    )
    .in('status', ['accrued', 'paid', 'pending']);

  if (error) {
    const msg = (error.message ?? '').toLowerCase();
    if (msg.includes('column') || msg.includes('does not exist')) {
      const fallback = await supabase
        .from('affiliate_ledger_entries')
        .select('amount_cents, period_start, period_end, status, created_at, external_ref')
        .in('status', ['accrued', 'paid', 'pending']);
      if (fallback.error) {
        if ((fallback.error.message ?? '').toLowerCase().includes('affiliate_ledger')) {
          return { cents: null, available: false, note: 'Tabla affiliate_ledger_entries no migrada' };
        }
        return { cents: null, available: false, note: fallback.error.message };
      }
      const { production } = filterProductionLedgerRows(
        (fallback.data ?? []) as Parameters<typeof filterProductionLedgerRows>[0],
      );
      return {
        cents: sumLedgerCentsInRange(production, ymdStart, ymdEnd, startIso, endIso),
        available: true,
        note: null,
      };
    }
    if (msg.includes('affiliate_ledger') || msg.includes('does not exist')) {
      return { cents: null, available: false, note: 'Tabla affiliate_ledger_entries no migrada' };
    }
    return { cents: null, available: false, note: error.message };
  }

  const { production } = filterProductionLedgerRows(
    (data ?? []) as Parameters<typeof filterProductionLedgerRows>[0],
  );
  return {
    cents: sumLedgerCentsInRange(production, ymdStart, ymdEnd, startIso, endIso),
    available: true,
    note: null,
  };
}

async function countLiveFeedOffers(): Promise<number | null> {
  const supabase = createServerClient();
  const nowISO = new Date().toISOString();
  const { count, error } = await supabase
    .from('offers')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .in('status', ['approved', 'published'])
    .or(`expires_at.is.null,expires_at.gte.${nowISO}`);
  if (error) return null;
  return count ?? 0;
}

async function sumProductionUserLiabilityCents(): Promise<number> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('creator_rewards')
    .select('creator_share_cents, status, meta, ledger_entry_id')
    .in('status', ['PENDING', 'VALIDATING', 'AVAILABLE', 'PAID']);
  if (error) return 0;
  const ledgerIds = [
    ...new Set(
      (data ?? [])
        .map((r) => (r as { ledger_entry_id?: string | null }).ledger_entry_id)
        .filter((id): id is string => typeof id === 'string' && Boolean(id)),
    ),
  ];
  const ledgerById = new Map<string, { external_ref?: string | null; meta?: unknown }>();
  if (ledgerIds.length > 0) {
    const { data: ledgers } = await supabase
      .from('affiliate_ledger_entries')
      .select('id, external_ref, meta')
      .in('id', ledgerIds);
    for (const L of ledgers ?? []) {
      const row = L as { id: string; external_ref?: string | null; meta?: unknown };
      ledgerById.set(row.id, row);
    }
  }
  let sum = 0;
  for (const row of data ?? []) {
    const r = row as {
      creator_share_cents?: number;
      meta?: unknown;
      ledger_entry_id?: string | null;
    };
    const ledger = r.ledger_entry_id ? ledgerById.get(r.ledger_entry_id) : undefined;
    if (
      isSyntheticFinancialRecord({
        meta: r.meta ?? ledger?.meta,
        externalRef: ledger?.external_ref,
      })
    ) {
      continue;
    }
    // Sin ledger productivo atribuible → no contar como liability confirmada.
    if (!ledger || !isProductionFinancialRecord({ externalRef: ledger.external_ref, meta: ledger.meta ?? r.meta })) {
      continue;
    }
    sum += Number(r.creator_share_cents) || 0;
  }
  return sum;
}

async function outboundByStoreWeek(): Promise<{ store: string; outbound: number }[]> {
  const w = windowLastDays(7);
  const events = await fetchEventsInWindow(w.start, w.end);
  if (!events?.length) return [];

  const outboundIds = events.filter((e) => e.event_type === 'outbound').map((e) => e.offer_id);
  if (outboundIds.length === 0) return [];

  const supabase = createServerClient();
  const uniqueIds = [...new Set(outboundIds)];
  const { data: offers } = await supabase.from('offers').select('id, store').in('id', uniqueIds);
  const storeById = new Map((offers ?? []).map((o: { id: string; store: string | null }) => [o.id, o.store ?? 'Desconocida']));

  const counts = new Map<string, number>();
  for (const id of outboundIds) {
    const raw = storeById.get(id) ?? 'Desconocida';
    const key = raw.toLowerCase().includes('amazon')
      ? 'Amazon'
      : raw.toLowerCase().includes('mercado') || raw.toLowerCase().includes('meli')
        ? 'Mercado Libre'
        : raw.slice(0, 40);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([store, outbound]) => ({ store, outbound }))
    .sort((a, b) => b.outbound - a.outbound)
    .slice(0, 8);
}

async function fetchGrowthAndRetention(): Promise<{ weeklyPct: number | null; retention48hPct: number | null }> {
  const supabase = createServerClient();
  const now = new Date();
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

  let retention48hPct: number | null = null;
  try {
    const { data: activity } = await supabase
      .from('user_activity')
      .select('user_id, first_seen_at, last_seen_at')
      .lt('first_seen_at', fortyEightHoursAgo);
    const cohort = (activity ?? []) as { first_seen_at: string; last_seen_at: string }[];
    const returned = cohort.filter((r) => {
      const first = new Date(r.first_seen_at).getTime();
      const last = new Date(r.last_seen_at).getTime();
      const fiveMin = 5 * 60 * 1000;
      const fortyEight = 48 * 60 * 60 * 1000;
      return last - first >= fiveMin && last <= first + fortyEight;
    });
    retention48hPct = cohort.length > 0 ? Math.round((returned.length / cohort.length) * 10000) / 100 : null;
  } catch {
    retention48hPct = null;
  }

  let growthWeeklyPct: number | null = null;
  try {
    const [currentWindow, previousWindow] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', fourteenDaysAgo)
        .lt('created_at', sevenDaysAgo),
    ]);
    const current = currentWindow.count ?? 0;
    const previous = previousWindow.count ?? 0;
    growthWeeklyPct = Math.round((((current - previous) / Math.max(previous, 1)) * 100) * 100) / 100;
  } catch {
    growthWeeklyPct = null;
  }

  return { weeklyPct: growthWeeklyPct, retention48hPct };
}

function diffLabel(current: number | null, previous: number | null): string | null {
  if (current == null || previous == null) return null;
  const d = current - previous;
  if (d === 0) return 'igual que ayer';
  const sign = d > 0 ? '+' : '';
  return `${sign}${d} vs ayer`;
}

function pickRecommendedAction(
  alerts: OwnerAlert[],
  pending: number,
  bottleneck: CircuitBottleneck,
): OwnerDashboardPayload['recommendedAction'] {
  // El cuello de botello del circuito manda sobre alertas genéricas.
  if (bottleneck.id !== 'none') {
    return {
      title: bottleneck.recommendedAction,
      detail: `${bottleneck.problem}. Impacto: ${bottleneck.impact}`,
      href: bottleneck.href,
    };
  }
  const red = alerts.find((a) => a.severity === 'red');
  if (red?.id === 'moderation_queue') {
    return {
      title: `Aprueba ${pending} ofertas pendientes`,
      detail: red.detail,
      href: '/admin/moderation',
    };
  }
  if (red?.id === 'integrity') {
    return { title: 'Revisa integridad del sistema', detail: red.detail, href: '/admin/operaciones' };
  }
  if (red?.id === 'affiliate_tags') {
    return { title: 'Revisa afiliación', detail: red.detail, href: '/admin/operaciones' };
  }
  const yellow = alerts.find((a) => a.severity === 'yellow');
  if (yellow?.id === 'ledger_empty') {
    return { title: 'Registra ingresos en el ledger', detail: yellow.detail, href: '/admin/commissions' };
  }
  if (yellow?.id === 'ctr_low') {
    return { title: 'Revisa calidad del feed', detail: yellow.detail, href: '/admin/metrics' };
  }
  if (pending > 0) {
    return {
      title: `Moderar ${pending} oferta${pending === 1 ? '' : 's'} pendiente${pending === 1 ? '' : 's'}`,
      detail: 'Mantén la cola por debajo de 24 h.',
      href: '/admin/moderation',
    };
  }
  return {
    title: 'Todo en orden — revisa métricas de la semana',
    detail: 'Sin alertas críticas.',
    href: '/admin/metrics',
  };
}

export async function buildOwnerDashboard(): Promise<OwnerDashboardPayload> {
  const now = new Date();
  const todayW = windowToday(now);
  const yesterdayW = windowYesterday(now);
  const weekW = windowLastDays(7, now);
  const monthW = monthYmdRange(now);

  const [
    today,
    yesterday,
    weekBase,
    pending,
    growth,
    ledger,
    approvalSla,
    topOffersWeek,
    topCategoriesWeek,
    storeBreakdown,
    integrityRes,
    queueBacklog,
    programs,
    economyResult,
    offerHealthResult,
    liveDealsResult,
    liabilityResult,
    funnelSnapshot,
    pendingAge,
    supplyStale,
    modOps,
    supplyToday,
  ] = await Promise.all([
    buildPeriodKpis(todayW.start, todayW.end, true),
    buildPeriodKpis(yesterdayW.start, yesterdayW.end, false),
    buildPeriodKpis(weekW.start, weekW.end, false),
    countPendingOffers(),
    fetchGrowthAndRetention(),
    ledgerGrossMonthCents(),
    avgApprovalHoursLast7d(),
    aggregateTopOffers(weekW.start, weekW.end, 5),
    aggregateTopCategories(weekW.start, weekW.end, 5),
    outboundByStoreWeek(),
    createServerClient().from('app_config').select('value').eq('key', 'system_integrity_last').maybeSingle(),
    getWriteQueueBacklog(),
    Promise.resolve(getAffiliateProgramsRuntimeStatus()),
    buildEstimatedEconomy(now),
    fetchOfferHealthSummary(),
    countLiveFeedOffers(),
    sumProductionUserLiabilityCents(),
    buildSupplyFunnelSnapshot({ windowDays: 7 }),
    fetchPendingAgeStats(),
    countStaleHunterSources(),
    buildModerationOpsStats(createServerClient(), 500),
    buildSupplyToday(),
  ]);

  const monthViews = await countOfferEventsBetween(monthW.startIso, monthW.endIso, 'view');
  const monthOutbound = await countOfferEventsBetween(monthW.startIso, monthW.endIso, 'outbound');
  const monthCtr =
    monthViews != null && monthOutbound != null && monthViews > 0
      ? Math.round((monthOutbound / monthViews) * 10000) / 100
      : null;

  const monthTopOffers = await aggregateTopOffers(monthW.startIso, monthW.endIso, 1);
  const monthTopOffer = monthTopOffers[0] ?? null;

  const economy = economyResult;
  const offerHealth = offerHealthResult;

  const estimatedRevenueCents = economy.month.estimatedCents;
  const estimatedNote =
    economy.epcCents != null
      ? `Estimado mes: clics × EPC (${economy.epcWindowLabel}). ${economy.confidenceReason}`
      : economy.confidenceReason;

  const integrity = (integrityRes.data as { value?: { ok?: boolean; summary?: { failed?: number } } } | null)?.value;
  const integrityOk = integrity?.ok ?? null;
  const integrityFailed = integrity?.summary?.failed ?? 0;

  const amazonActive = programs.find((p) => p.id === 'amazon')?.active ?? false;
  const mlActive = programs.find((p) => p.id === 'mercadolibre')?.active ?? false;
  const programsActive = programs.filter((p) => p.active).length;

  const dataGaps: string[] = [];
  if (today.activeUsers == null) dataGaps.push('user_activity no disponible — DAU aproximado omitido');
  if (!ledger.available) dataGaps.push('Ledger de afiliados no migrado o inaccesible');
  if (ledger.available && (ledger.cents ?? 0) === 0) {
    dataGaps.push('Ingreso bruto del mes en ledger productivo: $0 (QA excluido)');
  }
  if (economy.syntheticLedgerRowsExcluded > 0) {
    dataGaps.push(
      `${economy.syntheticLedgerRowsExcluded} fila(s) ledger QA/synthetic excluidas de revenue/EPC`,
    );
  }
  dataGaps.push(
    `Volumen outbound SoT=${OUTBOUND_VOLUME_SOT}; atribución Rewards en reward_outbound_clicks (dual-write track-outbound)`,
  );
  dataGaps.push(
    'Atribución automática venta→oferta: Amazon sub-id high-confidence; ML sin sub-id → staff/ventana. Money path FAIL-CLOSED.',
  );

  const alerts: OwnerAlert[] = [];
  const SLA_HOURS = 24;

  if (economy.syntheticLedgerRowsExcluded > 0 && (economy.month.realCents ?? 0) === 0) {
    alerts.push({
      id: 'synthetic_ledger_excluded',
      severity: 'yellow',
      title: 'Datos QA excluidos del revenue',
      detail: `${economy.syntheticLedgerRowsExcluded} fila(s) synthetic/QA no cuentan como economía de producción.`,
    });
  }
  if ((liveDealsResult ?? 0) < 3 && pending >= 5) {
    alerts.push({
      id: 'live_starvation',
      severity: 'red',
      title: 'Live starvation',
      detail: `${liveDealsResult ?? 0} live vs ${pending} pending — feed sin liquidez.`,
    });
  }
  if (pending >= 10) {
    alerts.push({
      id: 'moderation_queue',
      severity: pending >= 20 ? 'red' : 'yellow',
      title: 'Cola de moderación alta',
      detail: `${pending} ofertas pendientes (${pendingAge.pendingGt24h} >24h).`,
    });
  }
  if (integrityOk === false) {
    alerts.push({
      id: 'integrity',
      severity: 'red',
      title: 'Integridad fallida',
      detail: `${integrityFailed} chequeo(s) con error en el último run.`,
    });
  }
  if (!amazonActive || !mlActive) {
    alerts.push({
      id: 'affiliate_tags',
      severity: 'red',
      title: 'Tags de afiliado incompletos',
      detail: `Amazon: ${amazonActive ? 'OK' : 'sin tag'}. Mercado Libre: ${mlActive ? 'OK' : 'sin tag'}.`,
    });
  }
  if (ledger.available && (ledger.cents ?? 0) === 0 && (monthOutbound ?? 0) > 5) {
    alerts.push({
      id: 'ledger_empty',
      severity: 'yellow',
      title: 'Ledger vacío este mes',
      detail: 'Hay clics pero no hay ingresos registrados en el ledger.',
    });
  }
  if (weekBase.ctr != null && weekBase.ctr < 3 && (weekBase.views ?? 0) > 20) {
    alerts.push({
      id: 'ctr_low',
      severity: 'yellow',
      title: 'CTR semanal bajo',
      detail: `CTR ${weekBase.ctr}% en los últimos 7 días.`,
    });
  }
  if (queueBacklog.failed > 20) {
    alerts.push({
      id: 'write_queue',
      severity: 'yellow',
      title: 'Cola de escritura con fallos',
      detail: `${queueBacklog.failed} jobs fallidos.`,
    });
  }
  if (supplyToday.bottleneck === 'price_memory') {
    alerts.push({
      id: 'supply_price_memory',
      severity: 'yellow',
      title: 'Price Memory frío',
      detail: supplyToday.action,
    });
  } else if (supplyToday.bottleneck === 'discovery') {
    alerts.push({
      id: 'supply_discovery',
      severity: 'yellow',
      title: 'Discovery insuficiente',
      detail: supplyToday.action,
    });
  }

  const circuitBottleneck = pickCircuitBottleneck({
    liveDeals: liveDealsResult,
    pending,
    pendingGt24h: pendingAge.pendingGt24h,
    oldestPendingHours: pendingAge.oldestPendingHours,
    outbound7d: weekBase.outbound,
    integrityOk,
    amazonTagConfigured: amazonActive,
    mercadolibreTagConfigured: mlActive,
    supplyStaleSources: supplyStale,
    highValuePending: modOps.highValueEstimate,
    slaBreachPending: modOps.slaBreachEstimate,
  });

  let status: TrafficLight = 'green';
  if (alerts.some((a) => a.severity === 'red') || circuitBottleneck.severity === 'red') status = 'red';
  else if (alerts.length > 0 || circuitBottleneck.severity === 'yellow') status = 'yellow';

  let headline = 'AVENTA operando con normalidad';
  let subline = `Zona ${OWNER_DASHBOARD_TZ}. Actualizado ${now.toLocaleString('es-MX', { timeZone: OWNER_DASHBOARD_TZ })}`;
  if (status === 'red') {
    headline = alerts.find((a) => a.severity === 'red')?.title ?? circuitBottleneck.problem;
    subline = alerts.find((a) => a.severity === 'red')?.detail ?? circuitBottleneck.impact;
  } else if (status === 'yellow') {
    headline = 'AVENTA operando con avisos';
    subline = alerts[0]?.detail ?? circuitBottleneck.problem;
  }

  const slaOk =
    approvalSla.hours != null ? approvalSla.hours <= SLA_HOURS : null;

  return {
    generatedAt: now.toISOString(),
    timezone: OWNER_DASHBOARD_TZ,
    summary: { status, headline, subline },
    growth: {
      weeklyPct: growth.weeklyPct,
      retention48hPct: growth.retention48hPct,
    },
    today,
    yesterday,
    week: {
      ...weekBase,
      topOffers: topOffersWeek,
      topCategories: topCategoriesWeek,
    },
    month: {
      outbound: monthOutbound,
      views: monthViews,
      ctr: monthCtr,
      ledgerGrossCents: ledger.cents,
      ledgerAvailable: ledger.available,
      ledgerNote: ledger.note,
      estimatedRevenueCents,
      estimatedNote,
      topOffer: monthTopOffer,
    },
    moderation: {
      pending,
      pendingGt24h: pendingAge.pendingGt24h,
      oldestPendingHours: pendingAge.oldestPendingHours,
      rejectedToday: today.offersRejected,
      approvedToday: today.offersApproved,
      avgApprovalHours: approvalSla.hours,
      slaHoursTarget: SLA_HOURS,
      slaOk,
      slaNote: approvalSla.note,
      pendingToLivePct: funnelSnapshot.pendingToLivePct,
      medianDecisionMinutes: funnelSnapshot.medianDecisionMinutes,
      funnelNote: funnelSnapshot.note,
      throughputLastHour: modOps.throughputLastHour,
      hoursToDrain: modOps.hoursToDrain,
      claimedActive: modOps.claimedActive,
      highValueEstimate: modOps.highValueEstimate,
      slaBreachEstimate: modOps.slaBreachEstimate,
      pendingGt48h: modOps.pendingGt48h,
    },
    liveDeals: liveDealsResult,
    userLiabilityConfirmedCents: liabilityResult,
    circuitBottleneck,
    supply: {
      mode: supplyToday.mode,
      writeEnabled: supplyToday.writeEnabled,
      discovered: supplyToday.discovered,
      verified: supplyToday.verified,
      approvalReady: supplyToday.approvalReady,
      highQuality: supplyToday.highQuality,
      pendingModeration: supplyToday.pendingModeration,
      stickyObserved: supplyToday.stickyObserved,
      freshDiscovered: supplyToday.freshDiscovered,
      stickyPdpSuccess: supplyToday.stickyPdpSuccess ?? null,
      stickyEvidenceRich: supplyToday.stickyEvidenceRich ?? null,
      stickyVerified: supplyToday.stickyVerified,
      stickyApprovalReady: supplyToday.stickyApprovalReady,
      freshVerified: supplyToday.freshVerified,
      freshApprovalReady: supplyToday.freshApprovalReady,
      qualityRatePct: supplyToday.qualityRatePct,
      topNiche: supplyToday.topNiche,
      topQuery: supplyToday.topQuery,
      topSource: supplyToday.topSource,
      bottleneck: supplyToday.bottleneck,
      action: supplyToday.action,
      priceMemoryReadyEligible7d: supplyToday.priceMemory.productsHistoryReadyEligible7d,
      nichesEnabled: supplyToday.nichesEnabled,
    },
    affiliation: {
      programsActive,
      programsTotal: programs.length,
      amazonTagConfigured: amazonActive,
      mercadolibreTagConfigured: mlActive,
      outboundByStore: storeBreakdown,
      storeBreakdownNote:
        'Clics por tienda según campo store de la oferta al hacer outbound. No sustituye reporte de red de afiliados.',
    },
    operations: {
      integrityOk,
      integrityFailedChecks: integrityFailed,
      writeQueuePending: queueBacklog.pending,
      writeQueueFailed: queueBacklog.failed,
    },
    alerts,
    recommendedAction: pickRecommendedAction(alerts, pending, circuitBottleneck),
    dataGaps,
    economy,
    offerHealth,
  };
}

export function formatDiff(current: number | null, previous: number | null): {
  delta: number | null;
  label: string | null;
} {
  if (current == null || previous == null) return { delta: null, label: null };
  const delta = current - previous;
  return { delta, label: diffLabel(current, previous) };
}
