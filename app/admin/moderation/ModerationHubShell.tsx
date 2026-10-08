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
    return pathname === '/admin/moderation' || pathname === '/admin/moderation/' || pathname.startsWith('/admin/moderation/hunter');
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
    <div className="space-y-4 pb-6">
      <header className="flex flex-col gap-3">
        {!focusPending ? (
          <div>
            <h1
              className={cn(
                'text-2xl font-semibold tracking-tight',
                isWorkspace ? 'text-gray-900 dark:text-white' : 'text-white'
              )}
            >
              Moderación
            </h1>
            <p className={cn('mt-0.5 text-sm', isWorkspace ? 'text-gray-500 dark:text-white/45' : 'text-white/45')}>
              Revisa ofertas, comentarios y reportes.
            </p>
          </div>
        ) : null}
        <nav className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide" aria-label="Secciones de moderación">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <Link
                key={tab.id}
                href={tab.href}
                className={cn(
                  'inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition',
                  active ? accent.tabActive : accent.tabIdle
                )}
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

export { ADMIN_MODERATION_TABS as MODERATION_HUB_TABS } from '@/lib/moderation/hubConfig';
