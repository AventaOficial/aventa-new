import { createServerClient } from '@/lib/supabase/server';
import { getAffiliateProgramsRuntimeStatus } from '@/lib/affiliate/programCatalog';
import { getWriteQueueBacklog } from '@/lib/server/writeQueue';
import {
  daysAgoUtc,
  monthYmdRange,
  OWNER_DASHBOARD_TZ,
  windowLastDays,
  windowToday,
  windowYesterday,
} from '@/lib/owner/mxTime';

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
    rejectedToday: number | null;
    approvedToday: number | null;
    avgApprovalHours: number | null;
    slaHoursTarget: number;
    slaOk: boolean | null;
    slaNote: string | null;
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
    .select('amount_cents, period_start, period_end, status, created_at')
    .in('status', ['accrued', 'paid', 'pending']);

  if (error) {
    const msg = (error.message ?? '').toLowerCase();
    if (msg.includes('affiliate_ledger') || msg.includes('does not exist')) {
      return { cents: null, available: false, note: 'Tabla affiliate_ledger_entries no migrada' };
    }
    return { cents: null, available: false, note: error.message };
  }

  let sum = 0;
  for (const row of data ?? []) {
    const r = row as {
      amount_cents: number;
      period_start: string | null;
      period_end: string | null;
      created_at: string;
    };
    const ps = r.period_start;
    const pe = r.period_end;
    const inPeriod =
      (ps && ps <= ymdEnd && (!pe || pe >= ymdStart)) ||
      (!ps && r.created_at >= startIso && r.created_at < endIso);
    if (inPeriod) sum += Number(r.amount_cents) || 0;
  }
  return { cents: sum, available: true, note: null };
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

function pickRecommendedAction(alerts: OwnerAlert[], pending: number): OwnerDashboardPayload['recommendedAction'] {
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
  ]);

  const monthViews = await countOfferEventsBetween(monthW.startIso, monthW.endIso, 'view');
  const monthOutbound = await countOfferEventsBetween(monthW.startIso, monthW.endIso, 'outbound');
  const monthCtr =
    monthViews != null && monthOutbound != null && monthViews > 0
      ? Math.round((monthOutbound / monthViews) * 10000) / 100
      : null;

  const monthTopOffers = await aggregateTopOffers(monthW.startIso, monthW.endIso, 1);
  const monthTopOffer = monthTopOffers[0] ?? null;

  let estimatedRevenueCents: number | null = null;
  let estimatedNote: string | null = null;
  if (ledger.cents != null && ledger.cents > 0) {
    estimatedRevenueCents = ledger.cents;
    estimatedNote = 'Ingreso bruto registrado en ledger (mes calendario MX).';
  } else if (monthOutbound != null && monthOutbound > 0 && ledger.available) {
    estimatedRevenueCents = null;
    estimatedNote =
      'Sin ledger este mes. El ingreso real se registra manualmente en Admin → Comisiones. Los clics no equivalen a ingreso.';
  } else if (!ledger.available) {
    estimatedNote = ledger.note;
  }

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
    dataGaps.push('Ingreso bruto del mes en ledger: $0 registrado (puede ser normal si aún no importas)');
  }
  dataGaps.push('Clics “sin tag” no medibles en BD — solo cobertura de programas por env');
  dataGaps.push('Atribución venta → oferta: no existe en producto');

  const alerts: OwnerAlert[] = [];
  const SLA_HOURS = 24;

  if (pending >= 10) {
    alerts.push({
      id: 'moderation_queue',
      severity: pending >= 20 ? 'red' : 'yellow',
      title: 'Cola de moderación alta',
      detail: `${pending} ofertas pendientes.`,
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

  let status: TrafficLight = 'green';
  if (alerts.some((a) => a.severity === 'red')) status = 'red';
  else if (alerts.length > 0) status = 'yellow';

  let headline = 'AVENTA operando con normalidad';
  let subline = `Zona ${OWNER_DASHBOARD_TZ}. Actualizado ${now.toLocaleString('es-MX', { timeZone: OWNER_DASHBOARD_TZ })}`;
  if (status === 'red') {
    headline = alerts.find((a) => a.severity === 'red')?.title ?? 'Requiere atención';
    subline = alerts.find((a) => a.severity === 'red')?.detail ?? subline;
  } else if (status === 'yellow') {
    headline = 'AVENTA operando con avisos';
    subline = alerts[0]?.detail ?? subline;
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
      rejectedToday: today.offersRejected,
      approvedToday: today.offersApproved,
      avgApprovalHours: approvalSla.hours,
      slaHoursTarget: SLA_HOURS,
      slaOk,
      slaNote: approvalSla.note,
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
    recommendedAction: pickRecommendedAction(alerts, pending),
    dataGaps,
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
