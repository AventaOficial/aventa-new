'use client';

import type { ComponentType, ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays,
  CircleDollarSign,
  LayoutDashboard,
  Server,
  Shield,
  Tag,
  Target,
  Users,
  UsersRound,
  Wallet,
  Zap,
} from 'lucide-react';
import { cn } from '@/app/components/panel/utils';

const NAV: { href: string; label: string; icon: ComponentType<{ className?: string }>; match?: string }[] = [
  { href: '/admin/owner', label: 'Vista general', icon: LayoutDashboard },
  { href: '/admin/owner/vista/ingresos', label: 'Ingresos estimados', icon: CircleDollarSign },
  { href: '/admin/owner/vista/comunidad', label: 'Actividad de la comunidad', icon: UsersRound },
  { href: '/admin/owner/vista/usuarios', label: 'Usuarios en tiempo real', icon: Users },
  { href: '/admin/owner/vista/ofertas', label: 'Ofertas publicadas', icon: Tag },
  { href: '/admin/owner/vista/equipos/moderacion', label: 'Equipo de moderación', icon: Shield, match: '/admin/owner/vista/equipos' },
  { href: '/admin/owner/vista/pagos', label: 'Pagos pendientes', icon: Wallet },
  { href: '/admin/owner/vista/capacidad', label: 'Capacidad de Aventa', icon: Server },
  { href: '/admin/owner/vista/temporada', label: 'Siguiente temporada', icon: CalendarDays },
  { href: '/admin/owner/vista/metas', label: 'Metas del día', icon: Target },
  { href: '/admin/owner/vista/prioridades', label: 'Prioridades del CEO', icon: Zap },
];

export default function VistaShell({
  title,
  subtitle,
  crumb,
  toolbar,
  children,
}: {
  title: string;
  subtitle: string;
  crumb: string;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  const path = usePathname();
  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)]">
      <aside className="sticky top-0 hidden h-[calc(100dvh-3.5rem)] w-[232px] shrink-0 flex-col overflow-y-auto border-r border-white/[0.06] bg-[#0c0c16] px-3 py-4 lg:flex">
        <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">CEO Dashboard</p>
        <nav aria-label="Secciones del CEO" className="flex flex-col gap-0.5">
          {NAV.map((item) => {
            const active = item.match ? path.startsWith(item.match) : path === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[12.5px] font-medium transition-colors',
                  active ? 'bg-violet-600/25 text-white' : 'text-white/55 hover:bg-white/[0.04] hover:text-white/85',
                )}
              >
                <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-violet-300' : 'text-white/40')} aria-hidden />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="min-w-0 flex-1 px-4 py-4 lg:px-5 lg:py-5">
        <p className="sr-only">Cifras del período cargadas desde la operación. Un valor vacío significa que el dato no está disponible.</p>
        <p className="text-[11px] text-white/40">
          <Link href="/admin/owner" className="hover:text-white/70">
            CEO Dashboard
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-white/70">{crumb}</span>
        </p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[26px] font-semibold tracking-tight text-white">{title}</h1>
            <p className="mt-0.5 text-[13px] text-white/50">{subtitle}</p>
          </div>
          {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}
        </div>
        <div className="mt-4 space-y-3">{children}</div>
      </div>
    </div>
  );
}
