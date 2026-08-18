'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
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
import {
  ROLES,
  ROLE_LABELS,
  pickEffectiveRole,
  type Role,
} from '@/lib/admin/roles';
import { listStaffDepartmentsForRole } from '@/lib/staff/permissions';
import type { StaffDepartmentMeta } from '@/lib/staff/permissions';
import { staffHomePathForRole } from '@/lib/staff/roleRouting';

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
      className={`flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-sm font-medium transition-all ${
        active
          ? 'bg-emerald-100/90 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200'
          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100/80 dark:hover:bg-gray-900'
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export default function StaffShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<Role | null>(null);
  const [ready, setReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        setReady(true);
        return;
      }
      supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          setDisplayName((data as { display_name?: string } | null)?.display_name ?? null);
        });
      supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .in('role', [...ROLES])
        .then(({ data }) => {
          const roles = ((data ?? []) as { role: Role }[]).map((x) => x.role);
          const r = pickEffectiveRole(roles);
          setRole(r);
          setReady(true);
          if (!r) router.replace('/');
        });
    });
  }, [router]);

  const departments = listStaffDepartmentsForRole(role);
  const isActive = (href: string) =>
    href === '/equipo' ? pathname === '/equipo' : pathname === href || pathname.startsWith(`${href}/`);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F0FDF4] dark:bg-[#0a0f0c]">
        <p className="text-gray-500">Cargando hub de equipo…</p>
      </div>
    );
  }

  if (!role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F0FDF4] dark:bg-[#0a0f0c]">
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
    <div className="min-h-screen bg-[#F0FDF4] dark:bg-[#0a0f0c] flex">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 bg-white/95 dark:bg-[#111813]/95 backdrop-blur-xl border-r border-emerald-200/60 dark:border-emerald-900/40 transform transition-transform lg:translate-x-0 lg:static ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between px-5 border-b border-emerald-100 dark:border-emerald-900/50">
          <Link href={staffHomePathForRole(role)} className="font-semibold text-emerald-800 dark:text-emerald-300">
            Equipo AVENTA
          </Link>
          <button type="button" className="lg:hidden p-2" onClick={() => setSidebarOpen(false)} aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-3 space-y-1">
          <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-600/80">
            {ROLE_LABELS[role]}
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
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-emerald-100 dark:border-emerald-900/40 text-xs text-gray-500 space-y-2">
          {displayName ? <p className="truncate">{displayName}</p> : null}
          {(role === 'owner' || role === 'admin') && (
            <Link href="/admin" className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 hover:underline">
              <Shield className="h-3 w-3" />
              Panel admin
            </Link>
          )}
          <Link href="/" className="block hover:underline">
            Sitio público
          </Link>
        </div>
      </aside>

      {sidebarOpen ? (
        <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setSidebarOpen(false)} aria-hidden />
      ) : null}

      <main className="flex-1 min-w-0">
        <div className="sticky top-0 z-20 flex h-14 items-center gap-2 px-4 bg-[#F0FDF4]/90 dark:bg-[#0a0f0c]/90 backdrop-blur border-b border-emerald-100 dark:border-emerald-900/40 lg:hidden">
          <button type="button" onClick={() => setSidebarOpen(true)} className="p-2" aria-label="Menú">
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-medium">Equipo AVENTA</span>
        </div>
        <div className="p-4 lg:p-8 max-w-6xl mx-auto w-full">{children}</div>
      </main>
    </div>
  );
}
