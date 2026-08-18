import { createServerClient } from '@/lib/supabase/server';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import { fetchOfferHealthSummary } from '@/lib/offers/offerHealthSummary';
import { isCommissionProgramPubliclyActive } from '@/lib/commissions/programStatus';
import { startOfDayUtc } from '@/lib/owner/mxTime';
import type { Role } from '@/lib/admin/roles';
import { canAccessHealth, canAccessOwnerOperationsPanel } from '@/lib/admin/roles';
import {
  TEAM_WORK_BOARD_KEY,
  TEAM_DAILY_LIVE_TARGET,
  TEAM_DAILY_QUALITY_TARGET,
  parseTeamWorkBoard,
  seedDefaultTasks,
  discountPercent,
  isFilmWorthyOffer,
  queueTone,
  type TeamFilmCandidate,
  type TeamQueueItem,
  type TeamWorkBoard,
} from '@/lib/admin/teamBoard';

export type TeamBoardPayload = {
  generatedAt: string;
  board: TeamWorkBoard;
  seededTasks: boolean;
  commissionsPublic: boolean;
  pulse: {
    pendingBot: number;
    pendingHuman: number;
    pendingReports: number;
    approvedToday: number;
    liveActive: number;
    priceChanged: number;
    outOfStock: number;
    payoutsPending: number;
    healthTableAvailable: boolean;
  };
  queue: TeamQueueItem[];
  film: TeamFilmCandidate[];
  targets: { liveToday: number; qualityToday: number };
};

function isMissingTable(message: string, table: string): boolean {
  const m = message.toLowerCase();
  return m.includes(table.toLowerCase()) || m.includes('does not exist') || m.includes('schema cache');
}

export async function buildTeamBoardPayload(role: Role): Promise<TeamBoardPayload> {
  const supabase = createServerClient();
  const generatedAt = new Date().toISOString();
  const todayStart = startOfDayUtc();
  const botIds = loadBotIngestConfig('standard').botUserIdsForQuota;

  const pendingSelect = supabase
    .from('offers')
    .select('id, created_by, moderator_comment, description')
    .eq('status', 'pending')
    .is('deleted_at', null);

  const [
    pendingRes,
    reportsRes,
    approvedTodayRes,
    liveRes,
    health,
    payoutsRes,
    boardRes,
    filmRes,
  ] = await Promise.all([
    pendingSelect,
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
    supabase.from('app_config').select('value').eq('key', TEAM_WORK_BOARD_KEY).maybeSingle(),
    supabase
      .from('offers')
      .select('id, title, store, price, original_price, image_url, offer_url, created_at')
      .in('status', ['approved', 'published'])
      .is('deleted_at', null)
      .or(`expires_at.is.null,expires_at.gte.${generatedAt}`)
      .order('created_at', { ascending: false })
      .limit(40),
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

  const pendingReports = reportsRes.error ? 0 : reportsRes.count ?? 0;
  const approvedToday = approvedTodayRes.error ? 0 : approvedTodayRes.count ?? 0;
  const liveActive = liveRes.error ? 0 : liveRes.count ?? 0;
  const payoutsPending =
    payoutsRes.error && isMissingTable(payoutsRes.error.message ?? '', 'commission_allocations')
      ? 0
      : payoutsRes.error
        ? 0
        : payoutsRes.count ?? 0;

  let board = parseTeamWorkBoard(boardRes.data?.value);
  let seededTasks = false;
  if (board.tasks.length === 0) {
    board = { ...board, department: 'moderacion', tasks: seedDefaultTasks('moderacion', generatedAt) };
    seededTasks = true;
  }

  const film: TeamFilmCandidate[] = [];
  for (const row of filmRes.data ?? []) {
    const price = Number((row as { price?: number }).price ?? 0);
    const originalPriceRaw = (row as { original_price?: number | null }).original_price;
    const originalPrice = originalPriceRaw == null ? null : Number(originalPriceRaw);
    const title = String((row as { title?: string }).title ?? '');
    const offerUrl = String((row as { offer_url?: string }).offer_url ?? '');
    if (!isFilmWorthyOffer({ price, originalPrice, title, offerUrl })) continue;
    film.push({
      id: String((row as { id: string }).id),
      title,
      store: String((row as { store?: string }).store ?? ''),
      price,
      originalPrice,
      discountPercent: discountPercent(price, originalPrice),
      imageUrl: (row as { image_url?: string | null }).image_url ?? null,
      offerUrl,
      createdAt: String((row as { created_at?: string }).created_at ?? generatedAt),
    });
    if (film.length >= 8) break;
  }

  const queue: TeamQueueItem[] = [
    {
      id: 'pending-bot',
      label: 'Cola del bot',
      detail: 'Publicar / no publicar. Nada de relleno.',
      count: pendingBot,
      tone: queueTone(pendingBot, 'pending-bot'),
      href: '/admin/moderation',
    },
    {
      id: 'pending-human',
      label: 'Ofertas de cazadores',
      detail: 'Subidas por usuarios. Revisar enlace y precio.',
      count: pendingHuman,
      tone: queueTone(pendingHuman, 'pending-human'),
      href: '/admin/moderation',
    },
    {
      id: 'reports',
      label: 'Reportes abiertos',
      detail: 'La comunidad marcó un problema.',
      count: pendingReports,
      tone: queueTone(pendingReports, 'reports'),
      href: '/admin/moderation/reports',
    },
    {
      id: 'live-today',
      label: 'Aprobadas hoy',
      detail: `Meta del equipo: ${TEAM_DAILY_LIVE_TARGET} (calidad, no volumen).`,
      count: approvedToday,
      tone: queueTone(approvedToday, 'live-today'),
      href: '/admin/moderation/approved',
    },
    {
      id: 'price-changed',
      label: 'Precio cambió',
      detail: health.tableAvailable ? 'Verificar en tienda y bajar si ya no aplica.' : 'Falta migración de salud.',
      count: health.priceChanged,
      tone: queueTone(health.priceChanged, 'price-changed'),
      href: canAccessHealth(role) ? '/admin/health' : '/admin/moderation',
    },
    {
      id: 'out-of-stock',
      label: 'Agotadas',
      detail: 'No dejarlas vivas en el feed.',
      count: health.outOfStock,
      tone: queueTone(health.outOfStock, 'out-of-stock'),
      href: canAccessHealth(role) ? '/admin/health' : '/admin/moderation',
    },
  ];

  if (canAccessOwnerOperationsPanel(role)) {
    queue.push({
      id: 'payouts',
      label: 'Pagos a creadores',
      detail: isCommissionProgramPubliclyActive()
        ? 'Asignaciones pendientes de marcar como pagadas.'
        : 'Programa aún apagado. Infra lista; no hay que pagar todavía.',
      count: payoutsPending,
      tone: queueTone(payoutsPending, 'payouts'),
      href: '/admin/commissions',
    });
  }

  return {
    generatedAt,
    board,
    seededTasks,
    commissionsPublic: isCommissionProgramPubliclyActive(),
    pulse: {
      pendingBot,
      pendingHuman,
      pendingReports,
      approvedToday,
      liveActive,
      priceChanged: health.priceChanged,
      outOfStock: health.outOfStock,
      payoutsPending,
      healthTableAvailable: health.tableAvailable,
    },
    queue,
    film,
    targets: { liveToday: TEAM_DAILY_LIVE_TARGET, qualityToday: TEAM_DAILY_QUALITY_TARGET },
  };
}
