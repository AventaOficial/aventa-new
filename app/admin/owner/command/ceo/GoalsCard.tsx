'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Flag, ListChecks, MessageSquare, Rocket, ShieldCheck, Tag, Target, type LucideIcon } from 'lucide-react';
import { cn } from '@/app/components/panel/utils';
import type { DerivedGoal } from '../types';
import { ProgressRing } from './charts';
import { Card, CardHeader, EmptyFrame, FOCUS_RING, NA, Skel, ThinBar, ViewLink } from './kit';
import { formatCount } from './model';

const GOAL_ICON: Record<string, LucideIcon> = {
  moderation_queue: ListChecks,
  approved_today: Tag,
  integrity: ShieldCheck,
  reports: Flag,
  plaza: MessageSquare,
};

function progress(g: DerivedGoal): { text: ReactNode; pct: number | null } {
  if (g.current == null) return { text: <NA why={`Sin dato. Regla: ${g.rule}`} />, pct: null };
  if (g.id === 'integrity') return { text: g.done ? 'OK' : 'Fallo', pct: g.done ? 100 : null };
  if (g.target != null && g.target > 0) {
    return { text: `${formatCount(g.current)} / ${formatCount(g.target)}`, pct: Math.min(100, Math.round((g.current / g.target) * 100)) };
  }
  if (g.target === 0) return { text: g.done ? '0 pend.' : `${formatCount(g.current)} pend.`, pct: g.done ? 100 : null };
  return { text: formatCount(g.current), pct: null };
}

function cheer(pct: number): string {
  if (pct >= 100) return '¡Todo listo!';
  if (pct >= 50) return '¡Vamos bien!';
  if (pct > 0) return 'En progreso';
  return 'Por arrancar';
}

export default function GoalsCard({ goals, loading, className }: { goals: DerivedGoal[]; loading: boolean; className?: string }) {
  const done = goals.filter((g) => g.done === true).length;
  const total = goals.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <Card labelledBy="ceo-goals" className={className}>
      <CardHeader
        id="ceo-goals"
        title="Metas del día"
        icon={Target}
        iconStyle="plain"
        action={<ViewLink href="/equipo/gerencia" label="Ver todas las metas en gerencia">Ver todas</ViewLink>}
      />
      {loading && total === 0 ? (
        <div className="mt-3 space-y-2" aria-busy="true" aria-label="Cargando">
          <Skel className="h-14 w-full" />
          {Array.from({ length: 4 }, (_, i) => (
            <Skel key={i} className="h-7 w-full" />
          ))}
        </div>
      ) : total === 0 ? (
        <EmptyFrame className="mt-3 flex-1">Sin señales para derivar metas (fuentes no disponibles).</EmptyFrame>
      ) : (
        <>
          <div
            className="mt-2 flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.025] px-3 py-1.5"
            title="Metas derivadas por reglas a partir de datos reales; no se guardan."
          >
            <ProgressRing pct={pct} size={36}>
              {done}/{total}
            </ProgressRing>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium text-white/85">Metas completadas</p>
              <ThinBar pct={pct} className="mt-1.5" />
            </div>
            <span className="text-[13px] font-semibold tabular-nums text-white">{pct}%</span>
            <span className="hidden flex-col items-center text-[10px] text-white/55 sm:flex">
              <Rocket className="h-4 w-4 text-violet-300" aria-hidden />
              {cheer(pct)}
            </span>
          </div>
          <ul className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto [scrollbar-width:thin]">
            {goals.map((g) => {
              const Icon = GOAL_ICON[g.id] ?? ListChecks;
              const p = progress(g);
              const primary = g.done === false && g.target != null && g.target > 0;
              return (
                <li key={g.id} className="grid grid-cols-[18px_16px_minmax(0,1fr)_52px_auto] items-center sm:grid-cols-[18px_16px_minmax(0,1fr)_minmax(48px,0.45fr)_52px_auto] gap-x-2.5 py-0.5" title={g.rule}>
                  <span
                    role="img"
                    aria-label={g.done === true ? 'Completada' : g.done === false ? 'Pendiente' : 'Sin dato'}
                    className={cn(
                      'inline-flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border',
                      g.done === true ? 'border-violet-500 bg-violet-600 text-white' : g.done === false ? 'border-white/20 bg-white/[0.03]' : 'border-dashed border-white/20',
                    )}
                  >
                    {g.done === true ? <Check className="h-3 w-3" strokeWidth={3} aria-hidden /> : null}
                  </span>
                  <Icon className="h-4 w-4 text-white/55" aria-hidden />
                  <span className="truncate text-[11px] text-white/85">{g.label}</span>
                  <ThinBar pct={p.pct} className="hidden h-1 sm:block" />
                  <span className="text-right text-[11px] tabular-nums text-white/70">{p.text}</span>
                  <Link
                    href={g.href}
                    className={cn(
                      'inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-lg border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                      primary
                        ? 'border-violet-500/60 bg-violet-600/90 text-white hover:bg-violet-500'
                        : 'border-white/[0.09] bg-white/[0.03] text-white/80 hover:bg-white/[0.08]',
                      FOCUS_RING,
                    )}
                    aria-label={`${primary ? 'Continuar' : g.done ? 'Ver' : 'Revisar'}: ${g.label}`}
                  >
                    {primary ? 'Continuar' : g.done ? 'Ver' : 'Revisar'}
                    <ArrowRight className="h-3 w-3" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
