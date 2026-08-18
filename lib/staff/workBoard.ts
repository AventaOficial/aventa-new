import type { StaffDepartmentId } from '@/lib/staff/permissions';
import { staffTasksConfigKey } from '@/lib/staff/departments';

export const TEAM_WORK_BOARD_KEY = 'team_work_board';
export { staffTasksConfigKey };

export const TEAM_DAILY_LIVE_TARGET = 15;
export const TEAM_DAILY_QUALITY_TARGET = 8;
export const TEAM_FILM_MIN_DISCOUNT_PCT = 20;
export const STAFF_SLA_PENDING_WARN = 12;
export const STAFF_SLA_PENDING_HOURS = 4;

export type StaffWorkTask = {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
};

export type StaffWorkBoard = {
  department: StaffDepartmentId;
  tasks: StaffWorkTask[];
  updatedAt: string | null;
  updatedBy: string | null;
};

export type StaffQueueItem = {
  id: string;
  label: string;
  detail: string;
  count: number;
  tone: 'ok' | 'attention' | 'blocked';
  href: string;
  department?: StaffDepartmentId;
};

export type StaffFilmCandidate = {
  id: string;
  title: string;
  store: string;
  price: number;
  originalPrice: number | null;
  discountPercent: number | null;
  imageUrl: string | null;
  offerUrl: string;
  createdAt: string;
};

const DEFAULT_BY_DEPT: Record<StaffDepartmentId, string[]> = {
  home: [
    'Revisar el tablero del día antes de empezar',
    'Comunicar bloqueos al gerente si algo está en rojo',
  ],
  moderacion: [
    'Revisar cola del bot: solo ofertas reales ML/Amazon',
    'Revisar ofertas de cazadores humanos',
    'Cerrar reportes abiertos de la comunidad',
    'Verificar ofertas con precio cambiado o agotadas',
  ],
  marketing: [
    'Elegir 3 ofertas del día para grabar (TikTok / Reels / Shorts)',
    'Preparar copy y hashtags para cada pieza',
    'Actualizar enlace del último video en admin si aplica',
  ],
  contabilidad: [
    'Revisar si hay CSV nuevo de comisiones Amazon/ML',
    'Cuadrar ledger con clics outbound de la semana',
    'Anotar pagos pendientes para el cierre mensual',
  ],
  operaciones: [
    'Revisar ofertas agotadas o con precio distinto',
    'Confirmar que los crons de digest y health corrieron',
    'Reportar errores críticos al fundador',
  ],
  gerencia: [
    'Revisar SLA de moderación (cola menor a 4 horas)',
    'Confirmar meta de aprobadas hoy (calidad, no volumen)',
    'Dar seguimiento a tareas pendientes por área',
  ],
};

export const STAFF_QUALITY_RULES = [
  'El enlace debe abrir el mismo producto, no el home de Amazon ni una búsqueda de Mercado Libre.',
  'Debe verse un descuento real: precio original > precio actual.',
  'No publicar réplicas, lotes, “pregunta antes” ni títulos genéricos.',
  'Prioriza Mercado Libre y Amazon México. Si dudas, no publiques.',
];

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t || null;
}

export function newTaskId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function seedDefaultTasks(
  department: StaffDepartmentId,
  nowIso = new Date().toISOString(),
): StaffWorkTask[] {
  return DEFAULT_BY_DEPT[department].map((text, i) => ({
    id: `seed-${department}-${i + 1}`,
    text,
    done: false,
    createdAt: nowIso,
  }));
}

export function parseStaffWorkBoard(raw: unknown, department: StaffDepartmentId): StaffWorkBoard {
  const empty: StaffWorkBoard = { department, tasks: [], updatedAt: null, updatedBy: null };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty;
  const obj = raw as Record<string, unknown>;
  const rows = Array.isArray(obj.tasks) ? obj.tasks : [];
  const tasks: StaffWorkTask[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const item = row as Record<string, unknown>;
    const id = asTrimmedString(item.id);
    const text = asTrimmedString(item.text);
    if (!id || !text || seen.has(id)) continue;
    seen.add(id);
    tasks.push({
      id: id.slice(0, 80),
      text: text.slice(0, 280),
      done: item.done === true,
      createdAt: asTrimmedString(item.createdAt) ?? new Date().toISOString(),
    });
  }
  return {
    department,
    tasks: tasks.slice(0, 40),
    updatedAt: asTrimmedString(obj.updatedAt),
    updatedBy: asTrimmedString(obj.updatedBy),
  };
}

export function serializeStaffWorkBoard(board: StaffWorkBoard): StaffWorkBoard {
  return {
    department: board.department,
    tasks: board.tasks.slice(0, 40),
    updatedAt: board.updatedAt,
    updatedBy: board.updatedBy,
  };
}

export function taskCompletionPct(tasks: StaffWorkTask[]): number {
  if (tasks.length === 0) return 0;
  const done = tasks.filter((t) => t.done).length;
  return Math.round((done / tasks.length) * 100);
}

export function discountPercent(price: number, originalPrice: number | null | undefined): number | null {
  if (!originalPrice || originalPrice <= 0 || price <= 0 || originalPrice <= price) return null;
  return Math.round(((originalPrice - price) / originalPrice) * 100);
}

export function isFilmWorthyOffer(input: {
  price: number;
  originalPrice: number | null;
  title: string;
  offerUrl: string;
}): boolean {
  const pct = discountPercent(input.price, input.originalPrice);
  if (pct == null || pct < TEAM_FILM_MIN_DISCOUNT_PCT) return false;
  if (input.title.trim().length < 12) return false;
  try {
    const host = new URL(input.offerUrl).hostname.toLowerCase();
    const ok =
      host.includes('mercadolibre.') ||
      host.includes('mercadolibre.com') ||
      host.endsWith('amazon.com.mx') ||
      host.endsWith('amazon.com') ||
      host.includes('amzn.to') ||
      host.includes('meli.la');
    if (!ok) return false;
  } catch {
    return false;
  }
  return true;
}

export function queueTone(count: number, kind: string): StaffQueueItem['tone'] {
  if (kind === 'live-today') {
    if (count >= TEAM_DAILY_LIVE_TARGET) return 'ok';
    if (count >= 5) return 'attention';
    return 'blocked';
  }
  if (kind === 'payouts') return count > 0 ? 'attention' : 'ok';
  if (count <= 0) return 'ok';
  if (kind === 'pending-bot' && count > STAFF_SLA_PENDING_WARN) return 'blocked';
  if (kind === 'reports' && count > 0) return 'attention';
  if (kind === 'price-changed' || kind === 'out-of-stock') return count > 0 ? 'attention' : 'ok';
  return 'attention';
}

// Re-export legacy names for admin API compatibility
export type TeamWorkTask = StaffWorkTask;
export type TeamWorkBoard = StaffWorkBoard;
export type TeamQueueItem = StaffQueueItem;
export type TeamFilmCandidate = StaffFilmCandidate;
export const DEFAULT_TEAM_TASKS = DEFAULT_BY_DEPT.moderacion.map((text, i) => ({
  id: `seed-mod-${i + 1}`,
  text,
  done: false,
}));
export const TEAM_QUALITY_RULES = STAFF_QUALITY_RULES;
export const parseTeamWorkBoard = (raw: unknown) => parseStaffWorkBoard(raw, 'home');
export const serializeTeamWorkBoard = (board: StaffWorkBoard) => serializeStaffWorkBoard(board);
