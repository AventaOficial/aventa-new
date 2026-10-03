'use client';

import Link from 'next/link';
import { ArrowRight, HeartPulse } from 'lucide-react';
import { cn } from '@/app/components/panel/utils';
import { HEALTH_STYLE, HealthPill, Panel, SkeletonRows, relativeTime } from './ui';
import { TEAM_LABEL, type HealthCategory, type TeamId } from './types';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70';

export default function HealthStatus({
  categories,
  loading,
  now,
  onOpenTeam,
}: {
  categories: HealthCategory[];
  loading: boolean;
  now: number;
  onOpenTeam: (team: TeamId) => void;
}) {
  const counts = categories.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.level]: (acc[c.level] ?? 0) + 1 }), {});
  return (
    <Panel
      id="health"
      title="Aventa Health"
      icon={HeartPulse}
      subtitle="¿Hay algo roto? Estado por área, la razón y cuándo se actualizó."
      action={
        <span className="flex flex-wrap items-center gap-2 text-[10.5px] text-white/50">
          {(['CRITICAL', 'WARNING', 'HEALTHY', 'FROZEN', 'UNKNOWN'] as const)
            .filter((l) => counts[l])
            .map((l) => (
              <span key={l} className="inline-flex items-center gap-1">
                <span className={cn('h-1.5 w-1.5 rounded-full', HEALTH_STYLE[l].dot)} aria-hidden />
                {counts[l]} {HEALTH_STYLE[l].label.toLowerCase()}
              </span>
            ))}
        </span>
      }
    >
      {loading && categories.every((c) => c.level === 'UNKNOWN') ? (
        <SkeletonRows rows={2} />
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {categories.map((c) => (
            <li key={c.id} className={cn('flex min-w-0 flex-col rounded-xl border p-3', HEALTH_STYLE[c.level].ring)}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[12px] font-semibold text-white">{c.label}</h3>
                <HealthPill level={c.level} />
              </div>
              <p className="mt-1.5 text-[12.5px] font-medium leading-snug text-white/90">{c.summary}</p>
              {c.signals.length ? <p className="mt-1 text-[11px] leading-snug text-white/50">{c.signals.join(' · ')}</p> : null}
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2.5">
                <span className="text-[10px] text-white/40" title={c.updatedAt ? new Date(c.updatedAt).toLocaleString('es-MX') : 'Sin fecha de actualización'}>
                  {c.updatedAt ? `Act. ${relativeTime(c.updatedAt, now)}` : 'Act. —'}
                </span>
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onOpenTeam(c.team)}
                    className={cn('min-h-[28px] rounded-lg px-1.5 text-[10.5px] text-white/55 hover:bg-white/[0.06] hover:text-white/85', FOCUS)}
                    aria-label={`Abrir equipo ${TEAM_LABEL[c.team]} en el carrusel`}
                  >
                    {TEAM_LABEL[c.team]}
                  </button>
                  <Link
                    href={c.href}
                    className={cn(
                      'inline-flex min-h-[28px] items-center gap-1 rounded-lg border border-white/[0.09] bg-white/[0.04] px-2 text-[10.5px] font-semibold text-white/85 hover:bg-white/[0.09]',
                      FOCUS,
                    )}
                    aria-label={`${c.cta}: ${c.label}`}
                  >
                    {c.cta}
                    <ArrowRight className="h-3 w-3" aria-hidden />
                  </Link>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
