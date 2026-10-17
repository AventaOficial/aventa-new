'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Briefcase,
  Calculator,
  ClipboardList,
  LayoutDashboard,
  Megaphone,
  Menu,
  Shield,
  UserCog,
  Wrench,
  X,
} from 'lucide-react';
import type { Role } from '@/lib/admin/roles';
import type { EquipoContextResponse } from '@/lib/staff/equipoContextTypes';
import type { StaffDepartmentMeta } from '@/lib/staff/permissions';
import { getDefaultAdminHome } from '@/lib/admin/navigation';
import CountrySelector from '@/app/components/panel/CountrySelector';
import LoadingState from '@/app/components/panel/LoadingState';
import { cn } from '@/app/components/panel/utils';

const DEPT_ICONS: Record<string, typeof LayoutDashboard> = {
  home: LayoutDashboard,
  moderacion: ClipboardList,
  marketing: Megaphone,
  contabilidad: Calculator,
  operaciones: Wrench,
  gerencia: UserCog,
};

function NavItem({
  item,
  active,
  onNavigate,
}: {
  item: StaffDepartmentMeta;
  active: boolean;
  onNavigate: () => void;
}) {
  const Icon = DEPT_ICONS[item.id] ?? Briefcase;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
        active
          ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 shadow-sm'
          : 'text-gray-600 dark:text-gray-400 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] border border-transparent',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export default function StaffShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ctx, setCtx] = useState<EquipoContextResponse | null>(null);
  const [ready, setReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    fetch('/api/equipo/context', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          setCtx(null);
          return;
        }
        const data = (await res.json()) as EquipoContextResponse;
        setCtx(data);
      })
      .catch(() => setCtx(null))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready && !ctx) router.replace('/');
  }, [ready, ctx, router]);

  const departments = ctx?.departments ?? [];
  const role = ctx?.role ?? null;
  const homePath = ctx?.home_path ?? '/equipo';
  const isActive = (href: string) =>
    href === '/equipo' ? pathname === '/equipo' : pathname === href || pathname.startsWith(`${href}/`);

  if (!ready) {
    return (
      <div className="aventa-panel-route workspace-bg min-h-screen">
        <LoadingState message="Cargando workspace…" variant="light" />
      </div>
    );
  }

  if (!ctx || !role) {
    return (
      <div className="aventa-panel-route workspace-bg min-h-screen flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="font-medium text-gray-800 dark:text-gray-200">Sin acceso al hub de equipo</p>
          <Link href="/" className="text-sm text-emerald-600 hover:underline">
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="aventa-panel-route workspace-bg min-h-screen flex">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 glass-light dark:glass-dark border-r transform transition-transform duration-300 lg:translate-x-0 lg:static flex flex-col',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center justify-between px-4 border-b border-black/[0.05] dark:border-white/[0.06]">
          <Link href={homePath} className="group">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
              AVENTA
            </p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 -mt-0.5">Workspace</p>
          </Link>
          <button
            type="button"
            className="lg:hidden p-2 rounded-lg hover:bg-black/[0.04]"
            onClick={() => setSidebarOpen(false)}
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-3 flex-1 overflow-y-auto space-y-1">
          <p className="px-2 py-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-emerald-600/70 dark:text-emerald-400/70">
            {ctx.nav_label}
          </p>
          {departments.map((item) => (
            <NavItem
              key={item.id}
              item={item}
              active={isActive(item.href)}
              onNavigate={() => setSidebarOpen(false)}
            />
          ))}
        </div>

        <div className="p-3 border-t border-black/[0.05] dark:border-white/[0.06] text-xs text-gray-500 space-y-2">
          {ctx.display_name ? (
            <p className="truncate font-medium text-gray-700 dark:text-gray-300">{ctx.display_name}</p>
          ) : null}
          {ctx.is_owner && (
            <Link href="/admin/owner" className="inline-flex items-center gap-1 text-violet-600 dark:text-violet-400 hover:underline">
              <Shield className="h-3 w-3" />
              Founder OS
            </Link>
          )}
          {ctx.is_owner && (
            <Link
              href={getDefaultAdminHome('owner')}
              className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 hover:underline"
            >
              <Shield className="h-3 w-3" />
              Admin Control
            </Link>
          )}
          <Link href="/" className="block hover:underline">
            Sitio público
          </Link>
        </div>
      </aside>

      {sidebarOpen ? (
        <div
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      ) : null}

      <div className="flex flex-1 flex-col min-w-0">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-black/[0.05] dark:border-white/[0.06] bg-white/60 dark:bg-[#0a0f0c]/80 backdrop-blur-xl px-4 lg:px-6">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-lg hover:bg-black/[0.04]"
            aria-label="Menú"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
          <CountrySelector variant="light" className="hidden sm:block" />
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-8 lg:py-8">{children}</div>
        </main>

        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#0a0f0c]/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
          <div className="flex justify-around py-2">
            {departments.slice(0, 5).map((item) => {
              const Icon = DEPT_ICONS[item.id] ?? Briefcase;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={cn(
                    'flex flex-col items-center gap-0.5 px-2 py-1 min-w-0',
                    active ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400',
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-[9px] font-medium truncate max-w-[56px]">
                    {item.label.split(' ')[0]}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
