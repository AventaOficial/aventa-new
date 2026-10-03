'use client';

import { HeartPulse } from 'lucide-react';
import { cn } from '@/app/components/panel/utils';
import { HEALTH_STYLE, HealthPill, Panel, SkeletonRows } from './ui';
import type { HealthCategory, TeamId } from './types';

export default function HealthStatus({
  categories,
  loading,
  onOpenTeam,
}: {
  categories: HealthCategory[];
  loading: boolean;
  onOpenTeam: (team: TeamId) => void;
}) {
  return (
    <Panel id="health" title="Aventa Health" icon={HeartPulse} subtitle="¿Hay algo roto? Estado por área con las señales que lo explican.">
      {loading && categories.every((c) => c.level === 'UNKNOWN') ? (
        <SkeletonRows rows={3} />
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-2">
          {categories.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onOpenTeam(c.team)}
                className={cn(
                  'flex h-full w-full flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60',
                  HEALTH_STYLE[c.level].ring,
                )}
                aria-label={`${c.label}: ${HEALTH_STYLE[c.level].label}. ${c.summary}. Abrir equipo.`}
              >
                <span className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">{c.id}</span>
                  <HealthPill level={c.level} />
                </span>
                <span className="text-sm font-medium text-white/85">{c.summary}</span>
                {c.signals.length ? (
                  <span className="text-[11px] leading-snug text-white/40">{c.signals.join(' · ')}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
