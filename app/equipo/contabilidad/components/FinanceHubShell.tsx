'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { FINANCE_TABS, resolveFinanceTab } from '@/lib/finance/hubConfig';
import { cn } from '@/app/components/panel/utils';

export default function FinanceHubShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const activeTab = resolveFinanceTab(pathname);

  return (
    <div className="space-y-5 pb-6">
      <header className="px-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6d5efc]">Panel del equipo</p>
        <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-gray-900 dark:text-gray-50">Contabilidad</h1>
        <p className="mt-1 max-w-xl text-sm text-[#8b8ea3]">
          Una lectura: periodo, settlement y obligación. El cierre viejo y el presupuesto futuro están aparte.
        </p>

        <nav
          className="mt-4 inline-flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-[#171824] p-1"
          aria-label="Contabilidad"
        >
          {FINANCE_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <Link
                key={tab.id}
                href={tab.href}
                className={cn(
                  'inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition-colors',
                  active ? 'bg-[#6d5efc] text-white' : 'text-white/70 hover:text-white'
                )}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </header>
      {children}
    </div>
  );
}
