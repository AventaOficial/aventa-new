'use client';

import { useId, type ReactNode } from 'react';
import { cn } from '@/app/components/panel/utils';

export function niceMax(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 4;
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * mag >= v) return Math.max(4, step * mag);
  }
  return 10 * mag;
}

export function compact(n: number): string {
  if (n >= 1000) return `${Math.round(n / 100) / 10}K`;
  return String(Math.round(n * 10) / 10);
}

function ticks(max: number): number[] {
  const count = Number.isInteger(max / 4) ? 4 : Number.isInteger(max / 5) ? 5 : 4;
  return Array.from({ length: count + 1 }, (_, i) => (max / count) * (count - i));
}

function XLabels({ labels, every }: { labels: string[]; every: number }) {
  return (
    <div className="relative mt-1 h-3.5 text-[9px] tabular-nums text-white/45" aria-hidden>
      {labels.map((l, i) =>
        i % every === 0 ? (
          <span
            key={`${l}-${i}`}
            className="absolute -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${((i + 0.5) / labels.length) * 100}%` }}
          >
            {l}
          </span>
        ) : null,
      )}
    </div>
  );
}

function YAxis({ max, format = compact }: { max: number; format?: (n: number) => string }) {
  return (
    <div className="flex h-full flex-col justify-between pr-1.5 text-right text-[9px] tabular-nums leading-none text-white/45" aria-hidden>
      {ticks(max).map((t) => (
        <span key={t} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
          {format(t)}
        </span>
      ))}
    </div>
  );
}

function GridLines({ max }: { max: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between" aria-hidden>
      {ticks(max).map((t) => (
        <div key={t} className="border-t border-dashed border-white/[0.06]" />
      ))}
    </div>
  );
}

/** Barras verticales (SVG propio). `null` = bucket sin dato aÃºn (p. ej. horas futuras). */
export function BarSeries({
  values,
  labels,
  height = 96,
  fill = false,
  ariaLabel,
  labelEvery,
}: {
  values: (number | null)[];
  labels: string[];
  height?: number;
  /** Ocupa el alto libre del contenedor flex (con `height` como mínimo). */
  fill?: boolean;
  ariaLabel: string;
  labelEvery?: number;
}) {
  const gid = useId().replace(/:/g, '');
  const max = niceMax(Math.max(0, ...values.map((v) => v ?? 0)));
  const n = Math.max(1, values.length);
  const slot = 100 / n;
  const barW = slot * 0.62;
  const every = labelEvery ?? Math.max(1, Math.ceil(n / 6));
  return (
    <figure className={cn('w-full', fill && 'flex min-h-0 flex-1 flex-col')} aria-label={ariaLabel} role="img">
      <div className={cn('grid grid-cols-[auto_1fr]', fill && 'flex-1')} style={fill ? { minHeight: height } : { height }}>
        <YAxis max={max} />
        <div className="relative">
          <GridLines max={max} />
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
            <defs>
              <linearGradient id={`bar-${gid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#b49cff" />
                <stop offset="55%" stopColor="#8b5cf6" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#6d28d9" stopOpacity="0.25" />
              </linearGradient>
            </defs>
            {values.map((v, i) => {
              if (v == null || v <= 0) return null;
              const h = (v / max) * 100;
              return <rect key={i} x={i * slot + (slot - barW) / 2} y={100 - h} width={barW} height={h} rx={0.6} fill={`url(#bar-${gid})`} />;
            })}
          </svg>
        </div>
      </div>
      <div className="grid grid-cols-[auto_1fr]">
        <span className="invisible pr-1.5 text-[9px]" aria-hidden>
          {compact(max)}
        </span>
        <XLabels labels={labels} every={every} />
      </div>
    </figure>
  );
}

/** LÃ­nea con Ã¡rea degradada y puntos (SVG propio). */
export function LineSeries({
  values,
  labels,
  height = 120,
  fill = false,
  ariaLabel,
  labelEvery,
}: {
  values: (number | null)[];
  labels: string[];
  height?: number;
  /** Ocupa el alto libre del contenedor flex (con `height` como mínimo). */
  fill?: boolean;
  ariaLabel: string;
  labelEvery?: number;
}) {
  const gid = useId().replace(/:/g, '');
  const max = niceMax(Math.max(0, ...values.map((v) => v ?? 0)));
  const n = Math.max(1, values.length);
  const pts = values
    .map((v, i) => (v == null ? null : { x: ((i + 0.5) / n) * 100, y: 100 - (v / max) * 100 }))
    .filter((p): p is { x: number; y: number } => p != null);
  const line = pts.map((p) => `${p.x},${p.y}`).join(' ');
  const area = pts.length ? `M${pts[0].x},100 L${pts.map((p) => `${p.x},${p.y}`).join(' L')} L${pts[pts.length - 1].x},100 Z` : '';
  const every = labelEvery ?? Math.max(1, Math.ceil(n / 6));
  const showDots = pts.length <= 31;
  return (
    <figure className={cn('w-full', fill && 'flex min-h-0 flex-1 flex-col')} aria-label={ariaLabel} role="img">
      <div className={cn('grid grid-cols-[auto_1fr]', fill && 'flex-1')} style={fill ? { minHeight: height } : { height }}>
        <YAxis max={max} />
        <div className="relative">
          <GridLines max={max} />
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
            <defs>
              <linearGradient id={`area-${gid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
              </linearGradient>
            </defs>
            {area ? <path d={area} fill={`url(#area-${gid})`} /> : null}
            {pts.length > 1 ? (
              <polyline points={line} fill="none" stroke="#a78bfa" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            ) : null}
          </svg>
          {showDots
            ? pts.map((p, i) => (
                <span
                  key={i}
                  aria-hidden
                  className="absolute h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#a78bfa] bg-[#12121c]"
                  style={{ left: `${p.x}%`, top: `${p.y}%` }}
                />
              ))
            : null}
        </div>
      </div>
      <div className="grid grid-cols-[auto_1fr]">
        <span className="invisible pr-1.5 text-[9px]" aria-hidden>
          {compact(max)}
        </span>
        <XLabels labels={labels} every={every} />
      </div>
    </figure>
  );
}

/** Donut de uso. `pct` null = sin base real: riel tenue sin arco de valor; el centro muestra el contenido recibido. */
export function Donut({ pct, size = 132, stroke = 12, children }: { pct: number | null; size?: number; stroke?: number; children: ReactNode }) {
  const gid = useId().replace(/:/g, '');
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const val = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={`donut-${gid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#c4b5fd" />
            <stop offset="100%" stopColor="#7c3aed" />
          </linearGradient>
        </defs>
        {pct == null ? (
          <>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#donut-${gid})`} strokeOpacity={0.16} strokeWidth={stroke} />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r - stroke / 2 - 5}
              fill="none"
              stroke="rgba(196,181,253,0.22)"
              strokeWidth={1}
              strokeDasharray="2 5"
            />
          </>
        ) : (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
        )}
        {val > 0 ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={`url(#donut-${gid})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${(val / 100) * c} ${c}`}
          />
        ) : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

export function ProgressRing({ pct, size = 46, stroke = 4, children, className }: { pct: number | null; size?: number; stroke?: number; children: ReactNode; className?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const val = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        {val > 0 ? (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#8b5cf6" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(val / 100) * c} ${c}`} />
        ) : null}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-white">{children}</div>
    </div>
  );
}
