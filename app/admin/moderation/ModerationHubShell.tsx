'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ClipboardList, Shield } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  getModerationTabs,
  resolveModerationTabId,
  type ModerationHubMode,
} from '@/lib/moderation/hubConfig';
import { cn } from '@/app/components/panel/utils';
import ModerationWorkspaceStats from './ModerationWorkspaceStats';

type Props = {
  children: ReactNode;
  mode?: ModerationHubMode;
};

export default function ModerationHubShell({ children, mode = 'admin' }: Props) {
  const pathname = usePathname();
  const isWorkspace = mode === 'workspace';

  if (!isWorkspace && pathname.startsWith('/admin/moderation/bans')) {
    return <>{children}</>;
  }

  const tabs = getModerationTabs(mode);
  const activeTab = resolveModerationTabId(pathname, mode);

  const accent = isWorkspace
    ? {
        border: 'border-emerald-500/20',
        gradient: 'from-emerald-500/10 via-white/80 to-white dark:from-emerald-950/20 dark:via-[#0f1411] dark:to-[#0a0f0c]',
        iconBg: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
        label: 'text-emerald-600 dark:text-emerald-400',
        tabActive: 'bg-emerald-600 text-white dark:bg-emerald-500',
        tabIdle:
          'bg-white/80 dark:bg-white/[0.04] text-gray-600 dark:text-gray-400 border border-black/[0.06] dark:border-white/[0.08] hover:border-emerald-300 dark:hover:border-emerald-700',
      }
    : {
        border: 'border-white/[0.08]',
        gradient: 'from-violet-500/12 via-transparent to-transparent',
        iconBg: 'bg-violet-500/15 text-violet-300',
        label: 'text-violet-300/80',
        tabActive: 'bg-violet-500 text-white',
        tabIdle:
          'bg-white/[0.04] text-white/50 border border-white/[0.08] hover:border-violet-400/40 hover:text-white/80',
      };

  return (
    <div className="space-y-4 pb-6 md:space-y-6 md:pb-6">
      <header
        className={cn(
          'rounded-2xl border px-4 py-4 md:px-7 md:py-6',
          accent.border,
          isWorkspace
            ? 'glass-light dark:glass-dark bg-gradient-to-br'
            : `glass-dark bg-gradient-to-br ${accent.gradient}`
        )}
      >
        <div className="flex flex-col gap-3 md:gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <div className={cn('flex h-10 w-10 md:h-11 md:w-11 shrink-0 items-center justify-center rounded-2xl', accent.iconBg)}>
              {isWorkspace ? <ClipboardList className="h-5 w-5" /> : <Shield className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <p className={cn('text-[10px] font-bold uppercase tracking-[0.16em]', accent.label)}>
                {isWorkspace ? 'AVENTA Workspace' : 'Contenido · AVENTA'}
              </p>
              <h1
                className={cn(
                  'text-lg md:text-2xl font-semibold tracking-tight',
                  isWorkspace ? 'text-gray-900 dark:text-gray-100' : 'text-white/90'
                )}
              >
                {isWorkspace ? 'Moderación' : 'Centro de moderación'}
              </h1>
              <p
                className={cn(
                  'mt-1 hidden text-sm max-w-xl md:block',
                  isWorkspace ? 'text-gray-600 dark:text-gray-400' : 'text-white/45'
                )}
              >
                {isWorkspace
                  ? 'Revisa ofertas: ve → decide → siguiente.'
                  : 'Revisa ofertas: ve → decide → siguiente.'}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-3 hidden md:block">{isWorkspace ? <ModerationWorkspaceStats /> : null}</div>

        <nav
          className="mt-3 md:mt-5 flex gap-1 overflow-x-auto pb-0.5 scrollbar-hide -mx-1 px-1"
          aria-label="Secciones de moderación"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <Link
                key={tab.id}
                href={tab.href}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 md:gap-2 rounded-xl px-2.5 py-2 md:px-3 text-[11px] md:text-xs font-semibold transition-all duration-200',
                  active ? accent.tabActive + ' shadow-sm' : accent.tabIdle
                )}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {tab.label}
              </Link>
            );
          })}
        </nav>

        {isWorkspace ? (
          <p className="mt-3 hidden text-[10px] text-gray-500 dark:text-gray-400 md:block">
            Atajos: <kbd className="rounded border px-1">/</kbd> buscar ·{' '}
            <kbd className="rounded border px-1">B</kbd> filtro bot ·{' '}
            <kbd className="rounded border px-1">Esc</kbd> limpiar selección
          </p>
        ) : null}
      </header>

      <div>{children}</div>
    </div>
  );
}

// Re-export for admin social tab (legacy)
export { ADMIN_MODERATION_TABS as MODERATION_HUB_TABS } from '@/lib/moderation/hubConfig';
