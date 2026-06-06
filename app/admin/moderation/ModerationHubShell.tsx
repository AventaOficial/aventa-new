'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CheckCircle,
  ClipboardList,
  Flag,
  MessageCircle,
  Shield,
  XCircle,
} from 'lucide-react';
import type { ReactNode } from 'react';

export const MODERATION_HUB_TABS = [
  {
    id: 'pending',
    href: '/admin/moderation',
    label: 'Pendientes',
    icon: ClipboardList,
    exact: true,
  },
  {
    id: 'approved',
    href: '/admin/moderation/approved',
    label: 'Aprobadas',
    icon: CheckCircle,
  },
  {
    id: 'rejected',
    href: '/admin/moderation/rejected',
    label: 'Rechazadas',
    icon: XCircle,
  },
  {
    id: 'comments',
    href: '/admin/moderation/comments',
    label: 'Comentarios',
    icon: MessageCircle,
  },
  {
    id: 'reports',
    href: '/admin/moderation/reports',
    label: 'Reportes',
    icon: Flag,
  },
] as const;

export function resolveModerationHubTab(pathname: string): (typeof MODERATION_HUB_TABS)[number]['id'] {
  if (pathname === '/admin/reports' || pathname.startsWith('/admin/moderation/reports')) return 'reports';
  if (pathname.startsWith('/admin/moderation/approved')) return 'approved';
  if (pathname.startsWith('/admin/moderation/rejected')) return 'rejected';
  if (pathname.startsWith('/admin/moderation/comments')) return 'comments';
  return 'pending';
}

export default function ModerationHubShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname.startsWith('/admin/moderation/bans')) {
    return <>{children}</>;
  }

  const activeTab = resolveModerationHubTab(pathname);

  return (
    <div className="space-y-6">
      <header className="rounded-[28px] border border-violet-200/70 dark:border-violet-900/50 bg-gradient-to-br from-violet-50/90 via-white to-slate-50 dark:from-violet-950/30 dark:via-[#151517] dark:to-[#101012] px-5 py-5 md:px-7 md:py-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400">
              <Shield className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                Contenido · AVENTA
              </p>
              <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
                Centro de moderación
              </h1>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 max-w-xl">
                Un solo lugar para revisar ofertas, comentarios y reportes de la comunidad.
              </p>
            </div>
          </div>
        </div>

        <nav
          className="mt-5 flex gap-1 overflow-x-auto pb-0.5 scrollbar-hide -mx-1 px-1"
          aria-label="Secciones de moderación"
        >
          {MODERATION_HUB_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <Link
                key={tab.id}
                href={tab.href}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all ${
                  active
                    ? 'bg-violet-600 text-white shadow-sm dark:bg-violet-500'
                    : 'bg-white/80 dark:bg-[#1a1a1a]/80 text-gray-600 dark:text-gray-400 border border-gray-200/80 dark:border-gray-700 hover:border-violet-300 dark:hover:border-violet-700 hover:text-violet-700 dark:hover:text-violet-300'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <div>{children}</div>
    </div>
  );
}
