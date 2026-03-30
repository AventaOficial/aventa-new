'use client';

import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Bell, LogOut, HelpCircle, Moon, Sun, Settings, Sparkles, Trash2, Droplet, Compass, Puzzle, ShieldCheck, Heart } from 'lucide-react';
import DarkModeToggle from './DarkModeToggle';
import { useState, useEffect, useRef, useCallback } from 'react';
import { playNotificationDropSound } from '@/lib/playNotificationSound';
import { useTheme } from '@/app/providers/ThemeProvider';
import { useAuth } from '@/app/providers/AuthProvider';
import { useUI } from '@/app/providers/UIProvider';
import { usePathname } from 'next/navigation';

type NotifTab = 'ofertas' | 'explorar' | 'avisos';

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export default function Navbar() {
  const { isDark, toggleTheme } = useTheme();
  const { user, session, signOut, isLoading: authLoading } = useAuth();
  const { openRegisterModal, openGuideModal } = useUI();
  const pathname = usePathname();
  const isHomePage = pathname === '/';
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [signOutStatus, setSignOutStatus] = useState<'idle' | 'closing' | 'closed'>('idle');
  const [signOutFading, setSignOutFading] = useState(false);
  const [notifTab, setNotifTab] = useState<NotifTab>('ofertas');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [announcements, setAnnouncements] = useState<{ id: string; title: string; body: string | null; link: string | null; created_at: string }[]>([]);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const loadNotifSoundPrimedRef = useRef(false);

  const userPhoto = user?.user_metadata?.avatar_url ?? null;
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [canAccessModeration, setCanAccessModeration] = useState(false);
  const [reputationLevel, setReputationLevel] = useState<number>(1);
  const [reputationScore, setReputationScore] = useState<number>(0);

  useEffect(() => {
    if (!user?.id) {
      setDisplayName(null);
      setCanAccessModeration(false);
      setReputationLevel(1);
      setReputationScore(0);
      return;
    }
    const loadProfileAndRole = async () => {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, avatar_url, reputation_level, reputation_score')
        .eq('id', user.id)
        .maybeSingle();
      const name = (profile as { display_name?: string } | null)?.display_name?.trim();
      const emailPart = user.email?.split('@')[0] ?? '';
      setDisplayName(name || emailPart || null);
      setReputationLevel((profile as { reputation_level?: number } | null)?.reputation_level ?? 1);
      setReputationScore((profile as { reputation_score?: number } | null)?.reputation_score ?? 0);

      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .in('role', ['owner', 'admin', 'moderator']);
      const roleList = (roles ?? []) as { role: string }[];
      setCanAccessModeration(roleList.length > 0);
    };
    loadProfileAndRole();
  }, [user?.id]);

  const userName = displayName ?? user?.email?.split('@')[0] ?? 'Usuario';

  const [isMd, setIsMd] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)');
    const set = () => setIsMd(mql.matches);
    set();
    mql.addEventListener('change', set);
    return () => mql.removeEventListener('change', set);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    if (showUserMenu) document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showUserMenu]);

  const deleteNotifications = useCallback(
    async (ids: string[]) => {
      if (!session?.access_token || ids.length === 0) return;
      try {
        await Promise.all(
          ids.map((id) =>
            fetch('/api/notifications', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
              body: JSON.stringify({ id }),
            })
          )
        );
        setNotifications((prev) => {
          const removedUnread = prev.filter((n) => ids.includes(n.id) && !n.read_at).length;
          setUnreadCount((c) => Math.max(0, c - removedUnread));
          return prev.filter((n) => !ids.includes(n.id));
        });
      } catch {
        // ignore
      }
    },
    [session?.access_token]
  );

  useEffect(() => {
    if (authLoading || !user?.id || !session?.access_token) {
      setNotifications([]);
      setUnreadCount(0);
      loadNotifSoundPrimedRef.current = false;
      return;
    }
    const load = async () => {
      try {
        const res = await fetch('/api/notifications', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const list = data.notifications ?? [];
        const newUnread = data.unreadCount ?? 0;
        setNotifications(list);
        setUnreadCount((prev) => {
          if (loadNotifSoundPrimedRef.current && newUnread > prev) {
            playNotificationDropSound();
          }
          loadNotifSoundPrimedRef.current = true;
          return newUnread;
        });
      } catch {
        // ignore
      }
    };
    load();
    const interval = setInterval(load, 60 * 1000);
    return () => clearInterval(interval);
  }, [authLoading, user?.id, session?.access_token]);

  useEffect(() => {
    const loadAnnouncements = async () => {
      try {
        const res = await fetch('/api/announcements');
        if (!res.ok) return;
        const data = await res.json();
        setAnnouncements(data.announcements ?? []);
      } catch {
        // ignore
      }
    };
    loadAnnouncements();
  }, []);

  const UserMenuContent = () => (
    <>
      <button
        onClick={() => { openGuideModal(); setShowUserMenu(false); }}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors duration-150"
      >
        <HelpCircle className="h-4 w-4 text-violet-600 dark:text-violet-400" />
        Guía
      </button>
      <button
        onClick={() => { toggleTheme(); setShowUserMenu(false); }}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors duration-150"
      >
        {isDark ? (
          <>
            <Sun className="h-4 w-4 text-amber-500" />
            Modo claro
          </>
        ) : (
          <>
            <Moon className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            Modo oscuro
          </>
        )}
      </button>
    </>
  );

  return (
    <nav className="absolute top-0 right-0 z-50 p-3 md:p-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="flex items-center gap-2 md:gap-3">
        {user && isMd && (
          <div className="flex flex-col items-end">
            <p
              className={
                isHomePage
                  ? 'text-sm md:text-base font-medium text-white'
                  : 'text-sm md:text-base font-medium text-gray-600 dark:text-white/90'
              }
            >
              Hola de nuevo
            </p>
            <p
              className={
                isHomePage
                  ? 'text-base md:text-lg font-semibold text-white border-b-2 border-white/70 pb-0.5'
                  : 'text-base md:text-lg font-semibold text-gray-900 dark:text-white/95 border-b-2 border-gray-300 dark:border-white/30 pb-0.5'
              }
            >
              {userName}
            </p>
          </div>
        )}
        <AnimatePresence mode="wait">
          {user && (
            <motion.button
              key="bell"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative rounded-full p-2.5 md:p-3 text-[#6e6e73] dark:text-[#a3a3a3] hover:bg-[#f5f5f7] dark:hover:bg-[#1a1a1a] transition-colors duration-200"
              aria-label={unreadCount > 0 ? `Notificaciones (${unreadCount} sin leer)` : 'Notificaciones'}
            >
              <Bell className="h-5 w-5 md:h-6 md:w-6" />
              {unreadCount > 0 && (
                <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-violet-600 ring-2 ring-white dark:ring-[#141414]" title={`${unreadCount} sin leer`} aria-hidden />
              )}
            </motion.button>
          )}
        </AnimatePresence>
        <div className="relative flex items-center gap-2" ref={userMenuRef}>
          {!user ? (
            <>
            <button
              onClick={() => openRegisterModal('signup')}
              className="flex h-10 md:h-12 items-center rounded-full bg-gradient-to-r from-violet-600 to-violet-700 dark:from-violet-500 dark:to-violet-600 px-4 md:px-5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition-all duration-200 ease-[cubic-bezier(0.22,0.61,0.36,1)] hover:shadow-violet-500/40 hover:scale-[1.02] active:scale-[0.98]"
                aria-label="Crear cuenta"
              >
                Crear cuenta
              </button>
              <DarkModeToggle compact />
            </>
          ) : (
            <>
              <AnimatePresence mode="wait">
                <motion.button
                  key="avatar"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="block focus:outline-none rounded-full overflow-hidden"
                  aria-label="Menú de usuario"
                >
                  {userPhoto ? (
                    <img
                      src={userPhoto}
                      alt="Usuario"
                      className="h-11 w-11 md:h-14 md:w-14 rounded-full border-2 border-[#e5e5e7] dark:border-[#262626] object-cover"
                    />
                  ) : (
                    <div className="flex h-11 w-11 md:h-14 md:w-14 items-center justify-center rounded-full bg-[#E8E8ED] dark:bg-[#1a1a1a]">
                      <User className="h-5 w-5 md:h-7 md:w-7 text-[#6e6e73] dark:text-[#a3a3a3]" />
                    </div>
                  )}
                </motion.button>
              </AnimatePresence>
              {showUserMenu && (
                <div className="absolute right-0 top-full mt-2 z-50 min-w-44 rounded-2xl border border-[#e5e5e7] dark:border-[#262626] bg-white/95 dark:bg-[#141414]/95 backdrop-blur-xl shadow-xl py-1.5">
                  <Link
                    href="/me"
                    onClick={() => setShowUserMenu(false)}
                    className="flex flex-col gap-0.5 px-4 py-2.5 border-b border-[#e5e5e7] dark:border-[#262626] text-left hover:bg-violet-50/50 dark:hover:bg-violet-900/10 transition-colors"
                  >
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{userName}</span>
                    <span className="text-xs text-violet-600 dark:text-violet-400 font-medium">Nivel {reputationLevel} · {reputationScore} pts</span>
                  </Link>
                  <UserMenuContent />
                  {canAccessModeration && (
                    <Link
                      href="/admin/moderation"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors duration-150"
                      onClick={() => setShowUserMenu(false)}
                    >
                      <ShieldCheck className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                      Moderación
                    </Link>
                  )}
                  <Link
                    href="/extension"
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors duration-150"
                    onClick={() => setShowUserMenu(false)}
                  >
                    <Puzzle className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                    Extensión AVENTA
                  </Link>
                  <Link
                    href="/settings"
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors duration-150"
                    onClick={() => setShowUserMenu(false)}
                  >
                    <Settings className="h-4 w-4" />
                    Configuración
                  </Link>
                  <Link
                    href="/descubre"
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors duration-150"
                    onClick={() => setShowUserMenu(false)}
                  >
                    <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                    Descubre AVENTA
                  </Link>
                  <button
                    onClick={async () => {
                      setSignOutStatus('closing');
                      setShowUserMenu(false);
                      await signOut();
                      setSignOutStatus('closed');
                      setTimeout(() => setSignOutFading(true), 1500);
                      setTimeout(() => {
                        setSignOutStatus('idle');
                        setSignOutFading(false);
                      }, 1800);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors duration-150"
                  >
                    <LogOut className="h-4 w-4" />
                    Cerrar sesión
                  </button>
                </div>
              )}
              {signOutStatus !== 'idle' && (
                <div
                  className={`absolute right-0 top-full mt-2 z-50 min-w-[10rem] rounded-xl border border-[#e5e5e7] dark:border-[#262626] bg-white dark:bg-[#141414] px-4 py-3 shadow-xl text-sm text-[#1d1d1f] dark:text-[#fafafa] transition-opacity duration-200 ease-out ${
                    signOutFading ? 'opacity-0' : 'opacity-100'
                  }`}
                  role="status"
                  aria-live="polite"
                >
                  {signOutStatus === 'closing' ? 'Cerrando sesión…' : 'Sesión cerrada'}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showNotifications && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowNotifications(false)}
            aria-hidden
          />
          {/* Mobile: panel fijo ancho completo para que no se rompa a la derecha; desktop: igual que antes */}
          <div className="fixed left-0 right-0 top-[calc(env(safe-area-inset-top)+3.5rem)] bottom-0 z-50 flex flex-col overflow-hidden bg-white dark:bg-[#141414] border-t border-[#e5e5e7] dark:border-[#262626] md:absolute md:left-auto md:right-4 md:top-full md:bottom-auto md:mt-2 md:w-96 md:max-h-[75vh] md:rounded-2xl md:border md:shadow-2xl">
            <div className="flex gap-2 border-b border-[#e5e5e7] dark:border-[#262626] p-2 shrink-0">
              <button
                onClick={() => setNotifTab('ofertas')}
                className={`px-4 py-2.5 text-base font-semibold transition-colors duration-200 ease-out border-b-2 rounded-t-lg ${
                  notifTab === 'ofertas'
                    ? 'border-violet-600 dark:border-violet-400 text-violet-600 dark:text-violet-400'
                    : 'border-transparent text-[#6e6e73] dark:text-[#a3a3a3] hover:text-[#1d1d1f] dark:hover:text-[#fafafa]'
                }`}
              >
                Ofertas
              </button>
              <button
                onClick={() => setNotifTab('explorar')}
                className={`px-4 py-2.5 text-base font-semibold transition-colors duration-200 ease-out border-b-2 rounded-t-lg ${
                  notifTab === 'explorar'
                    ? 'border-violet-600 dark:border-violet-400 text-violet-600 dark:text-violet-400'
                    : 'border-transparent text-[#6e6e73] dark:text-[#a3a3a3] hover:text-[#1d1d1f] dark:hover:text-[#fafafa]'
                }`}
              >
                Explorar
              </button>
              <button
                onClick={() => setNotifTab('avisos')}
                className={`px-4 py-2.5 text-base font-semibold transition-colors duration-200 ease-out border-b-2 rounded-t-lg ${
                  notifTab === 'avisos'
                    ? 'border-violet-600 dark:border-violet-400 text-violet-600 dark:text-violet-400'
                    : 'border-transparent text-[#6e6e73] dark:text-[#a3a3a3] hover:text-[#1d1d1f] dark:hover:text-[#fafafa]'
                }`}
              >
                Avisos
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 min-h-0">
              {notifTab === 'ofertas' && (
                <>
                  {unreadCount > 0 && notifications.length > 0 && (
                    <div className="mb-3">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!session?.access_token) return;
                          try {
                            const res = await fetch('/api/notifications', {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                              body: JSON.stringify({}),
                            });
                            if (res.ok) {
                              setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
                              setUnreadCount(0);
                            }
                          } catch {
                            // ignore
                          }
                        }}
                        className="text-sm font-medium text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300"
                      >
                        Marcar todas como leídas
                      </button>
                    </div>
                  )}
                  {notifications.length === 0 ? (
                    <p className="text-base text-gray-500 dark:text-gray-400">Ninguna notificación.</p>
                  ) : (
                    <ul className="space-y-3">
                      {(() => {
                        const likeKey = (n: NotificationItem) => (n.type === 'offer_like' && n.link ? n.link : null);
                        const likeGroups = new Map<string, NotificationItem[]>();
                        for (const n of notifications) {
                          const key = likeKey(n);
                          if (key !== null) {
                            const list = likeGroups.get(key) ?? [];
                            list.push(n);
                            likeGroups.set(key, list);
                          }
                        }
                        const items: { ids: string[]; display: NotificationItem }[] = [];
                        likeGroups.forEach((list) => {
                          const sorted = [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                          const latest = sorted[0];
                          if (list.length === 1) {
                            items.push({ ids: [latest.id], display: latest });
                          } else {
                            const names = sorted.map((n) => (n.body && n.body.includes(' dio like') ? n.body.replace(/ dio like.*/, '').trim() : 'Alguien'));
                            const uniq = [...new Set(names)];
                            const text = uniq.length <= 2 ? uniq.join(' y ') : `${uniq[0]}, ${uniq[1]} y ${list.length - 2} más`;
                            items.push({
                              ids: sorted.map((x) => x.id),
                              display: { ...latest, body: `${text} dieron like a tu oferta`, title: 'Nuevos likes' },
                            });
                          }
                        });
                        const others = notifications.filter((n) => likeKey(n) === null);
                        const all = [...items, ...others.map((n) => ({ ids: [n.id], display: n }))];
                        const sortedItems = all.sort((a, b) => new Date(b.display.created_at).getTime() - new Date(a.display.created_at).getTime());
                        return sortedItems.map(({ ids, display: n }) => {
                          const isMilestoneLikes = n.type === 'offer_likes_milestone';
                          const isUnread = ids.some((nid) => {
                            const row = notifications.find((x) => x.id === nid);
                            return row && !row.read_at;
                          });
                          return (
                            <li key={ids[0]} className="relative group">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  void deleteNotifications(ids);
                                }}
                                className="absolute right-2 top-2 z-10 rounded-lg p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/25 transition-colors opacity-80 group-hover:opacity-100"
                                aria-label="Eliminar notificación"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                              <a
                                href={n.link || '#'}
                                onClick={async () => {
                                  const toMark = ids.filter((id) => !notifications.find((x) => x.id === id)?.read_at);
                                  if (toMark.length > 0 && session?.access_token) {
                                    try {
                                      await Promise.all(
                                        toMark.map((id) =>
                                          fetch('/api/notifications', {
                                            method: 'PATCH',
                                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                                            body: JSON.stringify({ id }),
                                          })
                                        )
                                      );
                                      setNotifications((prev) =>
                                        prev.map((x) => (ids.includes(x.id) ? { ...x, read_at: new Date().toISOString() } : x))
                                      );
                                      setUnreadCount((c) => Math.max(0, c - toMark.length));
                                    } catch {
                                      // ignore
                                    }
                                  }
                                  setShowNotifications(false);
                                }}
                                className={`block rounded-2xl pl-3.5 pr-12 py-3.5 text-base border transition-all shadow-sm ${
                                  isUnread
                                    ? 'border-sky-300/70 dark:border-sky-600/50 bg-gradient-to-br from-sky-50/95 via-white to-violet-50/40 dark:from-sky-950/40 dark:via-[#141414] dark:to-violet-950/20 text-[#1d1d1f] dark:text-[#fafafa]'
                                    : 'border-gray-200/90 dark:border-gray-700 text-gray-500 dark:text-gray-400 bg-gray-50/60 dark:bg-gray-800/40'
                                }`}
                              >
                                <div className="flex gap-2.5 items-start">
                                  {isMilestoneLikes ? (
                                    <span className="flex shrink-0 items-center gap-0.5 mt-0.5" aria-hidden>
                                      <Heart
                                        className={`h-4 w-4 ${isUnread ? 'text-pink-500 fill-pink-500/35' : 'text-pink-400/80 fill-pink-400/20'}`}
                                      />
                                      <Heart
                                        className={`h-4 w-4 -ml-1 ${isUnread ? 'text-pink-500 fill-pink-500/50' : 'text-pink-400/80 fill-pink-400/25'}`}
                                      />
                                    </span>
                                  ) : (
                                    <Droplet
                                      className={`h-4 w-4 shrink-0 mt-0.5 ${isUnread ? 'text-sky-500 dark:text-sky-400' : 'text-gray-300 dark:text-gray-600'}`}
                                      aria-hidden
                                    />
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <span className="font-semibold text-[15px]">{n.title}</span>
                                    {n.body && <p className="mt-1 text-sm opacity-90 leading-snug">{n.body}</p>}
                                    {isMilestoneLikes && n.link && (
                                      <p className="mt-2 text-sm font-semibold text-violet-600 dark:text-violet-400">
                                        Ver los likes de tu oferta →
                                      </p>
                                    )}
                                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">
                                      {new Date(n.created_at).toLocaleDateString('es-MX', {
                                        day: 'numeric',
                                        month: 'short',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}
                                    </p>
                                  </div>
                                </div>
                              </a>
                            </li>
                          );
                        });
                      })()}
                    </ul>
                  )}
                </>
              )}
              {notifTab === 'explorar' && (
                <div className="rounded-2xl border border-[#e5e5e7] dark:border-[#333] bg-gray-50/80 dark:bg-gray-800/40 p-4">
                  <div className="flex gap-3 items-start">
                    <Compass className="h-5 w-5 shrink-0 text-violet-600 dark:text-violet-400 mt-0.5" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Descubre AVENTA</p>
                      <p className="mt-1 text-sm text-[#6e6e73] dark:text-[#a3a3a3] leading-relaxed">
                        Novedades, guías y cómo sacarle más provecho a la plataforma.
                      </p>
                      <Link
                        href="/descubre"
                        onClick={() => setShowNotifications(false)}
                        className="mt-3 inline-flex text-sm font-semibold text-violet-600 dark:text-violet-400 hover:underline"
                      >
                        Ir a Descubre →
                      </Link>
                    </div>
                  </div>
                </div>
              )}
              {notifTab === 'avisos' && (
                <ul className="space-y-3">
                  {announcements.length === 0 && (
                    <li className="rounded-xl border border-dashed border-[#e5e5e7] dark:border-[#333] p-4 text-center">
                      <p className="text-sm text-[#6e6e73] dark:text-[#a3a3a3]">
                        No hay avisos del equipo por ahora. Puedes ver todas las funciones en el menú de tu foto:{' '}
                        <span className="font-medium text-violet-600 dark:text-violet-400">Descubre AVENTA</span>.
                      </p>
                    </li>
                  )}
                  {announcements.map((a) => (
                    <li key={a.id}>
                      <Link
                        href={a.link || '#'}
                        onClick={() => setShowNotifications(false)}
                        className="block rounded-xl p-3 text-base transition-colors text-[#1d1d1f] dark:text-[#fafafa] hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      >
                        <span className="font-semibold">{a.title}</span>
                        {a.body && <p className="mt-1 text-sm opacity-90">{a.body}</p>}
                        <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">{new Date(a.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </nav>
  );
}
