'use client';

import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { User, LogOut, Moon, Sun, Settings, ShieldCheck, Users } from 'lucide-react';
import DarkModeToggle from './DarkModeToggle';
import NotificationCenter from './notifications/NotificationCenter';
import { useState, useEffect, useRef } from 'react';
import { useTheme } from '@/app/providers/ThemeProvider';
import { useAuth } from '@/app/providers/AuthProvider';
import { useUI } from '@/app/providers/UIProvider';
import { readCachedDisplayName, writeCachedDisplayName } from '@/lib/profileDisplayName';

type ProfileMenuLink = { id: string; href: string; label: string };

export default function Navbar() {
  const { isDark, toggleTheme } = useTheme();
  const { user, session, signOut, isLoading: authLoading } = useAuth();
  const { openRegisterModal } = useUI();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [signOutStatus, setSignOutStatus] = useState<'idle' | 'closing' | 'closed'>('idle');
  const [signOutFading, setSignOutFading] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const userPhoto = user?.user_metadata?.avatar_url ?? null;
  const [displayName, setDisplayName] = useState<string | null>(() =>
    user?.id ? readCachedDisplayName(user.id) : null,
  );
  const [menuLinks, setMenuLinks] = useState<ProfileMenuLink[]>([]);
  const [reputationLevel, setReputationLevel] = useState<number>(1);
  const [reputationScore, setReputationScore] = useState<number>(0);

  useEffect(() => {
    if (!user?.id) {
      setDisplayName(null);
      setMenuLinks([]);
      setReputationLevel(1);
      setReputationScore(0);
      return;
    }
    const cached = readCachedDisplayName(user.id);
    if (cached) setDisplayName(cached);
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
      const nextName = name || emailPart || null;
      setDisplayName(nextName);
      if (nextName) writeCachedDisplayName(user.id, nextName);
      setReputationLevel((profile as { reputation_level?: number } | null)?.reputation_level ?? 1);
      setReputationScore((profile as { reputation_score?: number } | null)?.reputation_score ?? 0);
    };
    let cancelled = false;
    const loadMenu = async () => {
      const response = await fetch('/api/team/menu', { credentials: 'same-origin', cache: 'no-store' });
      if (cancelled) return;
      if (!response.ok) {
        setMenuLinks([]);
        return;
      }
      const body = (await response.json()) as { links?: ProfileMenuLink[] };
      if (cancelled) return;
      setMenuLinks(Array.isArray(body.links) ? body.links : []);
    };
    loadProfileAndRole();
    loadMenu();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const userName = displayName || (user ? '' : 'Usuario');

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

  const UserMenuContent = () => (
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
  );

  return (
    <nav className="aventa-public-navbar absolute top-0 right-0 z-50 p-3 md:p-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="flex items-center gap-2 md:gap-3">
        {user && isMd && (
          <p className="hidden lg:block text-sm font-medium text-[#1d1d1f] dark:text-[#fafafa]">
            Hola, {userName}
          </p>
        )}
        {user && !authLoading && session?.access_token ? <NotificationCenter key={user.id} /> : null}
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
                  {menuLinks.map((link) => (
                    <Link
                      key={link.id}
                      href={link.href}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors duration-150"
                      onClick={() => setShowUserMenu(false)}
                    >
                      {link.id === 'mine' ? (
                        <Users className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <ShieldCheck className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                      )}
                      {link.label}
                    </Link>
                  ))}
                  <Link
                    href="/settings"
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors duration-150"
                    onClick={() => setShowUserMenu(false)}
                  >
                    <Settings className="h-4 w-4" />
                    Configuración
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
    </nav>
  );
}
