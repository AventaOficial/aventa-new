'use client';

import { BarChart3 } from 'lucide-react';
import type { OwnerCommandPayload } from '@/lib/owner/buildOwnerCommand';
import ActivityChart from '../ActivityChart';
import { ProvenanceBadge } from '../ui';
import type { SourceState } from '../types';
import { Card, CardError, CardHeader, CardLoading } from './kit';

/** Actividad del período: serie por hora/día (clics, ofertas, usuarios nuevos y con acceso). */
export default function PeriodActivityCard({
  source,
  onRetry,
  className,
}: {
  source: SourceState<OwnerCommandPayload>;
  onRetry: () => void;
  className?: string;
}) {
  const cmd = source.data;
  return (
    <Card labelledBy="ceo-period-activity" className={className}>
      <CardHeader
        id="ceo-period-activity"
        title="Actividad del período"
        suffix={cmd ? `· por ${cmd.series.bucket === 'day' ? 'día' : 'hora'}` : undefined}
        icon={BarChart3}
        action={<ProvenanceBadge kind={cmd?.series.available ? 'REAL' : 'UNAVAILABLE'} hint="Eventos reales agrupados por hora o día (hora de México)." />}
      />
      {cmd == null ? (
        source.status === 'error' ? (
          <CardError message="No se pudo cargar la actividad del período. Detalle en Diagnóstico técnico." onRetry={onRetry} />
        ) : (
          <CardLoading rows={5} />
        )
      ) : (
        <div className="mt-3 min-w-0">
          <ActivityChart series={cmd.series} rangeKey={cmd.range.key} />
          {cmd.series.truncated ? (
            <p className="mt-2 text-[10.5px] text-amber-300/80">El período tiene más eventos de los que se grafican; la serie es parcial. Los totales de las tarjetas sí son completos.</p>
          ) : null}
        </div>
      )}
    </Card>
  );
}
