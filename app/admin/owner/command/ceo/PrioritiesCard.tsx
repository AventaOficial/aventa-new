'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Zap } from 'lucide-react';
import { cn } from '@/app/components/panel/utils';
import { TEAM_LABEL, type CeoPriority, type PrioritySeverity } from '../types';
import { CEO_CARD_DRILLDOWN } from '../drilldowns';
import { Card, CardHeader, EmptyFrame, FOCUS_RING, Skel, ViewButton } from './kit';

const VISIBLE = 4;

const SEVERITY_CHIP: Record<PrioritySeverity, string> = {
  critical: 'bg-red-500/20 text-red-300 ring-red-400/30',
  high: 'bg-orange-500/20 text-orange-300 ring-orange-400/30',
  medium: 'bg-amber-500/15 text-amber-300 ring-amber-400/25',
  info: 'bg-violet-500/20 text-violet-200 ring-violet-400/30',
};

const SEVERITY_TAG: Record<PrioritySeverity, string> = {
  critical: 'text-red-300',
  high: 'text-orange-300',
  medium: 'text-amber-300',
  info: 'text-violet-300',
};

export const SEVERITY_LABEL: Record<PrioritySeverity, string> = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'MEDIUM',
  info: 'INFO',
};

export default function PrioritiesCard({
  priorities,
  loading,
  dataMissing,
  className,
  level = 3,
}: {
  priorities: CeoPriority[];
  loading: boolean;
  dataMissing: boolean;
  className?: string;
  level?: 2 | 3;
}) {
  const [showAll, setShowAll] = useState(false);
  const list = showAll ? priorities : priorities.slice(0, VISIBLE);
  const counts = priorities.reduce<Record<PrioritySeverity, number>>(
    (acc, p) => ({ ...acc, [p.severity]: acc[p.severity] + 1 }),
    { critical: 0, high: 0, medium: 0, info: 0 },
  );

  return (
    <Card id="prioridades" labelledBy="ceo-priorities" className={cn('scroll-mt-20', className)} href={CEO_CARD_DRILLDOWN.priorities}>
      <CardHeader
        id="ceo-priorities"
        level={level}
        title="Prioridades del CEO"
        suffix={priorities.length ? `(${priorities.length})` : undefined}
        icon={Zap}
        iconStyle="plain"
        action={
          <>
            <span className="hidden items-center gap-2 text-[10px] font-semibold @xl:flex">
              {(Object.keys(counts) as PrioritySeverity[])
                .filter((s) => counts[s] > 0)
                .map((s) => (
                  <span key={s} className={SEVERITY_TAG[s]}>
                    {counts[s]} {SEVERITY_LABEL[s]}
                  </span>
                ))}
            </span>
            {priorities.length > VISIBLE ? (
              <ViewButton onClick={() => setShowAll((v) => !v)} expanded={showAll} controls="ceo-priorities-list">
                {showAll ? 'Ver menos' : `Ver todas (${priorities.length})`}
              </ViewButton>
            ) : null}
          </>
        }
      />
      {loading && priorities.length === 0 ? (
        <div className="mt-3 grid gap-2.5 @3xl:grid-cols-2" aria-busy="true" aria-label="Cargando">
          {Array.from({ length: 4 }, (_, i) => (
            <Skel key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : priorities.length === 0 ? (
        <EmptyFrame className="mt-3 flex-col gap-1.5 py-6">
          {dataMissing ? (
            'Prioridades no disponibles: no se pudieron leer los datos del panel.'
          ) : (
            <>
              <CheckCircle2 className="h-5 w-5 text-emerald-400" aria-hidden />
              Sin prioridades activas: ninguna regla se cumple con los datos actuales.
            </>
          )}
        </EmptyFrame>
      ) : (
        <ol id="ceo-priorities-list" className="mt-2 grid min-h-0 flex-1 content-start gap-x-5 gap-y-1 overflow-y-auto [scrollbar-width:thin] @3xl:grid-cols-2">
          {list.map((p, i) => {
            const urgent = p.severity === 'critical' || p.severity === 'high';
            return (
              <li
                key={p.id}
                className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-white/[0.05] bg-white/[0.025] px-2 py-1.5 @sm:grid-cols-[28px_36px_minmax(0,1fr)_auto] @sm:gap-2.5 @sm:px-2.5"
                title={`${SEVERITY_LABEL[p.severity]} · ${TEAM_LABEL[p.team]} · Impacto: ${p.impact}`}
              >
                <span className="hidden h-7 w-7 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.04] text-[12px] font-semibold tabular-nums text-white/80 @sm:inline-flex">
                  {i + 1}
                </span>
                <span
                  className={cn('inline-flex h-8 min-w-[36px] items-center justify-center rounded-lg px-1 text-[13px] font-bold tabular-nums ring-1 ring-inset', SEVERITY_CHIP[p.severity])}
                  title={`Severidad ${SEVERITY_LABEL[p.severity]} · ${p.provenance === 'REAL' ? 'dato real' : 'calculado por regla'}`}
                >
                  {p.quantity == null ? '!' : p.quantity > 999 ? '999+' : p.quantity}
                  <span className="sr-only">. Severidad {SEVERITY_LABEL[p.severity]}, {TEAM_LABEL[p.team]}</span>
                </span>
                <div className="min-w-0">
                  <p className="line-clamp-2 text-[12px] font-semibold leading-snug text-white">{p.problem}</p>
                  <p className="mt-0.5 hidden text-[10.5px] leading-snug text-white/50 @sm:line-clamp-1">{p.reason}</p>
                  <p className="sr-only">Impacto: {p.impact}</p>
                </div>
                <Link
                  href={p.href}
                  aria-label={`${p.action}: ${p.problem}`}
                  className={cn(
                    'inline-flex min-h-[32px] w-fit items-center gap-1 whitespace-nowrap rounded-lg border px-2 text-[11px] font-semibold transition-colors @sm:px-3',
                    urgent
                      ? 'border-red-400/30 bg-red-500/15 text-red-200 hover:bg-red-500/25'
                      : 'border-white/[0.09] bg-white/[0.04] text-white/85 hover:bg-white/[0.08]',
                    FOCUS_RING,
                  )}
                >
                  <span className="hidden @sm:inline">{p.action}</span>
                  <ArrowRight className="h-3 w-3" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
