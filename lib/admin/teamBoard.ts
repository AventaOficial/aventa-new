export const TEAM_WORK_BOARD_KEY = 'team_work_board';

/** Meta diaria realista para 1–3 personas (no el techo editorial de 50). */
export const TEAM_DAILY_LIVE_TARGET = 15;
export const TEAM_DAILY_QUALITY_TARGET = 8;
export const TEAM_FILM_MIN_DISCOUNT_PCT = 20;

export type TeamWorkTask = {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
};

export type TeamWorkBoard = {
  tasks: TeamWorkTask[];
  updatedAt: string | null;
  updatedBy: string | null;
};

export type TeamQueueItem = {
  id: 'pending-bot' | 'pending-human' | 'reports' | 'price-changed' | 'out-of-stock' | 'live-today' | 'payouts';
  label: string;
  detail: string;
  count: number;
  tone: 'ok' | 'attention' | 'blocked';
  href: string;
};

export type TeamFilmCandidate = {
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

export const DEFAULT_TEAM_TASKS: Omit<TeamWorkTask, 'createdAt'>[] = [
  {
    id: 'seed-mod-bot',
    text: 'Revisar cola del bot: publicar solo ofertas reales de ML/Amazon (precio visible, no home ni búsqueda)',
    done: false,
  },
  {
    id: 'seed-mod-human',
    text: 'Revisar ofertas subidas por cazadores',
    done: false,
  },
  {
    id: 'seed-reports',
    text: 'Cerrar reportes de la comunidad',
    done: false,
  },
  {
    id: 'seed-health',
    text: 'Revisar ofertas con precio cambiado o agotadas',
    done: false,
  },
  {
    id: 'seed-film',
    text: 'Elegir 3 ofertas buenas del día para grabar (TikTok / Reels / Shorts)',
    done: false,
  },
];

export const TEAM_QUALITY_RULES = [
  'El enlace debe abrir el mismo producto, no el home de Amazon ni una búsqueda de Mercado Libre.',
  'Debe verse un descuento real: precio original > precio actual, y el % tiene que coincidir en la tienda.',
  'No publicar réplicas, lotes, “pregunta antes”, títulos genéricos ni ofertas sin foto.',
  'Prioriza Mercado Libre y Amazon México. Si el precio ya no existe o está agotado, rechaza.',
  'Si dudas, no publiques. Mejor 8 ofertas buenas que 40 de relleno.',
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

export function seedDefaultTasks(nowIso = new Date().toISOString()): TeamWorkTask[] {
  return DEFAULT_TEAM_TASKS.map((t) => ({ ...t, createdAt: nowIso }));
}

export function parseTeamWorkBoard(raw: unknown): TeamWorkBoard {
  const empty: TeamWorkBoard = { tasks: [], updatedAt: null, updatedBy: null };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty;
  const obj = raw as Record<string, unknown>;
  const rows = Array.isArray(obj.tasks) ? obj.tasks : [];
  const tasks: TeamWorkTask[] = [];
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
    tasks: tasks.slice(0, 40),
    updatedAt: asTrimmedString(obj.updatedAt),
    updatedBy: asTrimmedString(obj.updatedBy),
  };
}

export function serializeTeamWorkBoard(board: TeamWorkBoard): TeamWorkBoard {
  return {
    tasks: board.tasks.slice(0, 40),
    updatedAt: board.updatedAt,
    updatedBy: board.updatedBy,
  };
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

export function queueTone(count: number, kind: TeamQueueItem['id']): TeamQueueItem['tone'] {
  if (kind === 'live-today') {
    if (count >= TEAM_DAILY_LIVE_TARGET) return 'ok';
    if (count >= 5) return 'attention';
    return 'blocked';
  }
  if (kind === 'payouts') return count > 0 ? 'attention' : 'ok';
  if (count <= 0) return 'ok';
  if (kind === 'pending-bot' && count > 12) return 'blocked';
  if (kind === 'reports' && count > 0) return 'attention';
  if (kind === 'price-changed' || kind === 'out-of-stock') return count > 0 ? 'attention' : 'ok';
  return 'attention';
}
