'use client';

import { useRef, type ComponentType, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, UsersRound } from 'lucide-react';
import { cn } from '@/app/components/panel/utils';
import { HEALTH_STYLE, HealthPill, Panel, SkeletonRows } from './ui';
import type { TeamStatus } from './derive';
import type { TeamId } from './types';
import { TeamLevelContext } from './teams/TeamBody';

export type TeamTab = {
  id: TeamId;
  label: string;
  icon: ComponentType<{ className?: string }>;
  status: TeamStatus;
  render: () => ReactNode;
};

export default function TeamCarousel({
  teams,
  active,
  loading,
  onChange,
}: {
  teams: TeamTab[];
  active: TeamId;
  loading: boolean;
  onChange: (id: TeamId) => void;
}) {
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const idx = Math.max(0, teams.findIndex((t) => t.id === active));
  const current = teams[idx];

  const go = (nextIdx: number, focus: boolean) => {
    const n = (nextIdx + teams.length) % teams.length;
    const id = teams[n].id;
    onChange(id);
    const el = tabRefs.current[id];
    if (el) {
      el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      if (focus) el.focus();
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(idx + 1, true);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(idx - 1, true);
    } else if (e.key === 'Home') {
      e.preventDefault();
      go(0, true);
    } else if (e.key === 'End') {
      e.preventDefault();
      go(teams.length - 1, true);
    }
  };

  return (
    <Panel
      id="equipos"
      title="Equipos"
      icon={UsersRound}
      subtitle="Detecta qué equipo está involucrado, ábrelo y decide: delegar, revisar o investigar."
      action={
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => go(idx - 1, false)}
            className="rounded-lg border border-white/[0.08] p-1.5 text-white/60 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
            aria-label={`Equipo anterior: ${teams[(idx - 1 + teams.length) % teams.length].label}`}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[3rem] text-center text-[11px] tabular-nums text-white/40">
            {idx + 1} / {teams.length}
          </span>
          <button
            type="button"
            onClick={() => go(idx + 1, false)}
            className="rounded-lg border border-white/[0.08] p-1.5 text-white/60 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
            aria-label={`Equipo siguiente: ${teams[(idx + 1) % teams.length].label}`}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      }
    >
      <div
        role="tablist"
        aria-label="Equipos de Aventa"
        onKeyDown={onKeyDown}
        className="-mx-1 mb-4 flex snap-x snap-mandatory gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-hide"
      >
        {teams.map((t) => {
          const selected = t.id === active;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              id={`team-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`team-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => go(teams.indexOf(t), false)}
              className={cn(
                'flex shrink-0 snap-start items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60',
                selected
                  ? 'border-violet-400/35 bg-violet-500/15 text-white'
                  : 'border-white/[0.06] bg-white/[0.02] text-white/55 hover:bg-white/[0.05] hover:text-white/85',
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {t.label}
              <span className={cn('h-1.5 w-1.5 rounded-full', HEALTH_STYLE[t.status.level].dot)} aria-label={HEALTH_STYLE[t.status.level].label} />
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`team-panel-${current.id}`} aria-labelledby={`team-tab-${current.id}`} tabIndex={0} className="focus-visible:outline-none">
        {loading ? (
          <SkeletonRows rows={3} />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <HealthPill level={current.status.level} />
              <p className="text-xs text-white/55">{current.status.reason}</p>
            </div>
            <TeamLevelContext.Provider value={current.status.level}>{current.render()}</TeamLevelContext.Provider>
          </>
        )}
      </div>
    </Panel>
  );
}
