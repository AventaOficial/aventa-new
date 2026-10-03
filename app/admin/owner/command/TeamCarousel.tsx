'use client';

import { useRef, type ComponentType, type KeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronLeft, ChevronRight, UsersRound } from 'lucide-react';
import type { ActivityEvent } from '@/lib/owner/buildOwnerCommand';
import { cn } from '@/app/components/panel/utils';
import { HEALTH_STYLE, HealthPill, Panel, SkeletonRows, relativeTime } from './ui';
import type { TeamStatus } from './derive';
import type { TeamId } from './types';
import { TeamLevelContext } from './teams/TeamBody';
import { eventTitle } from './ActivityTimeline';

export type TeamTab = {
  id: TeamId;
  label: string;
  icon: ComponentType<{ className?: string }>;
  status: TeamStatus;
  href: string;
  activity: ActivityEvent[];
  render: () => ReactNode;
};

const ARROW_BTN =
  'hidden h-11 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-white/65 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70 md:inline-flex';

export default function TeamCarousel({
  teams,
  active,
  loading,
  onChange,
  now,
}: {
  teams: TeamTab[];
  active: TeamId;
  loading: boolean;
  onChange: (id: TeamId) => void;
  now: number;
}) {
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const idx = Math.max(0, teams.findIndex((t) => t.id === active));
  const current = teams[idx];
  const prev = teams[(idx - 1 + teams.length) % teams.length];
  const next = teams[(idx + 1) % teams.length];

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
      subtitle="Qué equipo está involucrado y qué decidir: delegar, revisar o investigar."
      action={
        <span className="text-[11px] tabular-nums text-white/45" aria-live="polite">
          {idx + 1} / {teams.length} · {current.label}
        </span>
      }
    >
      <div className="mb-4 flex items-center gap-2">
        <button type="button" onClick={() => go(idx - 1, false)} className={ARROW_BTN} aria-label={`Equipo anterior: ${prev.label}`}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <div
          role="tablist"
          aria-label="Equipos de Aventa"
          onKeyDown={onKeyDown}
          className="relative -mx-1 flex min-w-0 flex-1 snap-x snap-mandatory gap-1.5 overflow-x-auto scroll-px-1 px-1 py-1 scrollbar-hide"
        >
          {teams.map((t) => {
            const selected = t.id === active;
            const Icon = t.icon;
            const st = HEALTH_STYLE[t.status.level];
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
                  'flex min-h-[44px] shrink-0 snap-start items-center gap-2 rounded-xl border px-3.5 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70',
                  selected
                    ? 'border-violet-400/50 bg-violet-600/25 text-white shadow-[inset_0_-2px_0_0_rgba(167,139,250,0.9)]'
                    : 'border-white/[0.07] bg-white/[0.02] text-white/60 hover:bg-white/[0.06] hover:text-white/90',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {t.label}
                <span className={cn('h-2 w-2 rounded-full', st.dot)} aria-hidden />
                <span className="sr-only">: {st.label}</span>
              </button>
            );
          })}
        </div>
        <button type="button" onClick={() => go(idx + 1, false)} className={ARROW_BTN} aria-label={`Equipo siguiente: ${next.label}`}>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div role="tabpanel" id={`team-panel-${current.id}`} aria-labelledby={`team-tab-${current.id}`} tabIndex={0} className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70">
        {loading ? (
          <SkeletonRows rows={3} />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <HealthPill level={current.status.level} />
                <p className="text-xs text-white/65">{current.status.reason}</p>
              </div>
              <Link
                href={current.href}
                className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-white/[0.09] bg-white/[0.03] px-2.5 text-[11px] font-semibold text-white/80 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70"
              >
                Abrir {current.label}
                <ArrowRight className="h-3 w-3" aria-hidden />
              </Link>
            </div>
            <TeamLevelContext.Provider value={current.status.level}>{current.render()}</TeamLevelContext.Provider>
            <div className="mt-4 border-t border-white/[0.06] pt-3">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Actividad del equipo</p>
              {current.activity.length === 0 ? (
                <p className="text-[11px] text-white/40">Sin eventos recientes de este equipo.</p>
              ) : (
                <ul className="grid gap-1 sm:grid-cols-2">
                  {current.activity.slice(0, 4).map((e) => (
                    <li key={e.id} className="flex min-w-0 items-baseline gap-2 text-[11px]">
                      <time dateTime={e.at} className="shrink-0 tabular-nums text-white/40">
                        {relativeTime(e.at, now)}
                      </time>
                      <span className="truncate text-white/75" title={eventTitle(e)}>
                        {eventTitle(e)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}
