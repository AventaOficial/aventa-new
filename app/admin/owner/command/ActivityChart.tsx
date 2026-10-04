'use client';

import { useState } from 'react';
import type { OwnerCommandPayload, SeriesPoint } from '@/lib/owner/buildOwnerCommand';
import { cn } from '@/app/components/panel/utils';
import { BarSeries } from './ceo/charts';
import { EmptyNote } from './ui';

type SeriesKey = keyof Omit<SeriesPoint, 'label'>;

const METRICS: { key: SeriesKey; label: string; definition: string }[] = [
  { key: 'outbound', label: 'Clics a tienda', definition: 'Clics salientes hacia tiendas' },
  { key: 'offers', label: 'Ofertas creadas', definition: 'Ofertas creadas (todas las fuentes)' },
  { key: 'newUsers', label: 'Usuarios nuevos', definition: 'Cuentas nuevas' },
  { key: 'activeUsers', label: 'Último acceso', definition: 'Usuarios por hora/día de su último acceso (no es presencia en vivo)' },
];

/** Serie del período seleccionado; en "Hoy" el eje cubre las 24 h y las horas futuras quedan vacías. */
export default function ActivityChart({ series, rangeKey, compact = false }: { series: OwnerCommandPayload['series']; rangeKey?: string; compact?: boolean }) {
  const [metric, setMetric] = useState<SeriesKey>('outbound');
  const def = METRICS.find((m) => m.key === metric) ?? METRICS[0];
  const unavailable = !series.available || (metric === 'activeUsers' && !series.activeUsersAvailable);

  const values: (number | null)[] = series.points.map((p) => p[metric]);
  const labels = series.points.map((p) => p.label);
  if (series.bucket === 'hour' && rangeKey === 'today') {
    for (let h = values.length; h < 24; h += 1) {
      values.push(null);
      labels.push(String(h).padStart(2, '0'));
    }
  }
  const real = values.filter((v): v is number => v != null);
  const total = real.reduce((a, b) => a + b, 0);
  const max = real.length ? Math.max(...real) : 0;

  return (
    <figure className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Métrica de la gráfica">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              aria-pressed={metric === m.key}
              onClick={() => setMetric(m.key)}
              className={cn(
                'min-h-[28px] rounded-lg px-2 py-0.5 text-[10.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70',
                metric === m.key ? 'bg-violet-600 text-white' : 'text-white/50 hover:bg-white/[0.05] hover:text-white/80',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        {!unavailable ? (
          <span className="text-[10px] tabular-nums text-white/45">
            total {total.toLocaleString('es-MX')} · máx {max.toLocaleString('es-MX')}/{series.bucket === 'hour' ? 'h' : 'día'}
          </span>
        ) : null}
      </div>
      {unavailable ? (
        <EmptyNote>Serie de “{def.label.toLowerCase()}” no disponible para este período.</EmptyNote>
      ) : (
        <BarSeries
          values={values}
          labels={labels}
          height={compact ? 84 : 210}
          labelEvery={series.bucket === 'hour' ? 4 : undefined}
          ariaLabel={`${def.definition} por ${series.bucket === 'hour' ? 'hora' : 'día'}: total ${total}, máximo ${max}`}
        />
      )}
      <figcaption className="mt-1 text-[10px] text-white/35">
        {def.definition} · por {series.bucket === 'hour' ? 'hora (MX)' : 'día (MX)'}
        {total === 0 && !unavailable ? ' · 0 real en el período' : ''}
        {series.truncated ? ' · serie parcial' : ''}
      </figcaption>
    </figure>
  );
}
