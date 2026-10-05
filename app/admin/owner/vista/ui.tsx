'use client';

import type { ComponentType, ReactNode } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowRight, ArrowUp, ChevronDown } from 'lucide-react';
import { cn } from '@/app/components/panel/utils';

const CARD = 'rounded-2xl border border-white/[0.07] bg-[#141422]';

export function Delta({ text, up, suffix = 'vs. ayer' }: { text: string; up: boolean; suffix?: string }) {
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[11px] font-semibold', up ? 'text-emerald-400' : 'text-rose-400')}>
      <Icon className="h-3 w-3" aria-hidden />
      {text}
      {suffix ? <span className="ml-1 font-normal text-white/45">{suffix}</span> : null}
    </span>
  );
}

export function KpiCard({
  icon: Icon,
  tint,
  label,
  value,
  sub,
  delta,
  up,
  bar,
}: {
  icon: ComponentType<{ className?: string }>;
  tint: string;
  label: string;
  value: string;
  sub?: string;
  delta?: string;
  up?: boolean;
  bar?: number;
}) {
  return (
    <article className={cn(CARD, 'p-3')}>
      <span className={cn('inline-flex h-8 w-8 items-center justify-center rounded-xl', tint)} aria-hidden>
        <Icon className="h-4 w-4" />
      </span>
      <p className="mt-2 truncate text-[11px] text-white/50">{label}</p>
      <p className="mt-1 text-[22px] font-semibold leading-none tracking-tight tabular-nums text-white">{value}</p>
      {sub ? <p className="mt-1 text-[10px] text-white/45">{sub}</p> : null}
      {bar != null ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300" style={{ width: `${Math.max(0, Math.min(100, bar))}%` }} />
        </div>
      ) : null}
      {delta != null && up != null ? (
        <p className="mt-1.5">
          <Delta text={delta} up={up} />
        </p>
      ) : null}
    </article>
  );
}

export function Panel({
  title,
  icon: Icon,
  extra,
  children,
  className,
}: {
  title: string;
  icon?: ComponentType<{ className?: string }>;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(CARD, 'flex min-w-0 flex-col p-3.5', className)}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-white">
          {Icon ? <Icon className="h-4 w-4 shrink-0 text-violet-300" aria-hidden /> : null}
          <span className="truncate">{title}</span>
        </h2>
        {extra ? <div className="flex shrink-0 items-center gap-1.5">{extra}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function Ghost({ children, href }: { children: ReactNode; href?: string }) {
  const className = 'inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[10.5px] font-medium text-white/70 hover:bg-white/[0.07]';
  if (href) {
    return (
      <Link href={href} className={className}>
        {children}
        <ArrowRight className="h-3 w-3" aria-hidden />
      </Link>
    );
  }
  return <span className={className}>{children}</span>;
}

export function DateChip() {
  const label = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
  return (
    <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/80">
      {`Hoy, ${label}`}
      <ChevronDown className="h-3.5 w-3.5 text-white/50" aria-hidden />
    </span>
  );
}

const RANGES = [
  { key: 'today', label: 'Hoy' },
  { key: '7d', label: '7 días' },
  { key: '30d', label: '30 días' },
  { key: 'month', label: 'Mes' },
] as const;

export type VistaRangeKey = (typeof RANGES)[number]['key'];

export function PeriodBar({ value = 'today', onChange }: { value?: VistaRangeKey; onChange?: (key: VistaRangeKey) => void }) {
  return (
    <div className="flex rounded-xl bg-white/[0.04] p-1" role="group" aria-label="Período">
      {RANGES.map((r) => (
        <button
          key={r.key}
          type="button"
          aria-pressed={value === r.key}
          onClick={() => onChange?.(r.key)}
          className={cn(
            'rounded-lg px-3 py-1 text-[12px] font-medium transition-colors',
            value === r.key ? 'bg-violet-600 text-white' : 'text-white/55 hover:text-white/80',
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

export function StatusPill({ children, tone = 'green' }: { children: ReactNode; tone?: 'green' | 'violet' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
        tone === 'green' ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-300' : 'border-violet-400/30 bg-violet-500/15 text-violet-200',
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', tone === 'green' ? 'bg-emerald-400' : 'bg-violet-300')} aria-hidden />
      {children}
    </span>
  );
}

export function LineChart({
  series,
  height = 150,
  labels,
}: {
  series: { values: number[]; color: string; name?: string }[];
  height?: number;
  labels?: string[];
}) {
  const all = series.flatMap((s) => s.values);
  const max = Math.max(...all, 1);
  const n = Math.max(...series.map((s) => s.values.length), 2);
  const path = (values: number[]) =>
    values
      .map((v, i) => {
        const x = (i / (values.length - 1)) * 100;
        const y = 100 - (v / max) * 92 - 4;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  return (
    <div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden>
        {[20, 40, 60, 80].map((y) => (
          <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="0.4" />
        ))}
        {series.map((s) => (
          <path key={s.color + (s.name ?? '')} d={path(s.values)} fill="none" stroke={s.color} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      {labels ? (
        <div className="mt-1 flex justify-between text-[9px] tabular-nums text-white/35">
          {labels.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      ) : null}
      <span className="sr-only">{n} puntos</span>
    </div>
  );
}

export function Columns({
  values,
  labels,
  color = '#8b5cf6',
  height = 140,
}: {
  values: number[];
  labels?: string[];
  color?: string;
  height?: number;
}) {
  const max = Math.max(...values, 1);
  return (
    <div>
      <div className="flex items-end gap-[3px]" style={{ height }} aria-hidden>
        {values.map((v, i) => (
          <div key={i} className="flex-1 rounded-t-sm" style={{ height: `${Math.max(4, (v / max) * 100)}%`, background: color, opacity: 0.35 + (v / max) * 0.65 }} />
        ))}
      </div>
      {labels ? (
        <div className="mt-1 flex justify-between text-[9px] text-white/35">
          {labels.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function StackedColumns({
  series,
  height = 150,
  labels,
}: {
  series: { name: string; color: string; values: number[] }[];
  height?: number;
  labels?: string[];
}) {
  const n = series[0]?.values.length ?? 0;
  const totals = Array.from({ length: n }, (_, i) => series.reduce((acc, s) => acc + (s.values[i] ?? 0), 0));
  const max = Math.max(...totals, 1);
  return (
    <div>
      <div className="flex items-end gap-1" style={{ height }} aria-hidden>
        {totals.map((total, i) => (
          <div key={i} className="flex flex-1 flex-col justify-end" style={{ height: `${(total / max) * 100}%` }}>
            {series.map((s) => (
              <div key={s.name} style={{ height: `${((s.values[i] ?? 0) / total) * 100}%`, background: s.color }} />
            ))}
          </div>
        ))}
      </div>
      {labels ? (
        <div className="mt-1 flex justify-between text-[9px] tabular-nums text-white/35">
          {labels.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      ) : null}
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {series.map((s) => (
          <li key={s.name} className="inline-flex items-center gap-1.5 text-[10px] text-white/55">
            <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} aria-hidden />
            {s.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Donut({
  parts,
  size = 132,
  stroke = 14,
  children,
}: {
  parts: { pct: number; color: string }[];
  size?: number;
  stroke?: number;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const slices = parts.map((p, i) => {
    const len = (Math.max(0, p.pct) / 100) * c;
    const start = parts.slice(0, i).reduce((acc, prev) => acc + (Math.max(0, prev.pct) / 100) * c, 0);
    return { ...p, len, start };
  });
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        {slices.map((p) => (
          <circle
            key={p.color + p.start}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={p.color}
            strokeWidth={stroke}
            strokeDasharray={`${p.len} ${c - p.len}`}
            strokeDashoffset={-p.start}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

export function Gauge({ pct, children }: { pct: number; children?: ReactNode }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative mx-auto h-[92px] w-[160px]">
      <svg viewBox="0 0 160 92" className="h-full w-full" aria-hidden>
        <path d="M16 84 A64 64 0 0 1 144 84" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="12" strokeLinecap="round" />
        <path
          d="M16 84 A64 64 0 0 1 144 84"
          fill="none"
          stroke="url(#gauge)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${(p / 100) * 201} 201`}
        />
        <defs>
          <linearGradient id="gauge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="55%" stopColor="#a3e635" />
            <stop offset="100%" stopColor="#fbbf24" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">{children}</div>
    </div>
  );
}

export function Spark({ values, color = '#34d399' }: { values: number[]; color?: string }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const d = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 64;
      const y = 18 - ((v - min) / (max - min || 1)) * 16;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg viewBox="0 0 64 20" className="h-5 w-16" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" />
    </svg>
  );
}

export function Thin({ pct, color = '#8b5cf6' }: { pct: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10" aria-hidden>
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </div>
  );
}

export function wave(n: number, seed: number, base: number, amp: number): number[] {
  return Array.from({ length: n }, (_, i) =>
    Math.max(0, Math.round(base + amp * Math.sin(i / 2.4 + seed) + ((i * 13 + seed * 7) % 7) - 3)),
  );
}
