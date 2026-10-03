'use client';

import { useState } from 'react';
import type { OwnerCommandPayload, SeriesPoint } from '@/lib/owner/buildOwnerCommand';
import { cn } from '@/app/components/panel/utils';
import { EmptyNote, ErrorNote } from './ui';

const METRICS: { key: keyof Omit<SeriesPoint, 'label'>; label: string; source: string }[] = [
  { key: 'outbound', label: 'Clics a tienda', source: 'offer_events outbound' },
  { key: 'offers', label: 'Ofertas creadas', source: 'offers.created_at' },
  { key: 'newUsers', label: 'Usuarios nuevos', source: 'profiles.created_at' },
];

export default function ActivityChart({ series, compact = false }: { series: OwnerCommandPayload['series']; compact?: boolean }) {
  const [metric, setMetric] = useState<(typeof METRICS)[number]['key']>('outbound');
  const def = METRICS.find((m) => m.key === metric) ?? METRICS[0];

  if (!series.available) return <ErrorNote message="Serie temporal no disponible (falló la lectura de eventos)." />;

  const values = series.points.map((p) => p[metric]);
  const max = Math.max(0, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const step = Math.max(1, Math.ceil(series.points.length / (compact ? 4 : 8)));
  const height = compact ? 'h-20' : 'h-32 xl:h-64';

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
                'rounded-md px-2 py-0.5 text-[10px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60',
                metric === m.key ? 'bg-violet-500/20 text-violet-100' : 'text-white/45 hover:text-white/75',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <span className="text-[10px] tabular-nums text-white/40">
          total {total.toLocaleString('es-MX')} · máx {max.toLocaleString('es-MX')}/{series.bucket === 'hour' ? 'h' : 'día'}
        </span>
      </div>
      {total === 0 ? (
        <EmptyNote>Sin eventos de “{def.label.toLowerCase()}” en el período (0 real).</EmptyNote>
      ) : (
        <div className={cn('flex items-end gap-px', height)} role="img" aria-label={`${def.label} por ${series.bucket === 'hour' ? 'hora' : 'día'}: total ${total}, máximo ${max}`}>
          {series.points.map((p, i) => {
            const v = p[metric];
            const pct = max > 0 ? (v / max) * 100 : 0;
            return (
              <div key={`${p.label}-${i}`} className="flex h-full min-w-0 flex-1 items-end" title={`${p.label}: ${v}`}>
                <div className={cn('w-full rounded-t-sm', v > 0 ? 'bg-violet-400/70' : 'bg-white/[0.05]')} style={{ height: `${Math.max(v > 0 ? 4 : 2, pct)}%` }} />
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-1 flex justify-between text-[9px] tabular-nums text-white/30" aria-hidden>
        {series.points.map((p, i) => (i % step === 0 ? <span key={`${p.label}-l-${i}`}>{p.label}</span> : null))}
      </div>
      <figcaption className="mt-1 text-[10px] text-white/30">
        Fuente: {def.source} · por {series.bucket === 'hour' ? 'hora (MX)' : 'día (MX)'}
        {series.truncated ? ' · serie parcial: se superó el tope de filas leídas' : ''}
      </figcaption>
    </figure>
  );
}
