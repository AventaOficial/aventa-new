import Link from 'next/link';
import type { ReactNode } from 'react';
import { teamMetadata } from '@/lib/team/config/catalog';
import type { TeamShellContext } from '@/lib/team/config/types';
import { TeamLogoutButton } from './TeamLogoutButton';
import { TeamMark } from './TeamMark';

function TeamLinks({
  context,
  className,
}: {
  context: TeamShellContext;
  className: string;
}) {
  return (
    <nav className={className} aria-label="Área del equipo">
      {context.navigation.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className="rounded-full px-3 py-1.5 text-sm font-medium text-[#1d1d1f] dark:text-[#fafafa]"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function TeamSwitcher({ context, className }: { context: TeamShellContext; className: string }) {
  if (context.switcher.length < 2) return null;
  return (
    <nav className={className} aria-label="Cambiar de equipo">
      {context.switcher.map((entry) => (
        <Link
          key={entry.teamId}
          href={`/team/${entry.teamId}`}
          aria-current={entry.current ? 'page' : undefined}
          className={`block rounded-xl px-3 py-2 text-sm ${
            entry.current
              ? 'bg-[#f5f5f7] font-medium text-[#1d1d1f] dark:bg-[#1c1c1c] dark:text-[#fafafa]'
              : 'text-[#424245] dark:text-[#a1a1a6]'
          }`}
        >
          <span className="block">{entry.displayName}</span>
          <span className="block text-xs text-[#737373]">{entry.roleLabel}</span>
        </Link>
      ))}
    </nav>
  );
}

export function TeamShell({ context, children }: { context: TeamShellContext; children: ReactNode }) {
  const metadata = teamMetadata(context.teamId);

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] dark:bg-[#0a0a0a] dark:text-[#fafafa]">
      <header className="flex items-center justify-between gap-3 border-b border-[#d2d2d7] bg-white px-4 py-3 md:hidden dark:border-[#2a2a2a] dark:bg-[#141414]">
        <div className="flex min-w-0 items-center gap-3">
          <TeamMark teamId={context.teamId} size="sm" />
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Aventa</p>
            <p className="truncate font-semibold">{metadata.displayName}</p>
          </div>
        </div>
        <TeamLogoutButton />
      </header>
      <TeamSwitcher
        context={context}
        className="flex gap-2 overflow-x-auto border-b border-[#d2d2d7] bg-white px-3 py-2 md:hidden dark:border-[#2a2a2a] dark:bg-[#141414]"
      />

      <div className="md:grid md:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden md:flex md:min-h-screen md:flex-col md:border-r md:border-[#d2d2d7] md:bg-white md:px-4 md:py-6 dark:md:border-[#2a2a2a] dark:md:bg-[#141414]">
          <div className="flex items-center gap-3">
            <TeamMark teamId={context.teamId} />
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Aventa</p>
              <p className="font-semibold">{metadata.displayName}</p>
            </div>
          </div>
          <TeamLinks context={context} className="mt-8 flex flex-col items-start gap-1" />
          <TeamSwitcher context={context} className="mt-8 flex flex-col gap-1" />
          <div className="mt-auto flex items-center justify-between gap-2 pt-8">
            <p className="truncate text-sm text-[#424245] dark:text-[#a1a1a6]">{context.personName}</p>
            <TeamLogoutButton />
          </div>
        </aside>

        <main className="px-4 py-6 md:px-10 md:py-10">
          <TeamLinks context={context} className="mb-6 flex gap-2 md:hidden" />
          {children}
        </main>
      </div>
    </div>
  );
}
