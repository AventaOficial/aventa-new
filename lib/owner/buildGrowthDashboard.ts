import { createServerClient } from '@/lib/supabase/server';
import { getWriteQueueBacklog } from '@/lib/server/writeQueue';
import {
  GROWTH_ROADMAP,
  INFRA_COST_TIERS,
  computeBillingTotals,
  buildPrelaunchChecklist,
  resolveGrowthStage,
  type BillingTotals,
  type PrelaunchItem,
  type GrowthStageId,
} from '@/lib/owner/growthModel';
import { feedCacheMeta } from '@/lib/server/feedCache';
import { OWNER_DASHBOARD_TZ } from '@/lib/owner/mxTime';

export type TrafficLight = 'green' | 'yellow' | 'red';

export type GrowthInfraRow = {
  id: string;
  name: string;
  status: TrafficLight;
  statusLabel: string;
  aventaPlan: string;
  usageSnapshot: string;
  listPriceLabel: string;
  currentMonthlyUsd: number;
  currentMonthlyMxn: number;
  nextTierLabel: string;
  nextTierMonthlyUsd: number;
  freeLimitNote: string;
  upgradeWhen: string[];
  panelUrl: string;
  pricingUrl: string;
  configured: boolean;
  billingNote?: string;
};

export type GrowthDashboardPayload = {
  generatedAt: string;
  timezone: string;
  aspiration: {
    targetLabel: string;
    totalUsers: number;
    progressToMillionPct: number;
    currentStageId: GrowthStageId;
    currentStageLabel: string;
    currentHeadline: string;
    currentFocus: string;
    nextStageLabel: string | null;
    progressToNextPct: number | null;
  };
  users: {
    total: number;
    newToday: number;
    new7d: number;
    new30d: number;
    active24h: number;
    growthWeeklyPct: number | null;
    retention48hPct: number | null;
  };
  content: {
    offersTotal: number;
    offersApproved: number;
    moderationPending: number;
  };
  operations: {
    writeQueuePending: number;
    writeQueueFailed: number;
    upstashConfigured: boolean;
    feedCacheEnabled: boolean;
    feedCacheTtlSeconds: number;
    eventWriteMode: string;
  };
  prelaunch: PrelaunchItem[];
  infrastructure: GrowthInfraRow[];
  billing: BillingTotals;
  roadmap: typeof GROWTH_ROADMAP;
  nextActions: Array<{ id: string; priority: TrafficLight; title: string; detail: string; href?: string }>;
  docsRefs: string[];
};

function hasEnv(key: string): boolean {
  const v = process.env[key];
  return typeof v === 'string' && v.trim().length > 0;
}

function infraStatus(id: string, configured: boolean): { status: TrafficLight; label: string } {
  if (!configured) return { status: 'red', label: 'Falta configurar' };
  if (id === 'upstash') return { status: 'green', label: 'Conectado' };
  if (id === 'supabase') return { status: 'green', label: 'Conectado' };
  return { status: 'yellow', label: 'Revisar panel' };
}

export async function buildGrowthDashboard(): Promise<GrowthDashboardPayload> {
  const supabase = createServerClient();
  const now = new Date();
  const tz = OWNER_DASHBOARD_TZ;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const d = parts.find((p) => p.type === 'day')!.value;
  const todayStart = new Date(`${y}-${m}-${d}T06:00:00.000Z`).toISOString();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

  const [
    totalUsersRes,
    newTodayRes,
    new7dRes,
    new30dRes,
    offersTotalRes,
    offersApprovedRes,
    pendingModRes,
    queueBacklog,
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgo),
    supabase.from('offers').select('id', { count: 'exact', head: true }),
    supabase
      .from('offers')
      .select('id', { count: 'exact', head: true })
      .or('status.eq.approved,status.eq.published'),
    supabase.from('offers').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    getWriteQueueBacklog(),
  ]);

  const totalUsers = totalUsersRes.count ?? 0;
  const stage = resolveGrowthStage(totalUsers);

  let active24h = 0;
  try {
    const { count } = await supabase
      .from('user_activity')
      .select('user_id', { count: 'exact', head: true })
      .gte('last_seen_at', last24h);
    active24h = count ?? 0;
  } catch {
    active24h = 0;
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
      return last - first >= 5 * 60 * 1000 && last <= first + 48 * 60 * 60 * 1000;
    });
    retention48hPct = cohort.length > 0 ? Math.round((returned.length / cohort.length) * 10000) / 100 : null;
  } catch {
    retention48hPct = null;
  }

  const upstashOk = hasEnv('UPSTASH_REDIS_REST_URL') && hasEnv('UPSTASH_REDIS_REST_TOKEN');
  const eventWriteMode = (process.env.EVENT_WRITE_MODE ?? 'adaptive').trim().toLowerCase();
  const feedCache = feedCacheMeta();

  const billing = computeBillingTotals();

  const prelaunch = buildPrelaunchChecklist({
    feedCacheRedis: feedCache.enabled && feedCache.redis,
    upstashConfigured: upstashOk,
  });

  const infrastructure: GrowthInfraRow[] = INFRA_COST_TIERS.map((tier) => {
    const configured =
      tier.envKeys.length === 0 ? true : tier.envKeys.every((k) => hasEnv(k));
    const { status, label } = infraStatus(tier.id, configured);
    return {
      id: tier.id,
      name: tier.name,
      status,
      statusLabel: label,
      aventaPlan: tier.aventaPlan,
      usageSnapshot: tier.usageSnapshot,
      listPriceLabel: tier.listPriceLabel,
      currentMonthlyUsd: tier.currentMonthlyUsd,
      currentMonthlyMxn: Math.round(tier.currentMonthlyUsd * billing.fxUsdMxn),
      nextTierLabel: tier.nextTierLabel,
      nextTierMonthlyUsd: tier.nextTierMonthlyUsd,
      freeLimitNote: tier.freeLimitNote,
      upgradeWhen: tier.upgradeWhen,
      panelUrl: tier.panelUrl,
      pricingUrl: tier.pricingUrl,
      configured,
      billingNote: tier.billingNote,
    };
  });

  const nextActions: GrowthDashboardPayload['nextActions'] = [];

  if (!upstashOk) {
    nextActions.push({
      id: 'upstash',
      priority: 'red',
      title: 'Configura Upstash en Vercel',
      detail: 'Sin UPSTASH_* el rate limit no es global entre instancias.',
      href: '/admin/infraestructura',
    });
  }

  if (queueBacklog.pending > 50 || queueBacklog.failed > 5) {
    nextActions.push({
      id: 'queue',
      priority: queueBacklog.failed > 20 ? 'red' : 'yellow',
      title: 'Revisa la cola de escritura',
      detail: `${queueBacklog.pending} pendientes · ${queueBacklog.failed} fallidos`,
      href: '/admin/operaciones',
    });
  }

  if (stage.current.id === 'growth' || stage.current.id === 'scale') {
    nextActions.push({
      id: 'stress',
      priority: 'yellow',
      title: 'Ejecuta stress test antes del siguiente salto',
      detail: 'Ver docs/PLAN_STRESS_TEST_10K_50K.md — escenario D para 50k MAU.',
    });
  }

  if ((pendingModRes.count ?? 0) >= 15) {
    nextActions.push({
      id: 'mod',
      priority: 'yellow',
      title: 'Cola de moderación alta',
      detail: `${pendingModRes.count ?? 0} ofertas pendientes — revisa antes de escalar tráfico.`,
      href: '/admin/moderation',
    });
  }

  if (nextActions.length === 0) {
    nextActions.push({
      id: 'ok',
      priority: 'green',
      title: 'Sigue la hoja de ruta de tu etapa',
      detail: stage.current.focus,
    });
  }

  return {
    generatedAt: now.toISOString(),
    timezone: tz,
    aspiration: {
      targetLabel: '1 millón de usuarios',
      totalUsers,
      progressToMillionPct: stage.progressToMillionPct,
      currentStageId: stage.current.id,
      currentStageLabel: stage.current.label,
      currentHeadline: stage.current.headline,
      currentFocus: stage.current.focus,
      nextStageLabel: stage.next?.label ?? null,
      progressToNextPct: stage.progressToNextPct,
    },
    users: {
      total: totalUsers,
      newToday: newTodayRes.count ?? 0,
      new7d: new7dRes.count ?? 0,
      new30d: new30dRes.count ?? 0,
      active24h,
      growthWeeklyPct,
      retention48hPct,
    },
    content: {
      offersTotal: offersTotalRes.count ?? 0,
      offersApproved: offersApprovedRes.count ?? 0,
      moderationPending: pendingModRes.count ?? 0,
    },
    operations: {
      writeQueuePending: queueBacklog.pending,
      writeQueueFailed: queueBacklog.failed,
      upstashConfigured: upstashOk,
      feedCacheEnabled: feedCache.enabled && feedCache.redis,
      feedCacheTtlSeconds: feedCache.ttlSeconds,
      eventWriteMode,
    },
    prelaunch,
    infrastructure,
    billing,
    roadmap: GROWTH_ROADMAP,
    nextActions,
    docsRefs: [
      'docs/PLAN_ESCALADO_10K_A_50K.md',
      'docs/PLAN_STRESS_TEST_10K_50K.md',
      'docs/SISTEMAS_AVENTA.md',
    ],
  };
}
