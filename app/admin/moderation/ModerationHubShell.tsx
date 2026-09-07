'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  getModerationTabs,
  resolveModerationTabId,
  type ModerationHubMode,
} from '@/lib/moderation/hubConfig';
import { cn } from '@/app/components/panel/utils';

type Props = {
  children: ReactNode;
  mode?: ModerationHubMode;
};

function isFocusPendingPath(pathname: string, mode: ModerationHubMode): boolean {
  if (mode === 'admin') {
    return pathname === '/admin/moderation' || pathname === '/admin/moderation/';
  }
  return (
    pathname === '/equipo/moderacion' ||
    pathname === '/equipo/moderacion/' ||
    pathname.startsWith('/equipo/moderacion/bot') ||
    pathname.startsWith('/equipo/moderacion/cazadores')
  );
}

export default function ModerationHubShell({ children, mode = 'admin' }: Props) {
  const pathname = usePathname();
  const isWorkspace = mode === 'workspace';

  if (!isWorkspace && pathname.startsWith('/admin/moderation/bans')) {
    return <>{children}</>;
  }

  const tabs = getModerationTabs(mode);
  const activeTab = resolveModerationTabId(pathname, mode);
  const focusPending = isFocusPendingPath(pathname, mode);

  const accent = isWorkspace
    ? {
        border: 'border-emerald-500/20',
        tabActive: 'bg-emerald-600 text-white dark:bg-emerald-500',
        tabIdle:
          'bg-white/80 dark:bg-white/[0.04] text-gray-600 dark:text-gray-400 border border-black/[0.06] dark:border-white/[0.08] hover:border-emerald-300 dark:hover:border-emerald-700',
      }
    : {
        border: 'border-white/[0.08]',
        tabActive: 'bg-violet-500 text-white',
        tabIdle:
          'bg-white/[0.04] text-white/50 border border-white/[0.08] hover:border-violet-400/40 hover:text-white/80',
      };

  return (
    <div className="space-y-3 pb-4 md:space-y-4 md:pb-6">
      <header className={cn('rounded-2xl border px-3 py-3 md:px-5 md:py-4', accent.border)}>
        {!focusPending ? (
          <div className="mb-3">
            <h1
              className={cn(
                'text-lg font-semibold tracking-tight md:text-xl',
                isWorkspace ? 'text-gray-900 dark:text-gray-100' : 'text-white/90'
              )}
            >
              Moderación
            </h1>
          </div>
        ) : null}

        <nav
          className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-hide -mx-1 px-1"
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
                  'inline-flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-2 text-[11px] font-semibold transition-all md:gap-2 md:px-3 md:text-xs',
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
      </header>

      <div>{children}</div>
    </div>
  );
}

export { ADMIN_MODERATION_TABS as MODERATION_HUB_TABS } from '@/lib/moderation/hubConfig';
