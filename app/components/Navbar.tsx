'use client';

import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Bell, LogOut, HelpCircle, Moon, Sun, Settings, ShieldCheck } from 'lucide-react';
import DarkModeToggle from './DarkModeToggle';
import { useState, useEffect, useRef } from 'react';
import { useTheme } from '@/app/providers/ThemeProvider';
import { useAuth } from '@/app/providers/AuthProvider';
import { useUI } from '@/app/providers/UIProvider';

type NotifTab = 'ofertas' | 'comunidades' | 'avisos';

export default function Navbar() {
  const { isDark, toggleTheme } = useTheme();
  const { user, signOut } = useAuth();
  const { openRegisterModal, openGuideModal } = useUI();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [signOutStatus, setSignOutStatus] = useState<'idle' | 'closing' | 'closed'>('idle');
  const [signOutFading, setSignOutFading] = useState(false);
  const [notifTab, setNotifTab] = useState<NotifTab>('ofertas');
  const userMenuRef = useRef<HTMLDivElement>(null);

  const userPhoto = user?.user_metadata?.avatar_url ?? null;
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [canAccessModeration, setCanAccessModeration] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setDisplayName(null);
      setCanAccessModeration(false);
      return;
    }
    const loadProfileAndRole = async () => {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle();
      const name = profile?.display_name?.trim();
      const emailPart = user.email?.split('@')[0] ?? '';
      setDisplayName(name || emailPart || null);

      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .in('role', ['owner', 'admin', 'moderator']);
      setCanAccessModeration(Array.isArray(roles) && roles.length > 0);
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
            <p className="text-sm md:text-base font-medium text-white/90">Hola de nuevo</p>
            <p className="text-base md:text-lg font-semibold text-white/95 border-b-2 border-white/30 pb-0.5">{userName}</p>
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
              className="rounded-full p-2.5 md:p-3 text-[#6e6e73] dark:text-[#a3a3a3] hover:bg-[#f5f5f7] dark:hover:bg-[#1a1a1a] transition-colors duration-200"
              aria-label="Notificaciones"
            >
              <Bell className="h-5 w-5 md:h-6 md:w-6" />
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

      {showNotifications && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowNotifications(false)}
            aria-hidden
          />
          <div className="absolute right-4 top-full mt-2 z-50 w-80 max-h-[70vh] overflow-hidden rounded-2xl border border-[#e5e5e7] dark:border-[#262626] bg-white dark:bg-[#141414] shadow-2xl flex flex-col">
            <div className="flex gap-2 border-b border-[#e5e5e7] dark:border-[#262626] p-2 shrink-0">
              <button
                onClick={() => setNotifTab('ofertas')}
                className={`px-4 py-2 font-semibold transition-colors duration-200 ease-out border-b-2 rounded-t-lg ${
                  notifTab === 'ofertas'
                    ? 'border-violet-600 dark:border-violet-400 text-violet-600 dark:text-violet-400'
                    : 'border-transparent text-[#6e6e73] dark:text-[#a3a3a3] hover:text-[#1d1d1f] dark:hover:text-[#fafafa]'
                }`}
              >
                Ofertas
              </button>
              <button
                onClick={() => setNotifTab('comunidades')}
                className={`px-4 py-2 font-semibold transition-colors duration-200 ease-out border-b-2 rounded-t-lg ${
                  notifTab === 'comunidades'
                    ? 'border-violet-600 dark:border-violet-400 text-violet-600 dark:text-violet-400'
                    : 'border-transparent text-[#6e6e73] dark:text-[#a3a3a3] hover:text-[#1d1d1f] dark:hover:text-[#fafafa]'
                }`}
              >
                Comunidades
              </button>
              <button
                onClick={() => setNotifTab('avisos')}
                className={`px-4 py-2 font-semibold transition-colors duration-200 ease-out border-b-2 rounded-t-lg ${
                  notifTab === 'avisos'
                    ? 'border-violet-600 dark:border-violet-400 text-violet-600 dark:text-violet-400'
                    : 'border-transparent text-[#6e6e73] dark:text-[#a3a3a3] hover:text-[#1d1d1f] dark:hover:text-[#fafafa]'
                }`}
              >
                Avisos
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {notifTab === 'ofertas' && (
                <p className="text-sm text-gray-500 dark:text-gray-400">Ninguna oferta nueva.</p>
              )}
              {notifTab === 'comunidades' && (
                <p className="text-sm text-[#6e6e73] dark:text-[#a3a3a3]">Sin actividad en comunidades.</p>
              )}
              {notifTab === 'avisos' && (
                <p className="text-sm text-[#6e6e73] dark:text-[#a3a3a3]">No tienes avisos.</p>
              )}
            </div>
          </div>
        </>
      )}
    </nav>
  );
}
