import type { LucideIcon } from 'lucide-react';
import { Archive, BadgeCheck, CircleAlert, Flag, Info, ThumbsUp } from 'lucide-react';
import type { AchievementDefinition } from '@/lib/achievements/types';
import { achievementDefinitionByName } from '@/app/components/achievements/achievementVisuals';

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export type AnnouncementItem = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
};

export type NotificationEntry = { ids: string[]; item: NotificationItem; unread: boolean };

type KindPresentation = {
  label: string;
  icon: LucideIcon;
  /** Clases del mosaico del icono (fondo + tinta). */
  tile: string;
  cta: string;
};

/** Solo los tipos que hoy inserta el backend (`notifications.type`). El resto cae en `fallback`. */
const KINDS: Record<string, KindPresentation> = {
  offer_approved: {
    label: 'Oferta aprobada',
    icon: BadgeCheck,
    tile: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300',
    cta: 'Ver oferta',
  },
  offer_rejected: {
    label: 'Oferta no aprobada',
    icon: CircleAlert,
    tile: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300',
    cta: 'Revisar mis ofertas',
  },
  offer_removed: {
    label: 'Oferta retirada',
    icon: Archive,
    tile: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
    cta: 'Ir a mi espacio',
  },
  offer_likes_milestone: {
    label: 'Apoyos',
    icon: ThumbsUp,
    tile: 'bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-300',
    cta: 'Ver oferta',
  },
  offer_like: {
    label: 'Apoyos',
    icon: ThumbsUp,
    tile: 'bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-300',
    cta: 'Ver oferta',
  },
  report_received: {
    label: 'Reporte',
    icon: Flag,
    tile: 'bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-300',
    cta: 'Ver contenido',
  },
  achievement_unlocked: {
    label: 'Logro',
    icon: BadgeCheck,
    tile: 'bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300',
    cta: 'Ver mis logros',
  },
};

const FALLBACK: KindPresentation = {
  label: 'Aviso',
  icon: Info,
  tile: 'bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300',
  cta: 'Ver contenido',
};

export const ACHIEVEMENTS_HREF = '/me/logros';

export function notificationKind(type: string): KindPresentation {
  return KINDS[type] ?? FALLBACK;
}

export type UnlockedAchievement = {
  name: string;
  xp: number | null;
  definition: AchievementDefinition | null;
};

/** `lib/achievements/sync.ts` escribe: Has conseguido:\n"<nombre>"\n+<xp> XP */
export function parseAchievementNotification(item: Pick<NotificationItem, 'type' | 'body'>): UnlockedAchievement | null {
  if (item.type !== 'achievement_unlocked' || !item.body) return null;
  const name = item.body.match(/"([^"]+)"/)?.[1]?.trim();
  if (!name) return null;
  const xpMatch = item.body.match(/\+(\d+)\s*XP/i);
  return {
    name,
    xp: xpMatch ? Number(xpMatch[1]) : null,
    definition: achievementDefinitionByName(name),
  };
}

export function notificationHref(item: Pick<NotificationItem, 'type' | 'link'>): string | null {
  if (item.type === 'achievement_unlocked') return ACHIEVEMENTS_HREF;
  return item.link;
}

/** Agrupa likes sueltos por oferta (tipo heredado) y ordena por fecha. */
export function buildNotificationEntries(notifications: NotificationItem[]): NotificationEntry[] {
  const likeKey = (n: NotificationItem) => (n.type === 'offer_like' && n.link ? n.link : null);
  const likeGroups = new Map<string, NotificationItem[]>();
  for (const n of notifications) {
    const key = likeKey(n);
    if (key === null) continue;
    const list = likeGroups.get(key) ?? [];
    list.push(n);
    likeGroups.set(key, list);
  }
  const entries: NotificationEntry[] = [];
  likeGroups.forEach((list) => {
    const sorted = [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const latest = sorted[0];
    const unread = sorted.some((n) => !n.read_at);
    if (sorted.length === 1) {
      entries.push({ ids: [latest.id], item: latest, unread });
      return;
    }
    const names = sorted.map((n) => (n.body && n.body.includes(' dio like') ? n.body.replace(/ dio like.*/, '').trim() : 'Alguien'));
    const uniq = [...new Set(names)];
    const text = uniq.length <= 2 ? uniq.join(' y ') : `${uniq[0]}, ${uniq[1]} y ${sorted.length - 2} más`;
    entries.push({
      ids: sorted.map((n) => n.id),
      item: { ...latest, body: `${text} dieron like a tu oferta`, title: 'Nuevos likes' },
      unread,
    });
  });
  for (const n of notifications) {
    if (likeKey(n) === null) entries.push({ ids: [n.id], item: n, unread: !n.read_at });
  }
  return entries.sort((a, b) => new Date(b.item.created_at).getTime() - new Date(a.item.created_at).getTime());
}
