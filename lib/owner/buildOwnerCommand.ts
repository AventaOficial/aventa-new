import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import { isMoneyPathFrozen } from '@/lib/server/moneyPathFreeze';
import {
  bucketIndex,
  bucketLabel,
  resolveOwnerRange,
  type OwnerRangeKey,
  type ResolvedOwnerRange,
} from '@/lib/owner/ownerRange';

/**
 * CEO Command Center — agregados por rango (solo lectura).
 * Cada contador es `null` cuando la consulta falla o la tabla no existe: nunca se convierte en 0.
 */

export type RangeMetric = { value: number | null; previous: number | null };

export type SeriesPoint = { label: string; offers: number; outbound: number; newUsers: number };

export type ActivityEventKind = 'moderation' | 'offer' | 'report' | 'hunter' | 'ban' | 'integrity' | 'queue';

export type ActivityEvent = {
  id: string;
  at: string;
  kind: ActivityEventKind;
  title: string;
  detail: string | null;
  tone: 'ok' | 'warn' | 'error' | 'info';
};

export type OwnerCommandPayload = {
  generatedAt: string;
  range: Pick<ResolvedOwnerRange, 'key' | 'label' | 'start' | 'end' | 'prevStart' | 'prevEnd' | 'prevLabel' | 'bucket'>;
  community: {
    offersCreated: RangeMetric;
    votes: RangeMetric;
    comments: RangeMetric;
    favorites: RangeMetric;
    reports: RangeMetric;
    /** Autores humanos distintos con ofertas creadas en el rango (excluye bots de ingesta). */
    activeHunters: RangeMetric;
    plazaRequests: RangeMetric;
    plazaDiscussions: RangeMetric;
  };
  users: {
    newUsers: RangeMetric;
    /** user_activity.last_seen_at dentro del rango; sin comparación (la tabla solo guarda el último acceso). */
    activeUsers: number | null;
    totalProfiles: number | null;
  };
  traffic: { views: RangeMetric; outbound: RangeMetric };
  moderation: {
    approved: RangeMetric;
    rejected: RangeMetric;
    /** Moderadores distintos con decisiones registradas en moderation_logs en el rango. */
    activeModerators: number | null;
    pendingReports: number | null;
    activeBans: number | null;
  };
  catalog: {
    pending: number | null;
    live: number | null;
    expired: number | null;
    rejected: number | null;
  };
  plaza: { pendingRequests: number | null; approvedRequests: number | null };
  hunter: {
    runs: number | null;
    runsOk: number | null;
    runsZero: number | null;
    runsSkipped: number | null;
    runsOther: number | null;
    discovered: number | null;
    qualified: number | null;
    verified: number | null;
    rejected: number | null;
    duplicates: number | null;
    errors: number | null;
    avgDurationMs: number | null;
    lastRunAt: string | null;
    lastRunStatus: string | null;
    lastRunSource: string | null;
  };
  operations: {
    integrityFinishedAt: string | null;
    integrityOk: boolean | null;
    integrityFailed: number | null;
    dailyMetricsLastDate: string | null;
    queuePending: number | null;
    queueFailed: number | null;
    queueOldestPendingAt: string | null;
  };
  finance: {
    moneyPathFrozen: boolean;
    /** Conteos por estado (registros, incluye QA/synthetic; sin montos). */
    rewardsByStatus: Record<string, number> | null;
    payoutIntentsByStatus: Record<string, number> | null;
    latestPayoutBatch: { periodKey: string | null; status: string | null; createdAt: string | null } | null;
    rewardAuditEventsInRange: number | null;
  };
  series: {
    bucket: 'hour' | 'day';
    points: SeriesPoint[];
    /** true si alguna serie superó el tope de filas leídas (la gráfica sería parcial). */
    truncated: boolean;
    available: boolean;
  };
  activity: ActivityEvent[];
  sources: Record<string, 'ok' | 'error'>;
};

const SERIES_ROW_CAP = 5000;

type CountResult = { count: number | null; error: { message: string } | null };
type RowsResult<T> = { data: T[] | null; count?: number | null; error: { message: string } | null };

async function count(q: PromiseLike<CountResult>): Promise<number | null> {
  try {
    const { count: c, error } = await q;
    if (error) return null;
    return c ?? 0;
  } catch {
    return null;
  }
}

async function rows<T>(q: PromiseLike<RowsResult<T>>): Promise<{ data: T[]; total: number | null } | null> {
  try {
    const { data, count: c, error } = await q;
    if (error) return null;
    return { data: data ?? [], total: c ?? null };
  } catch {
    return null;
  }
}

function between(
  supabase: SupabaseClient,
  table: string,
  column: string,
  start: string,
  end: string,
) {
  return supabase.from(table).select('id', { count: 'exact', head: true }).gte(column, start).lt(column, end);
}

async function rangeMetric(
  make: (start: string, end: string) => PromiseLike<CountResult>,
  r: ResolvedOwnerRange,
): Promise<RangeMetric> {
  const [value, previous] = await Promise.all([count(make(r.start, r.end)), count(make(r.prevStart, r.prevEnd))]);
  return { value, previous };
}

function botIds(): string[] {
  try {
    return loadBotIngestConfig('standard').botUserIdsForQuota;
  } catch {
    return [];
  }
}

async function distinctHumanAuthors(
  supabase: SupabaseClient,
  start: string,
  end: string,
  bots: string[],
): Promise<number | null> {
  const res = await rows<{ created_by: string | null }>(
    supabase
      .from('offers')
      .select('created_by', { count: 'exact' })
      .gte('created_at', start)
      .lt('created_at', end)
      .range(0, SERIES_ROW_CAP - 1),
  );
  if (!res) return null;
  if (res.total != null && res.total > res.data.length) return null;
  const set = new Set<string>();
  for (const row of res.data) {
    if (row.created_by && !bots.includes(row.created_by)) set.add(row.created_by);
  }
  return set.size;
}

function tally(list: { status: string | null }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of list) {
    const k = (r.status ?? 'null').toString();
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

async function buildSeries(
  supabase: SupabaseClient,
  r: ResolvedOwnerRange,
): Promise<OwnerCommandPayload['series']> {
  const [offers, outbound, profiles] = await Promise.all([
    rows<{ created_at: string }>(
      supabase
        .from('offers')
        .select('created_at', { count: 'exact' })
        .gte('created_at', r.start)
        .lt('created_at', r.end)
        .range(0, SERIES_ROW_CAP - 1),
    ),
    rows<{ created_at: string }>(
      supabase
        .from('offer_events')
        .select('created_at', { count: 'exact' })
        .eq('event_type', 'outbound')
        .gte('created_at', r.start)
        .lt('created_at', r.end)
        .range(0, SERIES_ROW_CAP - 1),
    ),
    rows<{ created_at: string }>(
      supabase
        .from('profiles')
        .select('created_at', { count: 'exact' })
        .gte('created_at', r.start)
        .lt('created_at', r.end)
        .range(0, SERIES_ROW_CAP - 1),
    ),
  ]);

  const points: SeriesPoint[] = Array.from({ length: r.bucketCount }, (_, i) => ({
    label: bucketLabel(r, i),
    offers: 0,
    outbound: 0,
    newUsers: 0,
  }));
  const fill = (res: { data: { created_at: string }[] } | null, key: 'offers' | 'outbound' | 'newUsers') => {
    if (!res) return;
    for (const row of res.data) {
      const idx = bucketIndex(r, row.created_at);
      if (idx >= 0) points[idx][key] += 1;
    }
  };
  fill(offers, 'offers');
  fill(outbound, 'outbound');
  fill(profiles, 'newUsers');

  const isTruncated = (res: { data: unknown[]; total: number | null } | null) =>
    res != null && res.total != null && res.total > res.data.length;

  return {
    bucket: r.bucket,
    points,
    truncated: isTruncated(offers) || isTruncated(outbound) || isTruncated(profiles),
    available: offers != null && outbound != null && profiles != null,
  };
}

const MOD_ACTION_LABEL: Record<string, string> = {
  approved: 'Oferta aprobada',
  rejected: 'Oferta rechazada',
  expired: 'Oferta expirada',
  deleted: 'Oferta eliminada',
};

async function buildActivity(supabase: SupabaseClient): Promise<{ events: ActivityEvent[]; ok: boolean }> {
  const [mod, offers, reports, runs, bans, integrity, queue] = await Promise.all([
    rows<{ id: string; action: string; created_at: string; new_status: string | null }>(
      supabase
        .from('moderation_logs')
        .select('id, action, created_at, new_status')
        .order('created_at', { ascending: false })
        .limit(8),
    ),
    rows<{ id: string; title: string | null; status: string | null; created_at: string }>(
      supabase
        .from('offers')
        .select('id, title, status, created_at')
        .order('created_at', { ascending: false })
        .limit(6),
    ),
    rows<{ id: string; report_type: string | null; created_at: string }>(
      supabase.from('offer_reports').select('id, report_type, created_at').order('created_at', { ascending: false }).limit(5),
    ),
    rows<{ id: string; status: string | null; source_id: string | null; finished_at: string | null; verified_deals: number | null; errors: number | null }>(
      supabase
        .from('hunter_supply_runs')
        .select('id, status, source_id, finished_at, verified_deals, errors')
        .not('finished_at', 'is', null)
        .order('finished_at', { ascending: false })
        .limit(6),
    ),
    rows<{ id: string; created_at: string }>(
      supabase.from('user_bans').select('id, created_at').order('created_at', { ascending: false }).limit(3),
    ),
    supabase.from('app_config').select('value').eq('key', 'system_integrity_last').maybeSingle(),
    rows<{ id: string; job_type: string | null; status: string | null; processed_at: string | null; created_at: string }>(
      supabase
        .from('write_jobs_queue')
        .select('id, job_type, status, processed_at, created_at')
        .eq('status', 'failed')
        .order('created_at', { ascending: false })
        .limit(3),
    ),
  ]);

  const events: ActivityEvent[] = [];
  for (const m of mod?.data ?? []) {
    events.push({
      id: `mod-${m.id}`,
      at: m.created_at,
      kind: 'moderation',
      title: MOD_ACTION_LABEL[m.action] ?? `Moderación: ${m.action}`,
      detail: m.new_status ? `Nuevo estado: ${m.new_status}` : null,
      tone: m.action === 'rejected' ? 'warn' : 'ok',
    });
  }
  for (const o of offers?.data ?? []) {
    events.push({
      id: `offer-${o.id}`,
      at: o.created_at,
      kind: 'offer',
      title: 'Oferta creada',
      detail: `${(o.title ?? 'Sin título').slice(0, 70)}${o.status ? ` · ${o.status}` : ''}`,
      tone: 'info',
    });
  }
  for (const rep of reports?.data ?? []) {
    events.push({
      id: `report-${rep.id}`,
      at: rep.created_at,
      kind: 'report',
      title: 'Reporte de comunidad',
      detail: rep.report_type ?? null,
      tone: 'warn',
    });
  }
  for (const run of runs?.data ?? []) {
    if (!run.finished_at) continue;
    events.push({
      id: `run-${run.id}`,
      at: run.finished_at,
      kind: 'hunter',
      title: `Hunter run · ${run.status ?? 'sin estado'}`,
      detail: `${run.source_id ?? 'fuente n/d'} · ${run.verified_deals ?? 0} verificadas${run.errors ? ` · ${run.errors} errores` : ''}`,
      tone: run.errors ? 'error' : run.status === 'ok' ? 'ok' : 'info',
    });
  }
  for (const b of bans?.data ?? []) {
    events.push({ id: `ban-${b.id}`, at: b.created_at, kind: 'ban', title: 'Usuario sancionado', detail: null, tone: 'warn' });
  }
  const integ = (integrity.data as { value?: { ok?: boolean; finishedAt?: string; summary?: { failed?: number } } } | null)?.value;
  if (integ?.finishedAt) {
    events.push({
      id: 'integrity-last',
      at: integ.finishedAt,
      kind: 'integrity',
      title: integ.ok ? 'Chequeo de integridad completado' : 'Chequeo de integridad con fallos',
      detail: integ.ok ? null : `${integ.summary?.failed ?? '?'} chequeo(s) fallidos`,
      tone: integ.ok ? 'ok' : 'error',
    });
  }
  for (const j of queue?.data ?? []) {
    events.push({
      id: `queue-${j.id}`,
      at: j.processed_at ?? j.created_at,
      kind: 'queue',
      title: 'Job de escritura fallido',
      detail: j.job_type ?? null,
      tone: 'error',
    });
  }

  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return { events: events.slice(0, 20), ok: mod != null || offers != null || runs != null };
}

export async function buildOwnerCommand(rangeKey: OwnerRangeKey, now: Date = new Date()): Promise<OwnerCommandPayload> {
  const supabase = createServerClient();
  const r = resolveOwnerRange(rangeKey, now);
  const nowIso = now.toISOString();
  const bots = botIds();

  const [
    offersCreated,
    votes,
    comments,
    favorites,
    reports,
    plazaRequests,
    plazaDiscussions,
    newUsers,
    views,
    outbound,
    approved,
    rejected,
    huntersNow,
    huntersPrev,
    activeUsers,
    totalProfiles,
    modLogs,
    pendingReports,
    activeBans,
    catalogPending,
    catalogLive,
    catalogExpired,
    catalogRejected,
    plazaPending,
    plazaApproved,
    hunterRuns,
    hunterLast,
    integrityRes,
    dsmLast,
    queuePending,
    queueFailed,
    queueOldest,
    rewards,
    intents,
    batch,
    auditEvents,
    series,
    activity,
  ] = await Promise.all([
    rangeMetric((s, e) => between(supabase, 'offers', 'created_at', s, e), r),
    rangeMetric((s, e) => between(supabase, 'offer_votes', 'created_at', s, e), r),
    rangeMetric((s, e) => between(supabase, 'comments', 'created_at', s, e), r),
    rangeMetric((s, e) => between(supabase, 'offer_favorites', 'created_at', s, e), r),
    rangeMetric((s, e) => between(supabase, 'offer_reports', 'created_at', s, e), r),
    rangeMetric((s, e) => between(supabase, 'plaza_requests', 'created_at', s, e), r),
    rangeMetric((s, e) => between(supabase, 'plaza_discussions', 'created_at', s, e), r),
    rangeMetric((s, e) => between(supabase, 'profiles', 'created_at', s, e), r),
    rangeMetric((s, e) => between(supabase, 'offer_events', 'created_at', s, e).eq('event_type', 'view'), r),
    rangeMetric((s, e) => between(supabase, 'offer_events', 'created_at', s, e).eq('event_type', 'outbound'), r),
    rangeMetric((s, e) => between(supabase, 'moderation_logs', 'created_at', s, e).eq('action', 'approved'), r),
    rangeMetric((s, e) => between(supabase, 'moderation_logs', 'created_at', s, e).eq('action', 'rejected'), r),
    distinctHumanAuthors(supabase, r.start, r.end, bots),
    distinctHumanAuthors(supabase, r.prevStart, r.prevEnd, bots),
    count(
      supabase
        .from('user_activity')
        .select('user_id', { count: 'exact', head: true })
        .gte('last_seen_at', r.start)
        .lt('last_seen_at', r.end),
    ),
    count(supabase.from('profiles').select('id', { count: 'exact', head: true })),
    rows<{ user_id: string | null }>(
      supabase
        .from('moderation_logs')
        .select('user_id', { count: 'exact' })
        .in('action', ['approved', 'rejected'])
        .gte('created_at', r.start)
        .lt('created_at', r.end)
        .range(0, SERIES_ROW_CAP - 1),
    ),
    count(supabase.from('offer_reports').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
    count(
      supabase
        .from('user_bans')
        .select('id', { count: 'exact', head: true })
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`),
    ),
    count(supabase.from('offers').select('id', { count: 'exact', head: true }).eq('status', 'pending').is('deleted_at', null)),
    count(
      supabase
        .from('offers')
        .select('id', { count: 'exact', head: true })
        .in('status', ['approved', 'published'])
        .is('deleted_at', null)
        .or(`expires_at.is.null,expires_at.gte.${nowIso}`),
    ),
    count(
      supabase
        .from('offers')
        .select('id', { count: 'exact', head: true })
        .in('status', ['approved', 'published'])
        .is('deleted_at', null)
        .lt('expires_at', nowIso),
    ),
    count(supabase.from('offers').select('id', { count: 'exact', head: true }).eq('status', 'rejected').is('deleted_at', null)),
    count(supabase.from('plaza_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
    count(supabase.from('plaza_requests').select('id', { count: 'exact', head: true }).eq('status', 'approved')),
    rows<{
      status: string | null;
      candidates_discovered: number | null;
      candidates_qualified: number | null;
      verified_deals: number | null;
      rejected: number | null;
      duplicates: number | null;
      errors: number | null;
      duration_ms: number | null;
    }>(
      supabase
        .from('hunter_supply_runs')
        .select(
          'status, candidates_discovered, candidates_qualified, verified_deals, rejected, duplicates, errors, duration_ms',
          { count: 'exact' },
        )
        .gte('finished_at', r.start)
        .lt('finished_at', r.end)
        .range(0, SERIES_ROW_CAP - 1),
    ),
    rows<{ finished_at: string | null; status: string | null; source_id: string | null }>(
      supabase
        .from('hunter_supply_runs')
        .select('finished_at, status, source_id')
        .not('finished_at', 'is', null)
        .order('finished_at', { ascending: false })
        .limit(1),
    ),
    supabase.from('app_config').select('value').eq('key', 'system_integrity_last').maybeSingle(),
    rows<{ date: string }>(supabase.from('daily_system_metrics').select('date').order('date', { ascending: false }).limit(1)),
    count(supabase.from('write_jobs_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
    count(supabase.from('write_jobs_queue').select('id', { count: 'exact', head: true }).eq('status', 'failed')),
    rows<{ created_at: string }>(
      supabase
        .from('write_jobs_queue')
        .select('created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1),
    ),
    rows<{ status: string | null }>(
      supabase.from('creator_rewards').select('status', { count: 'exact' }).range(0, SERIES_ROW_CAP - 1),
    ),
    rows<{ status: string | null }>(
      supabase.from('payout_intents').select('status', { count: 'exact' }).range(0, SERIES_ROW_CAP - 1),
    ),
    rows<{ period_key: string | null; status: string | null; created_at: string | null }>(
      supabase
        .from('payout_batches')
        .select('period_key, status, created_at')
        .order('created_at', { ascending: false })
        .limit(1),
    ),
    count(between(supabase, 'reward_audit_log', 'created_at', r.start, r.end)),
    buildSeries(supabase, r),
    buildActivity(supabase),
  ]);

  let activeModerators: number | null = null;
  if (modLogs && !(modLogs.total != null && modLogs.total > modLogs.data.length)) {
    activeModerators = new Set(modLogs.data.map((m) => m.user_id).filter((id): id is string => Boolean(id))).size;
  }

  let hunter: OwnerCommandPayload['hunter'] = {
    runs: null,
    runsOk: null,
    runsZero: null,
    runsSkipped: null,
    runsOther: null,
    discovered: null,
    qualified: null,
    verified: null,
    rejected: null,
    duplicates: null,
    errors: null,
    avgDurationMs: null,
    lastRunAt: null,
    lastRunStatus: null,
    lastRunSource: null,
  };
  if (hunterRuns) {
    const list = hunterRuns.data;
    const sum = (k: 'candidates_discovered' | 'candidates_qualified' | 'verified_deals' | 'rejected' | 'duplicates' | 'errors') =>
      list.reduce((acc, row) => acc + (Number(row[k]) || 0), 0);
    const durations = list.map((row) => Number(row.duration_ms)).filter((d) => Number.isFinite(d) && d > 0);
    const statuses = tally(list);
    hunter = {
      ...hunter,
      runs: list.length,
      runsOk: statuses.ok ?? 0,
      runsZero: statuses.zero ?? 0,
      runsSkipped: statuses.skipped ?? 0,
      runsOther: list.length - (statuses.ok ?? 0) - (statuses.zero ?? 0) - (statuses.skipped ?? 0),
      discovered: sum('candidates_discovered'),
      qualified: sum('candidates_qualified'),
      verified: sum('verified_deals'),
      rejected: sum('rejected'),
      duplicates: sum('duplicates'),
      errors: sum('errors'),
      avgDurationMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    };
  }
  const last = hunterLast?.data[0];
  if (last) {
    hunter.lastRunAt = last.finished_at;
    hunter.lastRunStatus = last.status;
    hunter.lastRunSource = last.source_id;
  }

  const integ = (integrityRes.data as { value?: { ok?: boolean; finishedAt?: string; summary?: { failed?: number } } } | null)?.value;

  const fullTally = (res: { data: { status: string | null }[]; total: number | null } | null) =>
    res && !(res.total != null && res.total > res.data.length) ? tally(res.data) : null;

  const sources: Record<string, 'ok' | 'error'> = {
    community: offersCreated.value != null ? 'ok' : 'error',
    users: newUsers.value != null ? 'ok' : 'error',
    traffic: views.value != null && outbound.value != null ? 'ok' : 'error',
    moderation: approved.value != null ? 'ok' : 'error',
    catalog: catalogPending != null && catalogLive != null ? 'ok' : 'error',
    hunter: hunterRuns != null ? 'ok' : 'error',
    operations: integrityRes.error ? 'error' : 'ok',
    finance: rewards != null || intents != null ? 'ok' : 'error',
    activity: activity.ok ? 'ok' : 'error',
  };

  return {
    generatedAt: nowIso,
    range: {
      key: r.key,
      label: r.label,
      start: r.start,
      end: r.end,
      prevStart: r.prevStart,
      prevEnd: r.prevEnd,
      prevLabel: r.prevLabel,
      bucket: r.bucket,
    },
    community: {
      offersCreated,
      votes,
      comments,
      favorites,
      reports,
      activeHunters: { value: huntersNow, previous: huntersPrev },
      plazaRequests,
      plazaDiscussions,
    },
    users: { newUsers, activeUsers, totalProfiles },
    traffic: { views, outbound },
    moderation: { approved, rejected, activeModerators, pendingReports, activeBans },
    catalog: { pending: catalogPending, live: catalogLive, expired: catalogExpired, rejected: catalogRejected },
    plaza: { pendingRequests: plazaPending, approvedRequests: plazaApproved },
    hunter,
    operations: {
      integrityFinishedAt: integ?.finishedAt ?? null,
      integrityOk: typeof integ?.ok === 'boolean' ? integ.ok : null,
      integrityFailed: integ?.summary?.failed ?? null,
      dailyMetricsLastDate: dsmLast?.data[0]?.date ?? null,
      queuePending,
      queueFailed,
      queueOldestPendingAt: queueOldest?.data[0]?.created_at ?? null,
    },
    finance: {
      moneyPathFrozen: isMoneyPathFrozen(),
      rewardsByStatus: fullTally(rewards),
      payoutIntentsByStatus: fullTally(intents),
      latestPayoutBatch: batch
        ? batch.data[0]
          ? {
              periodKey: batch.data[0].period_key,
              status: batch.data[0].status,
              createdAt: batch.data[0].created_at,
            }
          : { periodKey: null, status: null, createdAt: null }
        : null,
      rewardAuditEventsInRange: auditEvents,
    },
    series,
    activity: activity.events,
    sources,
  };
}
