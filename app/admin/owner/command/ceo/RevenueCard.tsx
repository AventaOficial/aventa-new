'use client';

import { CircleDollarSign } from 'lucide-react';
import type { OwnerDashboardPayload } from '@/lib/owner/buildOwnerDashboard';
import type { OwnerCommandPayload } from '@/lib/owner/buildOwnerCommand';
import type { OwnerRangeKey } from '@/lib/owner/ownerRange';
import type { SourceState } from '../types';
import { LineSeries } from './charts';
import { Card, CardError, CardHeader, CardLoading, Chip, EmptyFrame, NA, RangeChip } from './kit';
import { formatMoneyCents } from './model';

type EconomyPeriod = OwnerDashboardPayload['economy']['day'];

function periodFor(base: OwnerDashboardPayload, key: OwnerRangeKey): EconomyPeriod | null {
  if (key === 'today') return base.economy.day;
  if (key === '7d') return base.economy.week;
  if (key === 'month') return base.economy.month;
  return null;
}

export default function RevenueCard({
  base,
  command,
  range,
  onRangeChange,
  onRetry,
  className,
}: {
  base: SourceState<OwnerDashboardPayload>;
  command: SourceState<OwnerCommandPayload>;
  range: OwnerRangeKey;
  onRangeChange: (r: OwnerRangeKey) => void;
  onRetry: () => void;
  className?: string;
}) {
  const b = base.data;
  const cmd = command.data;
  const frozen = b?.systemHealth.moneyPathFrozen ?? cmd?.finance.moneyPathFrozen ?? null;
  const period = b ? periodFor(b, range) : null;
  const real = period?.realCents ?? null;
  const estimated = period?.estimatedCents ?? null;

  return (
    <Card labelledBy="ceo-revenue" className={className} href="/admin/owner/vista/ingresos">
      <CardHeader
        id="ceo-revenue"
        title={
          <>
            Ingresos<span className="hidden @[16rem]:inline"> confirmados</span>
          </>
        }
        icon={CircleDollarSign}
        action={<RangeChip range={range} onChange={onRangeChange} label="Período de ingresos" />}
      />
      {b == null ? (
        base.status === 'error' ? (
          <CardError message="No se pudieron cargar los ingresos." onRetry={onRetry} />
        ) : (
          <CardLoading rows={4} />
        )
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="text-[28px] font-semibold leading-none tracking-tight tabular-nums text-white" title="Ingresos confirmados de producción (sin registros de prueba).">
              {range === '30d' ? (
                <NA why="Los ingresos solo se calculan para hoy, 7 días y mes en curso; no hay ventana de 30 días." />
              ) : real == null ? (
                <NA why="El libro de comisiones no está disponible." />
              ) : (
                formatMoneyCents(real)
              )}
            </p>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {frozen ? (
              <Chip tone="sky" hint="El flujo de dinero está congelado; estas cifras no son pagaderas.">
                Congelado · no pagadero
              </Chip>
            ) : frozen === false ? (
              <Chip tone="gray" dot={false} hint="Montos confirmados; no implican pago al creador.">
                No pagadero
              </Chip>
            ) : null}
            <span className="text-[11px] text-white/45" title={b.economy.confidenceReason}>
              Estimado:{' '}
              {estimated == null ? <NA why={b.economy.confidenceReason || 'Sin ingreso promedio por clic con base suficiente.'} /> : <b className="font-semibold text-white/75">{formatMoneyCents(estimated)}</b>}
            </span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col justify-end pt-2">
            <p className="mb-1 text-[10px] text-white/40" title="Base de los ingresos estimados (clics × ingreso promedio por clic). No existe serie de ingresos por hora.">
              Clics salientes por {cmd?.series.bucket === 'day' ? 'día' : 'hora'}
            </p>
            {cmd == null ? (
              <EmptyFrame className="h-[98px]">{command.status === 'error' ? 'Serie no disponible.' : 'Cargando serie…'}</EmptyFrame>
            ) : cmd.series.available && cmd.series.points.some((p) => p.outbound > 0) ? (
              <LineSeries
                values={cmd.series.points.map((p) => p.outbound)}
                labels={cmd.series.points.map((p) => p.label)}
                height={48}
                fill
                ariaLabel="Clics salientes por período"
              />
            ) : (
              <EmptyFrame className="h-[98px]">
                {cmd.series.available ? 'Sin clics salientes en el período.' : 'Serie de clics no disponible.'}
              </EmptyFrame>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
