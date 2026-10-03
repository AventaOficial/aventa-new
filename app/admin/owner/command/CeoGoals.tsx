'use client';

import { CheckCircle2, Circle, CircleDashed, Target } from 'lucide-react';
import type { GerenciaPayload } from '@/lib/staff/buildStaffHome';
import { cn } from '@/app/components/panel/utils';
import { Bar, CtaLink, EmptyNote, ErrorNote, Panel, ProvenanceBadge, SkeletonRows, formatCount } from './ui';
import type { DerivedGoal, SourceState } from './types';

export default function CeoGoals({
  goals,
  loading,
  gerencia,
  onRetryGerencia,
}: {
  goals: DerivedGoal[];
  loading: boolean;
  gerencia: SourceState<GerenciaPayload>;
  onRetryGerencia: () => void;
}) {
  const board = gerencia.data?.board;
  const done = goals.filter((g) => g.done === true).length;
  const measurable = goals.filter((g) => g.done != null).length;

  return (
    <Panel id="metas" title="Metas del CEO" icon={Target} subtitle="Checklist del día derivada de señales reales + tablero existente de gerencia.">
      <div className="space-y-4">
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
              Checklist operativo <ProvenanceBadge kind="DERIVED" hint="Calculado en el navegador desde los datos del panel. No se persiste." />
            </p>
            <span className="text-[11px] tabular-nums text-white/45">
              {done}/{measurable}
            </span>
          </div>
          {goals.length === 0 && loading ? (
            <SkeletonRows rows={3} />
          ) : goals.length === 0 ? (
            <EmptyNote>Sin datos para evaluar metas: las fuentes del panel no respondieron.</EmptyNote>
          ) : (
            <ul className="space-y-1.5">
              {goals.map((g) => {
                const Icon = g.done == null ? CircleDashed : g.done ? CheckCircle2 : Circle;
                return (
                  <li key={g.id} className="flex items-center gap-2.5 rounded-xl bg-white/[0.02] px-2.5 py-2" title={g.rule}>
                    <Icon className={cn('h-4 w-4 shrink-0', g.done ? 'text-emerald-400' : g.done == null ? 'text-white/25' : 'text-white/40')} aria-label={g.done == null ? 'Sin dato' : g.done ? 'Cumplida' : 'Pendiente'} />
                    <div className="min-w-0 flex-1">
                      <p className={cn('truncate text-xs', g.done ? 'text-white/45 line-through decoration-white/20' : 'text-white/80')}>{g.label}</p>
                      {g.target != null && g.target > 0 && g.current != null ? (
                        <div className="mt-1 flex items-center gap-2">
                          <Bar value={g.current} max={g.target} tone={g.done ? 'green' : 'violet'} />
                          <span className="shrink-0 text-[10px] tabular-nums text-white/40">
                            {formatCount(g.current)}/{formatCount(g.target)}
                          </span>
                        </div>
                      ) : null}
                    </div>
                    {!g.done ? <CtaLink href={g.href}>Ir</CtaLink> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
            Tablero de gerencia <ProvenanceBadge kind={gerencia.data ? 'REAL' : 'UNKNOWN'} hint="app_config · tablero de tareas del equipo (gerencia)" />
          </p>
          {gerencia.data == null && gerencia.status === 'error' ? (
            <ErrorNote message={`Tablero no disponible: ${gerencia.error ?? 'error'}`} onRetry={onRetryGerencia} />
          ) : gerencia.data == null ? (
            <SkeletonRows rows={2} />
          ) : !board || board.tasks.length === 0 ? (
            <EmptyNote>El tablero de gerencia no tiene tareas.</EmptyNote>
          ) : (
            <ul className="space-y-1">
              {board.tasks.slice(0, 5).map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-xs text-white/65">
                  {t.done ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-label="Hecha" /> : <Circle className="h-3.5 w-3.5 shrink-0 text-white/30" aria-label="Pendiente" />}
                  <span className={cn('truncate', t.done && 'text-white/35 line-through')}>{t.text}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2">
            <CtaLink href="/equipo/gerencia">Abrir gerencia</CtaLink>
          </div>
        </div>
      </div>
    </Panel>
  );
}
