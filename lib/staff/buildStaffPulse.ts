import { createServerClient } from '@/lib/supabase/server';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import { fetchOfferHealthSummary } from '@/lib/offers/offerHealthSummary';
import { isCommissionProgramPubliclyActive } from '@/lib/commissions/programStatus';
import { startOfDayUtc } from '@/lib/owner/mxTime';
import {
  TEAM_DAILY_LIVE_TARGET,
  queueTone,
  type StaffQueueItem,
} from '@/lib/staff/workBoard';
import type { Role } from '@/lib/admin/roles';
import { canAccessGerencia } from '@/lib/staff/permissions';
import { healthQueueDepartment, healthQueuePath } from '@/lib/staff/equipoAccess';

export type StaffPulse = {
  pendingBot: number;
  pendingHuman: number;
  pendingTotal: number;
  pendingReports: number;
  approvedToday: number;
  liveActive: number;
  priceChanged: number;
  outOfStock: number;
  payoutsPending: number;
  healthTableAvailable: boolean;
  commissionsPublic: boolean;
};

function isMissingTable(message: string, table: string): boolean {
  const m = message.toLowerCase();
  return m.includes(table.toLowerCase()) || m.includes('does not exist') || m.includes('schema cache');
}

export async function fetchStaffPulse(): Promise<StaffPulse> {
  const supabase = createServerClient();
  const generatedAt = new Date().toISOString();
  const todayStart = startOfDayUtc();
  const botIds = loadBotIngestConfig('standard').botUserIdsForQuota;

  const [pendingRes, reportsRes, approvedTodayRes, liveRes, health, payoutsRes] = await Promise.all([
    supabase
      .from('offers')
      .select('id, created_by, moderator_comment, description')
      .eq('status', 'pending')
      .is('deleted_at', null),
    supabase
      .from('offer_reports')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('moderation_logs')
      .select('offer_id', { count: 'exact', head: true })
      .eq('action', 'approved')
      .gte('created_at', todayStart),
    supabase
      .from('offers')
      .select('id', { count: 'exact', head: true })
      .in('status', ['approved', 'published'])
      .is('deleted_at', null)
      .or(`expires_at.is.null,expires_at.gte.${generatedAt}`),
    fetchOfferHealthSummary(),
    supabase
      .from('commission_allocations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
  ]);

  let pendingBot = 0;
  let pendingHuman = 0;
  for (const row of pendingRes.data ?? []) {
    const createdBy = (row as { created_by?: string | null }).created_by;
    const comment = ((row as { moderator_comment?: string | null }).moderator_comment ?? '').toLowerCase();
    const desc = ((row as { description?: string | null }).description ?? '').toLowerCase();
    const isBot =
      (createdBy && botIds.includes(createdBy)) ||
      comment.includes('[bot-ingest') ||
      desc.includes('ingesta automática (bot)');
    if (isBot) pendingBot += 1;
    else pendingHuman += 1;
  }

  const payoutsPending =
    payoutsRes.error && isMissingTable(payoutsRes.error.message ?? '', 'commission_allocations')
      ? 0
      : payoutsRes.error
        ? 0
        : payoutsRes.count ?? 0;

  return {
    pendingBot,
    pendingHuman,
    pendingTotal: pendingBot + pendingHuman,
    pendingReports: reportsRes.error ? 0 : reportsRes.count ?? 0,
    approvedToday: approvedTodayRes.error ? 0 : approvedTodayRes.count ?? 0,
    liveActive: liveRes.error ? 0 : liveRes.count ?? 0,
    priceChanged: health.priceChanged,
    outOfStock: health.outOfStock,
    payoutsPending,
    healthTableAvailable: health.tableAvailable,
    commissionsPublic: isCommissionProgramPubliclyActive(),
  };
}

export function buildStaffQueue(role: Role, pulse: StaffPulse): StaffQueueItem[] {
  const canGerencia = canAccessGerencia(role);

  const queue: StaffQueueItem[] = [
    {
      id: 'pending-bot',
      label: 'Cola del bot',
      detail: 'Publicar / no publicar. Nada de relleno.',
      count: pulse.pendingBot,
      tone: queueTone(pulse.pendingBot, 'pending-bot'),
      href: '/equipo/moderacion/bot',
      department: 'moderacion',
    },
    {
      id: 'pending-human',
      label: 'Ofertas de cazadores',
      detail: 'Subidas por usuarios. Revisar enlace y precio.',
      count: pulse.pendingHuman,
      tone: queueTone(pulse.pendingHuman, 'pending-human'),
      href: '/equipo/moderacion/cazadores',
      department: 'moderacion',
    },
    {
      id: 'reports',
      label: 'Reportes abiertos',
      detail: 'La comunidad marcó un problema.',
      count: pulse.pendingReports,
      tone: queueTone(pulse.pendingReports, 'reports'),
      href: '/equipo/moderacion/reportes',
      department: 'moderacion',
    },
    {
      id: 'live-today',
      label: 'Aprobadas hoy',
      detail: `Meta del equipo: ${TEAM_DAILY_LIVE_TARGET} (calidad, no volumen).`,
      count: pulse.approvedToday,
      tone: queueTone(pulse.approvedToday, 'live-today'),
      href: '/equipo/moderacion/aprobadas',
      department: 'moderacion',
    },
    {
      id: 'price-changed',
      label: 'Precio cambió',
      detail: pulse.healthTableAvailable
        ? 'Verificar en tienda y bajar si ya no aplica.'
        : 'Falta migración de salud en Supabase.',
      count: pulse.priceChanged,
      tone: queueTone(pulse.priceChanged, 'price-changed'),
      href: healthQueuePath(role, 'precio'),
      department: healthQueueDepartment(role),
    },
    {
      id: 'out-of-stock',
      label: 'Agotadas',
      detail: 'No dejarlas vivas en el feed.',
      count: pulse.outOfStock,
      tone: queueTone(pulse.outOfStock, 'out-of-stock'),
      href: healthQueuePath(role, 'agotadas'),
      department: healthQueueDepartment(role),
    },
  ];

  if (canGerencia || role === 'owner') {
    queue.push({
      id: 'payouts',
      label: 'Pagos a creadores',
      detail: pulse.commissionsPublic
        ? 'Asignaciones pendientes de marcar como pagadas.'
        : 'Programa apagado hasta primer peso real de afiliado.',
      count: pulse.payoutsPending,
      tone: queueTone(pulse.payoutsPending, 'payouts'),
      href: role === 'owner' ? '/admin/commissions' : '/equipo/contabilidad',
      department: 'contabilidad',
    });
  }

  return queue;
}
