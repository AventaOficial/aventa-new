'use client';

import type { OwnerCommandPayload } from '@/lib/owner/buildOwnerCommand';
import { HUNTER_GROWTH_EXPERIMENTS } from '@/lib/owner/hunterExperiments';
import type { HunterGrowthWindow } from '@/lib/owner/hunterGrowth';
import type { SourceState } from '../types';
import { Card, CardHeader, NA } from './kit';
import { Sprout } from 'lucide-react';

function num(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toLocaleString('es-MX');
}

function pct(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${Math.round(value * 100)}%`;
}

function WindowBlock({ label, window }: { label: string; window: HunterGrowthWindow }) {
  return (
    <div className="space-y-1">
      <p className="font-medium text-white/90">{label}</p>
      <p className="tabular-nums">
        {num(window.newHunters)} nuevos · {num(window.firstSubmissions)} primeros envíos · {num(window.firstApprovals)}{' '}
        primeras aprobaciones · {num(window.secondContributions)} segundas contribuciones · {num(window.repeatHunters)}{' '}
        recurrentes
      </p>
      <p className="tabular-nums">
        usuario → intención {pct(window.userToIntent)} · intención → primer envío {pct(window.intentToSubmission)} · primer
        envío → primera aprobación {pct(window.submissionToApproval)} · primera aprobación → segunda contribución{' '}
        {pct(window.approvalToSecond)}
      </p>
      <p className="tabular-nums">
        aprobación humana {pct(window.humanApprovalRate)} · rechazo humano {pct(window.humanRejectionRate)}
        {window.intentCoverage === 'unavailable' ? ' · intención sin historial suficiente' : ''}
      </p>
    </div>
  );
}

export default function HunterGrowthCard({ source }: { source: SourceState<OwnerCommandPayload> }) {
  const supply = source.data?.supply ?? null;
  const report = supply?.hunterGrowth ?? null;
  return (
    <Card labelledBy="ceo-hunter-growth">
      <CardHeader id="ceo-hunter-growth" title="Crecimiento de cazadores" icon={Sprout} iconStyle="plain" />
      <div className="px-1">
        {!supply ? (
          <p className="text-sm text-white/60">No se pudo leer el crecimiento de cazadores.</p>
        ) : !report ? (
          <NA why="El crecimiento no está en esta lectura." />
        ) : (
          <div className="space-y-3 text-[13px] text-white/75">
            <WindowBlock label="7 días" window={report.d7} />
            <WindowBlock label="30 días" window={report.d30} />
            <p>
              La oferta humana aprobada es el objetivo. Un envío sin aprobar no cuenta como éxito. Máquina y sistema no entran
              en estas cifras.
            </p>
            <ul className="space-y-1">
              {HUNTER_GROWTH_EXPERIMENTS.map((experiment) => (
                <li key={experiment.id}>
                  {experiment.hypothesis} Superficie: {experiment.surface}. Éxito: {experiment.success}. Límite:{' '}
                  {experiment.guardrail}.
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
