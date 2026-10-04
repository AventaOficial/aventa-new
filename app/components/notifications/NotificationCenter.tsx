'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Compass, Trash2, X } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { formatModerationRelativeTime } from '@/lib/moderation/relativeTime';
import AchievementSigil from '@/app/components/achievements/AchievementSigil';
import AventaSignalIcon from './AventaSignalIcon';
import {
  ACHIEVEMENTS_HREF,
  buildNotificationEntries,
  notificationHref,
  notificationKind,
  parseAchievementNotification,
  type AnnouncementItem,
  type NotificationEntry,
  type NotificationItem,
} from './notificationKinds';

type NotifTab = 'actividad' | 'avisos' | 'explorar';
type LoadStatus = 'loading' | 'ready' | 'error';

type NotificationDetail =
  | { kind: 'notification'; ids: string[]; item: NotificationItem }
  | { kind: 'announcement'; item: AnnouncementItem };

const TABS: Array<{ id: NotifTab; label: string }> = [
  { id: 'actividad', label: 'Actividad' },
  { id: 'avisos', label: 'Avisos' },
  { id: 'explorar', label: 'Explorar' },
];

function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function EntryVisual({ item }: { item: NotificationItem }) {
  const achievement = parseAchievementNotification(item);
  if (item.type === 'achievement_unlocked') {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center">
        <AchievementSigil code={achievement?.definition?.code} size="sm" />
      </span>
    );
  }
  const kind = notificationKind(item.type);
  const Icon = kind.icon;
  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${kind.tile}`}>
      <Icon className="h-[18px] w-[18px]" aria-hidden />
    </span>
  );
}

function EntryRow({
  entry,
  onOpen,
  onDelete,
}: {
  entry: NotificationEntry;
  onOpen: (entry: NotificationEntry) => void;
  onDelete: (ids: string[]) => void;
}) {
  const { item, unread } = entry;
  const kind = notificationKind(item.type);
  const achievement = parseAchievementNotification(item);
  return (
    <li className="group relative">
      <button
        type="button"
        onClick={() => onOpen(entry)}
        className={`flex w-full items-start gap-3 rounded-2xl border py-3 pl-3 pr-12 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
          unread
            ? 'border-violet-200/80 bg-violet-50/60 hover:bg-violet-50 dark:border-violet-900/60 dark:bg-violet-950/30 dark:hover:bg-violet-950/50'
            : 'border-transparent hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
        }`}
      >
        <EntryVisual item={item} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-[#86868b] dark:text-[#8e8e93]">
            <span className="truncate">{kind.label}</span>
            <span aria-hidden>·</span>
            <time dateTime={item.created_at} className="shrink-0">
              {formatModerationRelativeTime(item.created_at)}
            </time>
            {unread ? (
              <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-600 px-1.5 py-px text-[10px] font-semibold text-white">
                Nueva
              </span>
            ) : null}
          </span>
          <span
            className={`mt-0.5 block truncate text-[14px] ${
              unread ? 'font-semibold text-[#1d1d1f] dark:text-[#fafafa]' : 'font-medium text-[#3a3a3c] dark:text-[#d1d1d6]'
            }`}
          >
            {achievement ? achievement.name : item.title}
          </span>
          {achievement ? (
            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">
              {item.title}
              {achievement.xp ? (
                <span className="rounded-full bg-violet-100 px-1.5 py-px text-[11px] font-semibold tabular-nums text-violet-700 dark:bg-violet-900/60 dark:text-violet-200">
                  +{achievement.xp} XP
                </span>
              ) : null}
            </span>
          ) : item.body ? (
            <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-[#6e6e73] dark:text-[#a3a3a3]">{item.body}</span>
          ) : null}
        </span>
      </button>
      <button
        type="button"
        onClick={() => onDelete(entry.ids)}
        className="absolute right-1 top-1 inline-flex h-11 w-11 items-center justify-center rounded-xl text-[#a1a1aa] opacity-80 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 group-hover:opacity-100 dark:hover:bg-red-950/40 md:h-9 md:w-9"
        aria-label={`Eliminar notificación: ${achievement ? achievement.name : item.title}`}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
    </li>
  );
}

function ListSkeleton() {
  return (
    <ul className="space-y-2" aria-hidden>
      {[0, 1, 2].map((key) => (
        <li key={key} className="flex items-start gap-3 rounded-2xl p-3">
          <span className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-black/[0.06] dark:bg-white/10" />
          <span className="flex-1 space-y-2 pt-1">
            <span className="block h-2.5 w-24 animate-pulse rounded bg-black/[0.06] dark:bg-white/10" />
            <span className="block h-3 w-3/4 animate-pulse rounded bg-black/[0.06] dark:bg-white/10" />
          </span>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300">
        <AventaSignalIcon className="h-7 w-7" />
      </span>
      <p className="mt-3 text-[15px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">{title}</p>
      <p className="mt-1 max-w-xs text-[13px] leading-snug text-[#6e6e73] dark:text-[#a3a3a3]">{body}</p>
    </div>
  );
}

export default function NotificationCenter() {
  const { session } = useAuth();
  const token = session?.access_token ?? null;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<NotifTab>('actividad');
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [detail, setDetail] = useState<NotificationDetail | null>(null);
  const loadedRef = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const fetchNotifications = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/notifications', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { notifications?: NotificationItem[]; unreadCount?: number };
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
      loadedRef.current = true;
      setStatus('ready');
    } catch {
      if (!loadedRef.current) setStatus('error');
    }
  }, [token]);

  useEffect(() => {
    void fetchNotifications();
    const interval = setInterval(() => void fetchNotifications(), 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/announcements');
        if (!res.ok) return;
        const data = (await res.json()) as { announcements?: AnnouncementItem[] };
        if (!cancelled) setAnnouncements(data.announcements ?? []);
      } catch {
        // Los avisos son opcionales; el panel sigue usable sin ellos.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open && !detail) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (detail) setDetail(null);
      else close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, detail, close]);

  const deleteNotifications = useCallback(
    async (ids: string[]) => {
      if (!token || ids.length === 0) return;
      try {
        await Promise.all(
          ids.map((id) =>
            fetch('/api/notifications', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ id }),
            }),
          ),
        );
        setNotifications((prev) => {
          const removedUnread = prev.filter((n) => ids.includes(n.id) && !n.read_at).length;
          setUnreadCount((c) => Math.max(0, c - removedUnread));
          return prev.filter((n) => !ids.includes(n.id));
        });
      } catch {
        // Se conserva la lista; el usuario puede reintentar.
      }
    },
    [token],
  );

  const markRead = useCallback(
    async (ids: string[]) => {
      if (!token || ids.length === 0) return;
      const toMark = ids.filter((id) => !notifications.find((x) => x.id === id)?.read_at);
      if (toMark.length === 0) return;
      try {
        await Promise.all(
          toMark.map((id) =>
            fetch('/api/notifications', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ id }),
            }),
          ),
        );
        const readAt = new Date().toISOString();
        setNotifications((prev) => prev.map((item) => (ids.includes(item.id) ? { ...item, read_at: item.read_at ?? readAt } : item)));
        setUnreadCount((count) => Math.max(0, count - toMark.length));
      } catch {
        // Mantener la navegación usable aunque falle el marcado como leído.
      }
    },
    [notifications, token],
  );

  const markAllRead = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      if (!res.ok) return;
      const readAt = new Date().toISOString();
      setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? readAt })));
      setUnreadCount(0);
    } catch {
      // Sin cambios locales si falla.
    }
  };

  const entries = buildNotificationEntries(notifications);
  const fresh = entries.filter((entry) => entry.unread);
  const earlier = entries.filter((entry) => !entry.unread);
  const badge = unreadCount > 9 ? '9+' : String(unreadCount);
  const iconState = open ? 'active' : unreadCount > 0 ? 'pending' : 'idle';

  const openEntry = (entry: NotificationEntry) => {
    setDetail({ kind: 'notification', ids: entry.ids, item: entry.item });
    void markRead(entry.ids);
  };

  const renderSection = (title: string, list: NotificationEntry[]) =>
    list.length === 0 ? null : (
      <section aria-label={title}>
        <h3 className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#86868b] dark:text-[#8e8e93]">{title}</h3>
        <ul className="space-y-1.5">
          {list.map((entry) => (
            <EntryRow key={entry.ids[0]} entry={entry} onOpen={openEntry} onDelete={(ids) => void deleteNotifications(ids)} />
          ))}
        </ul>
      </section>
    );

  const detailAchievement = detail?.kind === 'notification' ? parseAchievementNotification(detail.item) : null;
  const detailHref = detail ? (detail.kind === 'notification' ? notificationHref(detail.item) : detail.item.link) : null;
  const detailCta =
    detail?.kind === 'notification' ? notificationKind(detail.item.type).cta : 'Ver contenido';

  return (
    <>
      <motion.button
        ref={buttonRef}
        type="button"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="aventa-notification-center"
        aria-label={unreadCount > 0 ? `Notificaciones, ${unreadCount} sin leer` : 'Notificaciones'}
        className={`relative inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0a0a0a] md:h-12 md:w-12 ${
          open
            ? 'bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300'
            : unreadCount > 0
              ? 'text-violet-600 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950/60'
              : 'text-[#6e6e73] hover:bg-[#f5f5f7] dark:text-[#a3a3a3] dark:hover:bg-[#1a1a1a]'
        }`}
      >
        <AventaSignalIcon state={iconState} className="h-[22px] w-[22px] md:h-6 md:w-6" />
        {unreadCount > 0 ? (
          <span
            className="absolute right-0.5 top-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-bold leading-none tabular-nums text-white ring-2 ring-white dark:bg-violet-500 dark:ring-[#0a0a0a] md:right-1 md:top-1"
            aria-hidden
          >
            {badge}
          </span>
        ) : null}
      </motion.button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div
            id="aventa-notification-center"
            role="dialog"
            aria-modal="false"
            aria-labelledby="aventa-notification-title"
            className="fixed inset-x-0 bottom-0 top-[calc(max(0.75rem,env(safe-area-inset-top))+3.75rem)] z-50 flex flex-col overflow-hidden border-t border-[#e5e5e7] bg-white dark:border-[#262626] dark:bg-[#141414] md:absolute md:inset-x-auto md:bottom-auto md:right-4 md:top-full md:mt-2 md:max-h-[min(75vh,40rem)] md:w-[26rem] md:rounded-2xl md:border md:shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3">
              <h2 id="aventa-notification-title" className="text-[17px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">
                Notificaciones
              </h2>
              <div className="flex items-center gap-1">
                {tab === 'actividad' && unreadCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => void markAllRead()}
                    className="inline-flex min-h-11 items-center rounded-full px-3 text-[13px] font-medium text-violet-600 transition-colors hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:text-violet-300 dark:hover:bg-violet-950/60 md:min-h-9"
                  >
                    Marcar todas como leídas
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={close}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[#6e6e73] transition-colors hover:bg-[#f5f5f7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:text-[#a3a3a3] dark:hover:bg-[#1f1f1f] md:hidden"
                  aria-label="Cerrar notificaciones"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
            </div>

            <div className="flex gap-1 border-b border-[#e5e5e7] px-2 dark:border-[#262626]" role="tablist" aria-label="Tipo de notificación">
              {TABS.map((item) => {
                const selected = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setTab(item.id)}
                    className={`-mb-px inline-flex min-h-11 items-center gap-1.5 border-b-2 px-3 text-[14px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400 ${
                      selected
                        ? 'border-violet-600 text-violet-600 dark:border-violet-400 dark:text-violet-300'
                        : 'border-transparent text-[#6e6e73] hover:text-[#1d1d1f] dark:text-[#a3a3a3] dark:hover:text-[#fafafa]'
                    }`}
                  >
                    {item.label}
                    {item.id === 'actividad' && unreadCount > 0 ? (
                      <span className="rounded-full bg-violet-100 px-1.5 text-[11px] font-semibold tabular-nums text-violet-700 dark:bg-violet-900/60 dark:text-violet-200">
                        {badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-3">
              {tab === 'actividad' ? (
                status === 'loading' ? (
                  <div aria-busy="true" aria-label="Cargando notificaciones">
                    <ListSkeleton />
                  </div>
                ) : status === 'error' ? (
                  <div className="flex flex-col items-center px-4 py-10 text-center" role="alert">
                    <p className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">No pudimos cargar tus notificaciones</p>
                    <p className="mt-1 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">Revisa tu conexión e inténtalo de nuevo.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setStatus('loading');
                        void fetchNotifications();
                      }}
                      className="mt-4 inline-flex min-h-11 items-center rounded-full border border-black/10 px-4 text-[13px] font-medium text-[#1d1d1f] transition-colors hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:border-white/15 dark:text-[#fafafa] dark:hover:bg-white/[0.06] md:min-h-9"
                    >
                      Reintentar
                    </button>
                  </div>
                ) : entries.length === 0 ? (
                  <EmptyState
                    title="Todo al día"
                    body="Aquí verás cuando aprueben tus ofertas, sumen apoyos o desbloquees un logro."
                  />
                ) : (
                  <div className="space-y-4">
                    {renderSection('Nuevas', fresh)}
                    {renderSection('Anteriores', earlier)}
                  </div>
                )
              ) : null}

              {tab === 'avisos' ? (
                announcements.length === 0 ? (
                  <EmptyState title="Sin avisos por ahora" body="Cuando el equipo de Aventa publique novedades, aparecerán aquí." />
                ) : (
                  <ul className="space-y-1.5">
                    {announcements.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => setDetail({ kind: 'announcement', item: a })}
                          className="block w-full rounded-2xl p-3 text-left transition-colors hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:hover:bg-white/[0.04]"
                        >
                          <span className="text-[11px] font-medium text-[#86868b] dark:text-[#8e8e93]">
                            Aviso de Aventa · <time dateTime={a.created_at}>{formatModerationRelativeTime(a.created_at)}</time>
                          </span>
                          <span className="mt-0.5 block text-[14px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">{a.title}</span>
                          {a.body ? <span className="mt-0.5 line-clamp-2 block text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">{a.body}</span> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              ) : null}

              {tab === 'explorar' ? (
                <div className="rounded-2xl border border-[#e5e5e7] bg-[#f5f5f7]/60 p-4 dark:border-[#333] dark:bg-[#1a1a1a]/40">
                  <div className="flex items-start gap-3">
                    <Compass className="mt-0.5 h-5 w-5 shrink-0 text-violet-600 dark:text-violet-400" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Guía rápida</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-[#6e6e73] dark:text-[#a3a3a3]">
                        Novedades, guías y cómo sacarle más provecho a la plataforma.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-4">
                        <Link
                          href="/descubre"
                          onClick={() => setOpen(false)}
                          className="inline-flex min-h-11 items-center text-[13px] font-semibold text-violet-600 hover:underline dark:text-violet-400 md:min-h-9"
                        >
                          Ir a la guía
                        </Link>
                        <Link
                          href={ACHIEVEMENTS_HREF}
                          onClick={() => setOpen(false)}
                          className="inline-flex min-h-11 items-center text-[13px] font-semibold text-violet-600 hover:underline dark:text-violet-400 md:min-h-9"
                        >
                          Ver mis logros
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      <AnimatePresence>
        {detail ? (
          <motion.div
            className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setDetail(null)}
            role="presentation"
          >
            <motion.article
              initial={{ opacity: 0, y: 28, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
              onClick={(event) => event.stopPropagation()}
              className="relative w-full rounded-t-3xl border border-[#e5e5e7] bg-white px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 shadow-2xl dark:border-[#333] dark:bg-[#141414] sm:max-w-lg sm:rounded-3xl sm:p-7"
              role="dialog"
              aria-modal="true"
              aria-labelledby="notification-detail-title"
            >
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e5e5e7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:bg-[#262626] dark:text-[#a3a3a3] dark:hover:bg-[#333]"
                aria-label="Cerrar detalle"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>

              {detailAchievement ? (
                <div className="flex flex-col items-center pr-0 pt-2 text-center">
                  <AchievementSigil code={detailAchievement.definition?.code} size="lg" />
                  <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-600 dark:text-violet-400">
                    Logro desbloqueado
                  </p>
                  <h2 id="notification-detail-title" className="mt-1.5 text-[22px] font-bold leading-tight text-[#1d1d1f] dark:text-[#fafafa]">
                    {detailAchievement.name}
                  </h2>
                  {detailAchievement.definition ? (
                    <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-[#515154] dark:text-[#d1d1d6]">
                      {detailAchievement.definition.unlockLine}
                    </p>
                  ) : null}
                  {detailAchievement.xp ? (
                    <span className="mt-3 inline-flex items-center rounded-full bg-violet-50 px-3 py-1 text-[13px] font-semibold tabular-nums text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                      +{detailAchievement.xp} XP
                    </span>
                  ) : null}
                </div>
              ) : (
                <div className="pr-10">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-600 dark:text-violet-400">
                    {detail.kind === 'announcement' ? 'Aviso de Aventa' : notificationKind(detail.item.type).label}
                  </p>
                  <h2 id="notification-detail-title" className="mt-2 text-xl font-bold leading-tight text-[#1d1d1f] dark:text-[#fafafa]">
                    {detail.item.title}
                  </h2>
                  {detail.item.body ? (
                    <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7 text-[#515154] dark:text-[#d1d1d6]">{detail.item.body}</p>
                  ) : null}
                </div>
              )}

              <p className={`mt-5 text-xs text-[#86868b] dark:text-[#8e8e93] ${detailAchievement ? 'text-center' : ''}`}>
                {formatFullDate(detail.item.created_at)}
              </p>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setDetail(null)}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#d2d2d7] px-4 text-sm font-semibold text-[#1d1d1f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:border-[#404040] dark:text-[#fafafa]"
                >
                  Cerrar
                </button>
                {detailHref ? (
                  <Link
                    href={detailHref}
                    onClick={() => {
                      setDetail(null);
                      setOpen(false);
                    }}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2"
                  >
                    {detail.kind === 'announcement' ? 'Ver contenido' : detailCta}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                ) : null}
              </div>
            </motion.article>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
