import { createServerClient } from '@/lib/supabase/server';
import type { Role } from '@/lib/admin/roles';
import { ROLE_LABELS, pickEffectiveRole } from '@/lib/admin/roles';
import { getDefaultAdminHome } from '@/lib/admin/navigation';
import type { StaffDepartmentId } from '@/lib/staff/permissions';
import { STAFF_DEPARTMENTS, canAccessStaffDepartment } from '@/lib/staff/permissions';
import { staffTasksConfigKey } from '@/lib/staff/departments';
import {
  parseStaffWorkBoard,
  seedDefaultTasks,
  taskCompletionPct,
  discountPercent,
  isFilmWorthyOffer,
  TEAM_DAILY_LIVE_TARGET,
  TEAM_DAILY_QUALITY_TARGET,
  STAFF_SLA_PENDING_WARN,
  type StaffFilmCandidate,
  type StaffWorkBoard,
} from '@/lib/staff/workBoard';
import { fetchStaffPulse, buildStaffQueue, type StaffPulse } from '@/lib/staff/buildStaffPulse';
import { filterStaffQueueForRole } from '@/lib/staff/equipoAccess';
import { listStaffDepartmentsForRole } from '@/lib/staff/permissions';
import { roleDefaultDepartment } from '@/lib/staff/roleRouting';

export type StaffHomePayload = {
  generatedAt: string;
  role: Role;
  roleLabel: string;
  greeting: string;
  departments: ReturnType<typeof listStaffDepartmentsForRole>;
  pulse: StaffPulse;
  queue: ReturnType<typeof buildStaffQueue>;
  board: StaffWorkBoard;
  film: StaffFilmCandidate[];
  targets: { liveToday: number; qualityToday: number };
  quickLinks: { label: string; href: string }[];
};

function greetingForRole(role: Role, displayName: string | null): string {
  const name = displayName?.trim() || 'equipo';
  const hour = new Date().getHours();
  const time =
    hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  if (role === 'gerente') {
    return `${time}, ${name}. Hoy toca supervisar que cada área cumpla.`;
  }
  return `${time}, ${name}. Bienvenido al equipo AVENTA — esperamos mucho de ti hoy.`;
}

async function loadDepartmentBoard(department: StaffDepartmentId): Promise<StaffWorkBoard> {
  const supabase = createServerClient();
  const key = staffTasksConfigKey(department);
  const { data } = await supabase.from('app_config').select('value').eq('key', key).maybeSingle();
  let board = parseStaffWorkBoard(data?.value, department);
  if (board.tasks.length === 0) {
    board = { ...board, tasks: seedDefaultTasks(department) };
  }
  return board;
}

async function loadFilmCandidates(): Promise<StaffFilmCandidate[]> {
  const supabase = createServerClient();
  const now = new Date().toISOString();
  const { data } = await supabase
    .from('offers')
    .select('id, title, store, price, original_price, image_url, offer_url, created_at')
    .in('status', ['approved', 'published'])
    .is('deleted_at', null)
    .or(`expires_at.is.null,expires_at.gte.${now}`)
    .order('created_at', { ascending: false })
    .limit(40);

  const film: StaffFilmCandidate[] = [];
  for (const row of data ?? []) {
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
      createdAt: String((row as { created_at?: string }).created_at ?? now),
    });
    if (film.length >= 8) break;
  }
  return film;
}

function quickLinksForRole(role: Role): { label: string; href: string }[] {
  const links: { label: string; href: string }[] = [{ label: 'Ir al sitio público', href: '/' }];
  if (role === 'owner' || role === 'admin') {
    links.push({ label: 'Panel admin', href: getDefaultAdminHome(role) });
    links.push({ label: 'Asignar roles', href: '/admin/team' });
  }
  if (role === 'moderator' || role === 'admin' || role === 'owner' || role === 'gerente') {
    links.push({ label: 'Cola de moderación', href: '/equipo/moderacion' });
  }
  if (role === 'marketing' || role === 'admin' || role === 'owner' || role === 'gerente') {
    links.push({ label: 'Content hub', href: '/equipo/marketing' });
  }
  if (role === 'finance' || role === 'admin' || role === 'owner' || role === 'gerente') {
    links.push({ label: 'Finance hub', href: '/equipo/contabilidad' });
  }
  if (role === 'analyst' || role === 'admin' || role === 'owner' || role === 'gerente') {
    links.push({ label: 'Operations hub', href: '/equipo/operaciones' });
  }
  if (role === 'gerente') {
    links.push({ label: 'Supervisión', href: '/equipo/gerencia' });
  }
  if (role === 'owner') {
    links.push({ label: 'Founder OS', href: '/admin/owner' });
    links.push({ label: 'Centro de operaciones', href: '/admin/operaciones' });
  }
  return links;
}

export async function buildStaffHomePayload(
  role: Role,
  displayName: string | null,
  department: StaffDepartmentId = 'home',
): Promise<StaffHomePayload> {
  const pulse = await fetchStaffPulse();
  const dept = canAccessStaffDepartment(role, department) ? department : roleDefaultDepartment(role);
  const board = await loadDepartmentBoard(dept === 'gerencia' ? 'home' : dept);
  const film = role === 'marketing' || role === 'owner' || role === 'admin' || role === 'gerente'
    ? await loadFilmCandidates()
    : [];

  return {
    generatedAt: new Date().toISOString(),
    role,
    roleLabel: ROLE_LABELS[role],
    greeting: greetingForRole(role, displayName),
    departments: listStaffDepartmentsForRole(role),
    pulse,
    queue: filterStaffQueueForRole(buildStaffQueue(role, pulse), role),
    board,
    film,
    targets: { liveToday: TEAM_DAILY_LIVE_TARGET, qualityToday: TEAM_DAILY_QUALITY_TARGET },
    quickLinks: quickLinksForRole(role),
  };
}

export type GerenciaStaffRow = {
  userId: string;
  displayName: string | null;
  role: Role;
  roleLabel: string;
  department: StaffDepartmentId;
  taskTotal: number;
  taskDone: number;
  taskPct: number;
};

export type GerenciaPayload = {
  generatedAt: string;
  greeting: string;
  role: Role;
  canAssignRoles: boolean;
  board: StaffWorkBoard;
  taskPct: number;
  pulse: StaffPulse;
  queue: ReturnType<typeof buildStaffQueue>;
  staff: GerenciaStaffRow[];
  alerts: string[];
  departmentProgress: {
    department: StaffDepartmentId;
    label: string;
    href: string;
    taskPct: number;
    pendingTasks: number;
    totalTasks: number;
  }[];
  sla: {
    pendingTotal: number;
    pendingWarnThreshold: number;
    approvedToday: number;
    liveTarget: number;
  };
};

function gerenciaGreeting(displayName: string | null): string {
  const name = displayName?.trim() || 'equipo';
  const hour = new Date().getHours();
  const time = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  return `${time}, ${name}. Supervisión del equipo AVENTA — SLA, colas y progreso por área.`;
}

export async function buildGerenciaPayload(role: Role, displayName: string | null): Promise<GerenciaPayload> {
  const supabase = createServerClient();
  const pulse = await fetchStaffPulse();
  const queue = filterStaffQueueForRole(buildStaffQueue(role, pulse), role);
  const board = await loadDepartmentBoard('gerencia');

  const { data: roleRows } = await supabase.from('user_roles').select('user_id, role');
  const byUser = new Map<string, Role>();
  for (const r of (roleRows ?? []) as { user_id: string; role: Role }[]) {
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, r.role);
  }

  const staffRoles: Role[] = ['gerente', 'finance', 'marketing', 'moderator', 'analyst', 'admin'];
  const staffIds = [...byUser.entries()]
    .filter(([, role]) => staffRoles.includes(role))
    .map(([id]) => id);

  const profilesRes =
    staffIds.length > 0
      ? await supabase.from('profiles').select('id, display_name').in('id', staffIds)
      : { data: [] as { id: string; display_name: string | null }[] };

  const profileMap = new Map<string, string | null>();
  for (const p of profilesRes.data ?? []) {
    profileMap.set(p.id, p.display_name ?? null);
  }

  const targetDepts = STAFF_DEPARTMENTS.filter((d) => d.id !== 'home' && d.id !== 'gerencia');
  const loadedDeptBoards = await Promise.all(
    targetDepts.map(async (d) => ({ meta: d, board: await loadDepartmentBoard(d.id) })),
  );

  const deptBoards = loadedDeptBoards.map(({ meta, board: deptBoard }) => {
    const pending = deptBoard.tasks.filter((t) => !t.done).length;
    return {
      department: meta.id,
      label: meta.label,
      href: meta.href,
      taskPct: taskCompletionPct(deptBoard.tasks),
      pendingTasks: pending,
      totalTasks: deptBoard.tasks.length,
    };
  });

  const boardByDept = new Map<StaffDepartmentId, StaffWorkBoard>();
  boardByDept.set('gerencia', board);
  for (const { meta, board: deptBoard } of loadedDeptBoards) {
    boardByDept.set(meta.id, deptBoard);
  }

  const staff: GerenciaStaffRow[] = staffIds.map((userId) => {
    const staffRole = byUser.get(userId)!;
    const dept = roleDefaultDepartment(staffRole);
    const deptBoard = boardByDept.get(dept === 'home' ? 'moderacion' : dept) ?? board;
    const done = deptBoard.tasks.filter((t) => t.done).length;
    const total = deptBoard.tasks.length;
    return {
      userId,
      displayName: profileMap.get(userId) ?? null,
      role: staffRole,
      roleLabel: ROLE_LABELS[staffRole],
      department: dept,
      taskTotal: total,
      taskDone: done,
      taskPct: taskCompletionPct(deptBoard.tasks),
    };
  });

  const alerts: string[] = [];
  if (pulse.pendingTotal > STAFF_SLA_PENDING_WARN) {
    alerts.push(`Cola de moderación alta (${pulse.pendingTotal} pendientes). Revisar con el equipo.`);
  }
  if (pulse.approvedToday < TEAM_DAILY_LIVE_TARGET) {
    alerts.push(
      `Solo ${pulse.approvedToday} aprobadas hoy; meta ${TEAM_DAILY_LIVE_TARGET}. Priorizar calidad, no relleno.`,
    );
  }
  if (pulse.pendingReports > 0) {
    alerts.push(`${pulse.pendingReports} reporte(s) de la comunidad sin cerrar.`);
  }
  if (pulse.outOfStock > 0) {
    alerts.push(`${pulse.outOfStock} oferta(s) marcadas como agotadas.`);
  }

  return {
    generatedAt: new Date().toISOString(),
    greeting: gerenciaGreeting(displayName),
    role,
    canAssignRoles: role === 'owner' || role === 'admin',
    board,
    taskPct: taskCompletionPct(board.tasks),
    pulse,
    queue,
    staff,
    alerts,
    departmentProgress: deptBoards,
    sla: {
      pendingTotal: pulse.pendingTotal,
      pendingWarnThreshold: STAFF_SLA_PENDING_WARN,
      approvedToday: pulse.approvedToday,
      liveTarget: TEAM_DAILY_LIVE_TARGET,
    },
  };
}

export { loadDepartmentBoard, pickEffectiveRole };
