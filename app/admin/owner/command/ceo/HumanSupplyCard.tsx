'use client';

import type { OwnerCommandPayload } from '@/lib/owner/buildOwnerCommand';
import type { HumanFunnelWindow, HumanSupplyReport } from '@/lib/owner/humanSupply';
import type { SourceState } from '../types';
import { Card, CardHeader, NA } from './kit';
import { Users } from 'lucide-react';

function num(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toLocaleString('es-MX');
}

function pct(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${Math.round(value * 100)}%`;
}

function WindowLine({ label, window }: { label: string; window: HumanFunnelWindow }) {
  return (
    <p className="tabular-nums">
      {label}: {num(window.contributors)} humanos · {num(window.newContributors)} nuevos · {num(window.repeatContributors)}{' '}
      recurrentes · {num(window.offers)} ofertas · aprobación {pct(window.approvalRate)} · rechazo {pct(window.rejectionRate)} ·
      primer éxito {pct(window.firstHuntSuccessRate)}
    </p>
  );
}

function Report({ report }: { report: HumanSupplyReport }) {
  return (
    <div className="space-y-2 text-[13px] text-white/75">
      <WindowLine label="7 días" window={report.d7} />
      <WindowLine label="30 días" window={report.d30} />
      {report.historyStatus === 'unavailable' ? (
        <p>Historial de cazadores incompleto: nuevos, recurrentes y primer éxito no se publican.</p>
      ) : null}
      <p className="tabular-nums">Ofertas humanas pendientes en 30 días: {num(report.d30.pendingOffers)}</p>
      {report.diversity ? (
        <p className="tabular-nums">
          Diversidad 30 días: humano {pct(report.diversity.humanShare)} · máquina {pct(report.diversity.machineShare)} · sistema{' '}
          {pct(report.diversity.systemShare)} · sin atribución {pct(report.diversity.unattributedShare)}
          {report.diversity.status === 'INSUFFICIENT_DATA'
            ? ' · concentración humana INSUFFICIENT_DATA'
            : ` · principal humano ${pct(report.diversity.topHumanPct)}`}
        </p>
      ) : (
        <NA why="Sin directorio de actores no hay diversidad humana." />
      )}
      {report.rejectionReasons ? (
        <p>
          Motivos de rechazo humano:{' '}
          {report.rejectionReasons.status === 'INCOMPLETE'
            ? `atribución incompleta · sin motivo ${report.rejectionReasons.unspecified}`
            : report.rejectionReasons.groups.map((group) => `${group.label} ${group.count}`).join(' · ') || 'sin rechazos'}
          {report.rejectionReasons.status === 'ok' && report.rejectionReasons.unspecified > 0
            ? ` · sin motivo ${report.rejectionReasons.unspecified}`
            : ''}
        </p>
      ) : null}
      <p className="text-white/50">
        La meta es oferta humana aprobada. Un envío rechazado no cuenta como crecimiento.
      </p>
    </div>
  );
}

export default function HumanSupplyCard({ source }: { source: SourceState<OwnerCommandPayload> }) {
  const report = source.data?.supply?.humanSupply ?? null;
  return (
    <Card labelledBy="ceo-human-supply">
      <CardHeader id="ceo-human-supply" title="Oferta humana" icon={Users} iconStyle="plain" />
      <div className="px-1">
        {!source.data?.supply ? (
          <p className="text-sm text-white/60">No se pudo leer la oferta humana.</p>
        ) : !report ? (
          <NA why="Sin directorio de actores o con la lectura truncada, la oferta humana no se publica." />
        ) : (
          <Report report={report} />
        )}
      </div>
    </Card>
  );
}
