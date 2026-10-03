'use client';

import { Zap } from 'lucide-react';
import { cn } from '@/app/components/panel/utils';
import { CtaLink, EmptyNote, Panel, ProvenanceBadge, SkeletonRows, formatCount } from './ui';
import type { CeoPriority, PrioritySeverity, TeamId } from './types';

const SEVERITY: Record<PrioritySeverity, { label: string; chip: string; num: string }> = {
  critical: { label: 'Crítica', chip: 'border-red-400/30 bg-red-500/10 text-red-200', num: 'bg-red-500/15 text-red-200 border-red-400/30' },
  high: { label: 'Alta', chip: 'border-amber-400/30 bg-amber-500/10 text-amber-200', num: 'bg-amber-500/15 text-amber-200 border-amber-400/30' },
  medium: { label: 'Media', chip: 'border-violet-400/25 bg-violet-500/10 text-violet-200', num: 'bg-violet-500/15 text-violet-200 border-violet-400/25' },
  low: { label: 'Baja', chip: 'border-white/10 bg-white/[0.04] text-white/60', num: 'bg-white/[0.05] text-white/60 border-white/10' },
};

export const TEAM_LABEL: Record<TeamId, string> = {
  moderacion: 'Moderación',
  finanzas: 'Finanzas',
  growth: 'Growth',
  producto: 'Producto',
  hunter: 'Hunter',
  comunidad: 'Comunidad',
  operaciones: 'Operaciones',
};

export default function CeoPriorities({
  priorities,
  loading,
  dataMissing,
  onOpenTeam,
  className,
}: {
  priorities: CeoPriority[];
  loading: boolean;
  dataMissing: boolean;
  onOpenTeam: (team: TeamId) => void;
  className?: string;
}) {
  return (
    <Panel
      id="prioridades"
      title="Prioridades del CEO"
      icon={Zap}
      className={className}
      subtitle="Reglas deterministas sobre señales reales. Ordenadas por severidad y volumen."
      badge={<ProvenanceBadge kind="DERIVED" hint="Generadas por reglas en app/admin/owner/command/derive.ts (sin IA)." />}
    >
      {loading && priorities.length === 0 ? (
        <SkeletonRows rows={4} />
      ) : priorities.length === 0 && dataMissing ? (
        <EmptyNote>No se pueden calcular prioridades: las fuentes del panel no respondieron. Esto no significa que todo esté bien.</EmptyNote>
      ) : priorities.length === 0 ? (
        <EmptyNote>Sin prioridades activas con los datos disponibles. Revisa Health para señales UNKNOWN.</EmptyNote>
      ) : (
        <ol className="space-y-2">
          {priorities.slice(0, 8).map((p, i) => (
            <li key={p.id} className="flex flex-col gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span className="mt-0.5 w-4 shrink-0 text-right text-[11px] tabular-nums text-white/30">{i + 1}</span>
                <span className={cn('inline-flex h-9 min-w-[2.5rem] shrink-0 items-center justify-center rounded-lg border px-1.5 text-sm font-bold tabular-nums', SEVERITY[p.severity].num)}>
                  {p.quantity != null ? formatCount(p.quantity) : '!'}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-snug text-white/90">{p.problem}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-white/45">{p.impact}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={cn('rounded-md border px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide', SEVERITY[p.severity].chip)}>{SEVERITY[p.severity].label}</span>
                    <button
                      type="button"
                      onClick={() => onOpenTeam(p.team)}
                      className="rounded-md border border-white/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-white/50 hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
                    >
                      {TEAM_LABEL[p.team]}
                    </button>
                    <ProvenanceBadge kind={p.provenance} />
                  </div>
                </div>
              </div>
              <div className="pl-7 sm:pl-0">
                <CtaLink href={p.href} tone={p.severity === 'critical' ? 'danger' : p.severity === 'high' ? 'primary' : 'default'}>
                  {p.action}
                </CtaLink>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
