'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/app/components/panel/utils';
import { CtaLink } from '../ui';
import type { HealthLevel } from '../types';

export type TeamAlert = { tone: 'warn' | 'bad' | 'info'; text: string };

export const TeamLevelContext = createContext<HealthLevel | null>(null);

export default function TeamBody({
  metrics,
  alerts,
  ctas,
  aside,
  note,
}: {
  metrics: ReactNode;
  alerts: TeamAlert[];
  ctas: { href: string; label: string; primary?: boolean }[];
  aside?: ReactNode;
  note?: ReactNode;
}) {
  const level = useContext(TeamLevelContext);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(240px,320px)]">
      <div className="min-w-0 space-y-3">
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-4">{metrics}</div>
        {note ? <p className="text-[11px] leading-snug text-white/40">{note}</p> : null}
      </div>
      <div className="min-w-0 space-y-3">
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">Alertas</p>
          {alerts.length === 0 ? (
            <p className="rounded-xl border border-white/[0.06] px-3 py-2.5 text-xs text-white/40">
              {level === 'UNKNOWN' ? 'Sin datos suficientes para evaluar alertas.' : 'Sin alertas con los datos actuales.'}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {alerts.map((a) => (
                <li
                  key={a.text}
                  className={cn(
                    'flex items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-snug',
                    a.tone === 'bad'
                      ? 'border-red-400/25 bg-red-500/[0.06] text-red-100/90'
                      : a.tone === 'warn'
                        ? 'border-amber-400/25 bg-amber-500/[0.06] text-amber-100/90'
                        : 'border-white/[0.07] bg-white/[0.02] text-white/60',
                  )}
                >
                  {a.tone === 'info' ? <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />}
                  {a.text}
                </li>
              ))}
            </ul>
          )}
        </div>
        {aside}
        <div className="flex flex-wrap gap-2">
          {ctas.map((c) => (
            <CtaLink key={c.href} href={c.href} tone={c.primary ? 'primary' : 'default'}>
              {c.label}
            </CtaLink>
          ))}
        </div>
      </div>
    </div>
  );
}
