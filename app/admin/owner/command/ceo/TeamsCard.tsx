'use client';

import { useRef, useState, type ComponentType, type KeyboardEvent, type TouchEvent } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, ChevronLeft, ChevronRight, UsersRound } from 'lucide-react';
import { cn } from '@/app/components/panel/utils';
import type { TeamStatus } from '../derive';
import type { TeamId } from '../types';
import { HEALTH_STYLE } from '../ui';
import { Card, CardHeader, FOCUS_RING, NA, Skel } from './kit';
import type { TeamSnapshot } from './teamSnapshot';

export type TeamRow = {
  id: TeamId;
  label: string;
  icon: ComponentType<{ className?: string }>;
  status: TeamStatus;
  href: string;
  snapshot: TeamSnapshot;
};

const ARROW = cn(
  'inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.09] bg-white/[0.03] text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white',
  FOCUS_RING,
);

export default function TeamsCard({ teams, loading, className }: { teams: TeamRow[]; loading: boolean; className?: string }) {
  const [idx, setIdx] = useState(0);
  const touchX = useRef<number | null>(null);
  const count = teams.length;
  const go = (i: number) => setIdx(((i % count) + count) % count);
  const team = teams[idx];

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(idx + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(idx - 1);
    }
  };
  const onTouchStart = (e: TouchEvent) => {
    touchX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const start = touchX.current;
    touchX.current = null;
    const end = e.changedTouches[0]?.clientX;
    if (start == null || end == null || Math.abs(end - start) < 40) return;
    go(end < start ? idx + 1 : idx - 1);
  };

  return (
    <Card id="equipos" labelledBy="ceo-teams" className={cn('scroll-mt-20', className)}>
      <CardHeader
        id="ceo-teams"
        title="Equipos"
        icon={UsersRound}
        action={
          loading ? null : (
            <>
              <span className="rounded-lg border border-white/[0.09] px-1.5 py-0.5 text-[10.5px] tabular-nums text-white/70" aria-live="polite">
                {idx + 1} / {count}
              </span>
              <button type="button" onClick={() => go(idx - 1)} className={ARROW} aria-label={`Equipo anterior: ${teams[(idx - 1 + count) % count].label}`}>
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button type="button" onClick={() => go(idx + 1)} className={ARROW} aria-label={`Equipo siguiente: ${teams[(idx + 1) % count].label}`}>
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </button>
            </>
          )
        }
      />

      {loading ? (
        <div className="mt-3 flex flex-1 flex-col items-center gap-2" aria-busy="true" aria-label="Cargando">
          <Skel className="h-11 w-11 rounded-2xl" />
          <Skel className="h-4 w-24" />
          <div className="grid w-full grid-cols-2 gap-1.5">
            {Array.from({ length: 4 }, (_, i) => (
              <Skel key={i} className="h-12" />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div
            role="group"
            aria-roledescription="carrusel"
            aria-label={`${team.label}: ${HEALTH_STYLE[team.status.level].label}`}
            tabIndex={0}
            onKeyDown={onKeyDown}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            className={cn('mt-2 flex min-h-0 flex-1 flex-col overflow-y-auto rounded-xl border border-white/[0.06] bg-white/[0.02] p-2 [scrollbar-width:thin]', FOCUS_RING)}
          >
            <div className="flex flex-col items-center text-center">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-b from-violet-500/40 to-violet-700/30 text-violet-100 ring-1 ring-inset ring-violet-300/30" aria-hidden>
                <team.icon className="h-5 w-5" />
              </span>
              <p className="mt-1.5 text-[15px] font-semibold leading-tight text-white">{team.label}</p>
              <span className={cn('mt-1 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold', HEALTH_STYLE[team.status.level].ring, HEALTH_STYLE[team.status.level].text)}>
                <span className={cn('h-1.5 w-1.5 rounded-full', HEALTH_STYLE[team.status.level].dot)} aria-hidden />
                {HEALTH_STYLE[team.status.level].label}
              </span>
              <p className="mt-1 line-clamp-2 text-[10.5px] leading-snug text-white/55">{team.status.reason}</p>
            </div>

            <dl className="mt-2 grid grid-cols-2 gap-1.5">
              {team.snapshot.metrics.map((m) => (
                <div key={m.label} className="min-w-0 rounded-lg border border-white/[0.06] bg-[#171724] px-2 py-1.5">
                  <dt className="truncate text-[10px] text-white/50" title={m.label}>
                    {m.label}
                  </dt>
                  <dd className="mt-0.5 truncate text-[16px] font-semibold leading-tight tabular-nums text-white">
                    {m.value ?? <NA why={m.why} />}
                  </dd>
                </div>
              ))}
            </dl>

            {team.snapshot.alert ? (
              <p
                className={cn(
                  'mt-1.5 flex items-start gap-1.5 rounded-lg border px-2 py-1.5 text-[10.5px] leading-snug',
                  team.snapshot.alert.tone === 'bad' ? 'border-red-400/25 bg-red-500/[0.07] text-red-100/90' : 'border-amber-400/25 bg-amber-500/[0.07] text-amber-100/90',
                )}
              >
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="line-clamp-2">{team.snapshot.alert.text}</span>
              </p>
            ) : null}

            <span className="min-h-2 flex-1" aria-hidden />
            <Link
              href={team.href}
              className={cn(
                'inline-flex min-h-[32px] w-full shrink-0 items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 text-[12px] font-semibold text-white hover:bg-violet-500',
                FOCUS_RING,
              )}
            >
              Abrir {team.label}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>

          <div className="mt-1.5 flex shrink-0 items-center justify-center gap-1" aria-hidden>
            {teams.map((t, i) => (
              <span key={t.id} className={cn('h-1.5 rounded-full transition-all', i === idx ? 'w-5 bg-violet-500' : 'w-1.5 bg-white/20')} />
            ))}
          </div>
          <div className="mt-1 flex shrink-0 items-center justify-between gap-0.5" role="tablist" aria-label="Elegir equipo">
            {teams.map((t, i) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={i === idx}
                aria-label={`${t.label}: ${HEALTH_STYLE[t.status.level].label}`}
                title={t.label}
                onClick={() => go(i)}
                className={cn(
                  'relative inline-flex h-7 flex-1 items-center justify-center rounded-lg transition-colors',
                  i === idx ? 'bg-violet-600/25 text-violet-200' : 'text-white/45 hover:bg-white/[0.05] hover:text-white/80',
                  FOCUS_RING,
                )}
              >
                <t.icon className="h-3.5 w-3.5" />
                <span className={cn('absolute right-1 top-1 h-1.5 w-1.5 rounded-full', HEALTH_STYLE[t.status.level].dot)} aria-hidden />
              </button>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
