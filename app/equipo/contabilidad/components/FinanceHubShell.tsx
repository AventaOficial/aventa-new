'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Calculator } from 'lucide-react';
import type { ReactNode } from 'react';
import { FINANCE_TABS, resolveFinanceTab } from '@/lib/finance/hubConfig';
import { cn } from '@/app/components/panel/utils';

export default function FinanceHubShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const activeTab = resolveFinanceTab(pathname);

  return (
    <div className="space-y-6 pb-6">
      <header className="rounded-2xl border border-amber-500/15 glass-light dark:glass-dark px-5 py-5 md:px-7 md:py-6 bg-gradient-to-br from-amber-500/8 via-white/80 to-white dark:from-amber-950/20 dark:via-[#141210] dark:to-[#0f0d0a]">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <Calculator className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-600/80 dark:text-amber-400/80">
              AVENTA Workspace
            </p>
            <h1 className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">
              Finance Command Center
            </h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 max-w-xl">
              Ledger de afiliados, conciliación y pagos a cazadores. Configuración global sigue en admin.
            </p>
          </div>
        </div>

        <nav className="mt-5 flex gap-1 overflow-x-auto pb-0.5 scrollbar-hide -mx-1 px-1" aria-label="Contabilidad">
          {FINANCE_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <Link
                key={tab.id}
                href={tab.href}
                className={cn(
                  'inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-200',
                  active
                    ? 'bg-amber-600 text-white shadow-sm dark:bg-amber-500'
                    : 'bg-white/80 dark:bg-white/[0.04] text-gray-600 dark:text-gray-400 border border-black/[0.06] dark:border-white/[0.08] hover:border-amber-300'
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
