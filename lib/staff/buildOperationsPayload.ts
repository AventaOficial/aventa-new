import { createServerClient } from '@/lib/supabase/server';
import type { Role } from '@/lib/admin/roles';
import { getHealthSnapshot, type HealthSnapshot } from '@/lib/monitoring/healthCheck';
import { runSystemsAreasPulse, type SystemsAreasPulseResult } from '@/lib/monitoring/systemAreasPulse';
import { fetchOfferHealthSummary, type OfferHealthSummary } from '@/lib/offers/offerHealthSummary';
import { getWriteQueueBacklog } from '@/lib/server/writeQueue';
import { staffTasksConfigKey } from '@/lib/staff/departments';
import { fetchStaffPulse, type StaffPulse } from '@/lib/staff/buildStaffPulse';
import {
  parseStaffWorkBoard,
  seedDefaultTasks,
  taskCompletionPct,
  type StaffWorkBoard,
} from '@/lib/staff/workBoard';
import { canOperationsMetrics } from '@/lib/staff/requireOperationsStaff';
import { healthQueuePath } from '@/lib/staff/equipoAccess';

export type IntegritySnapshot = {
  ok: boolean;
  finishedAt: string | null;
  failed: number;
  passed: number;
  checks: Array<{ name: string; ok: boolean; detail: string }>;
};

export type OperationsAlert = {
  id: string;
  label: string;
  detail: string;
  count: number;
  href: string;
  tone: 'critical' | 'attention' | 'info';
};

export type OperationsProductMetrics = {
  new_users_today: number;
  active_users_24h: number;
  retention_48h_pct: number | null;
  growth_weekly_pct: number | null;
};

export type OperationsDailyMetric = {
  date: string;
  total_offers_created: number;
  total_votes: number;
  total_views: number;
  total_outbound: number;
  ctr: number | null;
};

export type OperationsPayload = {
  generatedAt: string;
  greeting: string;
  role: Role;
  canMetrics: boolean;
  board: StaffWorkBoard;
  taskPct: number;
  health: HealthSnapshot;
  areasPulse: SystemsAreasPulseResult;
  integrity: IntegritySnapshot | null;
  queue: { pending: number; failed: number };
  offerHealth: OfferHealthSummary;
  pulse: StaffPulse;
  alerts: OperationsAlert[];
  productMetrics: OperationsProductMetrics | null;
  dailyMetrics: OperationsDailyMetric[];
};

function greeting(displayName: string | null): string {
  const name = displayName?.trim() || 'equipo';
  const hour = new Date().getHours();
  const time = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  return `${time}, ${name}. Estado operativo de AVENTA en tiempo real.`;
}

async function loadBoard(): Promise<StaffWorkBoard> {
  const supabase = createServerClient();
  const key = staffTasksConfigKey('operaciones');
  const { data } = await supabase.from('app_config').select('value').eq('key', key).maybeSingle();
  let board = parseStaffWorkBoard(data?.value, 'operaciones');
  if (board.tasks.length === 0) board = { ...board, tasks: seedDefaultTasks('operaciones') };
  return board;
}

async function loadIntegrity(): Promise<IntegritySnapshot | null> {
  const supabase = createServerClient();
  const { data } = await supabase.from('app_config').select('value').eq('key', 'system_integrity_last').maybeSingle();
  const value = (data as { value?: Record<string, unknown> } | null)?.value;
  if (!value || typeof value !== 'object') return null;

  const checks = Array.isArray(value.checks)
    ? (value.checks as Array<{ name?: string; ok?: boolean; detail?: string }>).map((c) => ({
        name: String(c.name ?? 'check'),
        ok: Boolean(c.ok),
        detail: String(c.detail ?? ''),
      }))
    : [];

  const summary = (value.summary as { failed?: number; passed?: number } | undefined) ?? {};

  return {
    ok: Boolean(value.ok),
    finishedAt: typeof value.finishedAt === 'string' ? value.finishedAt : null,
    failed: summary.failed ?? checks.filter((c) => !c.ok).length,
    passed: summary.passed ?? checks.filter((c) => c.ok).length,
    checks,
  };
}

function buildAlerts(
  role: Role,
  pulse: StaffPulse,
  offerHealth: OfferHealthSummary,
  integrity: IntegritySnapshot | null,
  queue: { pending: number; failed: number },
  health: HealthSnapshot,
): OperationsAlert[] {
  const alerts: OperationsAlert[] = [];

  if (health.status !== 'ok') {
    alerts.push({
      id: 'health',
      label: 'Salud del sitio',
      detail: health.message ?? `Estado: ${health.status}`,
      count: 1,
      href: '/equipo/operaciones/salud',
      tone: health.status === 'error' ? 'critical' : 'attention',
    });
  }

  if (integrity && !integrity.ok) {
    alerts.push({
      id: 'integrity',
      label: 'Integridad del sistema',
      detail: `${integrity.failed} chequeo(s) fallaron en el último cron.`,
      count: integrity.failed,
      href: '/equipo/operaciones/salud',
      tone: 'critical',
    });
  }

  if (queue.failed > 0) {
    alerts.push({
      id: 'queue-failed',
      label: 'Cola de escritura',
      detail: 'Jobs fallidos en write_jobs_queue.',
      count: queue.failed,
      href: '/equipo/operaciones/salud',
      tone: 'critical',
    });
  } else if (queue.pending > 200) {
    alerts.push({
      id: 'queue-pending',
      label: 'Cola de escritura',
      detail: 'Backlog alto de eventos pendientes.',
      count: queue.pending,
      href: '/equipo/operaciones/salud',
      tone: 'attention',
    });
  }

  if (pulse.priceChanged > 0) {
    alerts.push({
      id: 'price-changed',
      label: 'Precio cambiado',
      detail: 'Ofertas con precio distinto al publicado.',
      count: pulse.priceChanged,
      href: healthQueuePath(role, 'precio'),
      tone: 'attention',
    });
  }

  if (pulse.outOfStock > 0) {
    alerts.push({
      id: 'out-of-stock',
      label: 'Agotadas',
      detail: 'Ofertas sin stock detectadas.',
      count: pulse.outOfStock,
      href: healthQueuePath(role, 'agotadas'),
      tone: 'attention',
    });
  }

  if (offerHealth.activeWithoutCheck > 10) {
    alerts.push({
      id: 'unchecked',
      label: 'Sin verificar',
      detail: 'Ofertas activas aún no escaneadas por health cron.',
      count: offerHealth.activeWithoutCheck,
      href: '/equipo/operaciones/ofertas',
      tone: 'info',
    });
  }

  return alerts.sort((a, b) => {
    const rank = { critical: 0, attention: 1, info: 2 };
    return rank[a.tone] - rank[b.tone];
  });
}

async function loadProductMetrics(): Promise<OperationsProductMetrics> {
  const supabase = createServerClient();
  const now = new Date();
  const tz = 'America/Mexico_City';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const d = parts.find((p) => p.type === 'day')!.value;
  const todayStart = new Date(`${y}-${m}-${d}T06:00:00.000Z`).toISOString();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const [{ count: newUsersToday }, activeRes, growthRes] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
    supabase.from('user_activity').select('user_id', { count: 'exact', head: true }).gte('last_seen_at', last24h),
    Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo.toISOString()),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', fourteenDaysAgo.toISOString()).lt('created_at', sevenDaysAgo.toISOString()),
    ]),
  ]);

  const [currentWindow, previousWindow] = growthRes;
  const current = currentWindow.count ?? 0;
  const previous = previousWindow.count ?? 0;

  return {
    new_users_today: newUsersToday ?? 0,
    active_users_24h: activeRes.error ? 0 : activeRes.count ?? 0,
    retention_48h_pct: null,
    growth_weekly_pct: Math.round((((current - previous) / Math.max(previous, 1)) * 100) * 100) / 100,
  };
}

async function loadDailyMetrics(): Promise<OperationsDailyMetric[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('daily_system_metrics')
    .select('date, total_offers_created, total_votes, total_views, total_outbound, ctr')
    .order('date', { ascending: false })
    .limit(14);

  if (error) return [];
  return (data ?? []) as OperationsDailyMetric[];
}

export async function buildOperationsPayload(role: Role, displayName: string | null): Promise<OperationsPayload> {
  const canMetrics = canOperationsMetrics(role);
  const board = await loadBoard();

  const [health, areasPulse, offerHealth, pulse, integrity, queue, productMetrics, dailyMetrics] = await Promise.all([
    getHealthSnapshot(),
    runSystemsAreasPulse(),
    fetchOfferHealthSummary(),
    fetchStaffPulse(),
    loadIntegrity(),
    getWriteQueueBacklog(),
    canMetrics ? loadProductMetrics() : Promise.resolve(null),
    canMetrics ? loadDailyMetrics() : Promise.resolve([]),
  ]);

  const alerts = buildAlerts(role, pulse, offerHealth, integrity, queue, health);

  return {
    generatedAt: new Date().toISOString(),
    greeting: greeting(displayName),
    role,
    canMetrics,
    board,
    taskPct: taskCompletionPct(board.tasks),
    health,
    areasPulse,
    integrity,
    queue,
    offerHealth,
    pulse,
    alerts,
    productMetrics,
    dailyMetrics,
  };
}
