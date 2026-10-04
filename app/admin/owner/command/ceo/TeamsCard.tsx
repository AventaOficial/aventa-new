'use client';

import type { ComponentType } from 'react';
import Link from 'next/link';
import { ChevronRight, UsersRound } from 'lucide-react';
import { cn } from '@/app/components/panel/utils';
import type { TeamStatus } from '../derive';
import type { TeamId } from '../types';
import { HEALTH_STYLE } from '../ui';
import { Card, CardHeader, Chip, FOCUS_RING, Skel } from './kit';

export type TeamRow = {
  id: TeamId;
  label: string;
  icon: ComponentType<{ className?: string }>;
  status: TeamStatus;
  href: string;
};

function Summary({ teams }: { teams: TeamRow[] }) {
  const critical = teams.filter((t) => t.status.level === 'CRITICAL').length;
  const warning = teams.filter((t) => t.status.level === 'WARNING').length;
  if (critical) return <Chip tone="red">{critical} crítico{critical === 1 ? '' : 's'}</Chip>;
  if (warning) return <Chip tone="amber">{warning} con atención</Chip>;
  if (teams.every((t) => t.status.level === 'UNKNOWN')) return <Chip tone="gray">Sin datos</Chip>;
  return <Chip tone="green">En orden</Chip>;
}

export default function TeamsCard({ teams, loading, className }: { teams: TeamRow[]; loading: boolean; className?: string }) {
  return (
    <Card id="equipos" labelledBy="ceo-teams" className={cn('scroll-mt-20', className)}>
      <CardHeader id="ceo-teams" title="Equipos" icon={UsersRound} action={loading ? null : <Summary teams={teams} />} />
      {loading ? (
        <ul className="mt-2.5 space-y-2" aria-busy="true" aria-label="Cargando">
          {Array.from({ length: 7 }, (_, i) => (
            <li key={i} className="flex items-center gap-2">
              <Skel className="h-7 w-7" />
              <Skel className="h-7 flex-1" />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto [scrollbar-width:thin]">
          {teams.map((t) => {
            const st = HEALTH_STYLE[t.status.level];
            return (
              <li key={t.id}>
                <Link
                  href={t.href}
                  aria-label={`Abrir ${t.label}: ${st.label}. ${t.status.reason}`}
                  className={cn('flex items-center gap-2 rounded-xl px-1 py-1 transition-colors hover:bg-white/[0.04]', FOCUS_RING)}
                >
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-[#2a1f4d] text-violet-300 ring-1 ring-inset ring-violet-400/20" aria-hidden>
                    <t.icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] font-semibold text-white">{t.label}</span>
                    <span className="block truncate text-[10px] leading-tight text-white/50" title={t.status.reason}>
                      {t.status.reason}
                    </span>
                  </span>
                  <span className={cn('inline-flex shrink-0 items-center gap-1.5 text-[10px] font-semibold', st.text)} aria-hidden>
                    <span className={cn('h-2 w-2 rounded-full', st.dot)} />
                    <span className="hidden @[15rem]:inline">{st.label}</span>
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/35" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
