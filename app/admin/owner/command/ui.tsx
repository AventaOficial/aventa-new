'use client';

import type { ComponentType, ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp, RefreshCw } from 'lucide-react';
import { cn } from '@/app/components/panel/utils';
import type { Provenance, SourceState, HealthLevel } from './types';

export function formatCount(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('es-MX');
}

export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const diff = Math.max(0, now - t);
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'hace segundos';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0b0b14]';

const PROVENANCE_STYLE: Record<Provenance, string> = {
  REAL: 'border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-300/90',
  CALCULATED: 'border-sky-400/25 bg-sky-400/[0.06] text-sky-300/90',
  UNAVAILABLE: 'border-white/15 bg-white/[0.03] text-white/45',
};

const PROVENANCE_HINT: Record<Provenance, string> = {
  REAL: 'Lectura directa de datos de Aventa.',
  CALCULATED: 'Calculado a partir de datos reales con una regla fija.',
  UNAVAILABLE: 'No existe fuente para este dato o la lectura falló.',
};

export function ProvenanceBadge({ kind, hint }: { kind: Provenance; hint?: string }) {
  return (
    <span
      title={hint ?? PROVENANCE_HINT[kind]}
      className={cn(
        'inline-flex shrink-0 items-center rounded-md border px-1.5 py-px text-[8.5px] font-semibold uppercase tracking-[0.12em]',
        PROVENANCE_STYLE[kind],
      )}
    >
      {kind}
    </span>
  );
}

export const HEALTH_STYLE: Record<HealthLevel, { dot: string; text: string; ring: string; label: string }> = {
  HEALTHY: { dot: 'bg-emerald-400', text: 'text-emerald-300', ring: 'border-emerald-400/25 bg-emerald-400/[0.07]', label: 'Sano' },
  WARNING: { dot: 'bg-amber-400', text: 'text-amber-300', ring: 'border-amber-400/25 bg-amber-400/[0.07]', label: 'Atención' },
  CRITICAL: { dot: 'bg-red-400', text: 'text-red-300', ring: 'border-red-400/30 bg-red-400/[0.08]', label: 'Crítico' },
  UNKNOWN: { dot: 'bg-white/30', text: 'text-white/55', ring: 'border-white/10 bg-white/[0.03]', label: 'Sin dato' },
  FROZEN: { dot: 'bg-sky-400', text: 'text-sky-300', ring: 'border-sky-400/25 bg-sky-400/[0.07]', label: 'Congelado' },
};

export function HealthPill({ level, label }: { level: HealthLevel; label?: string }) {
  const s = HEALTH_STYLE[level];
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold', s.ring, s.text)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} aria-hidden />
      {label ?? s.label}
    </span>
  );
}

export function Panel({
  id,
  title,
  icon: Icon,
  subtitle,
  action,
  badge,
  children,
  className,
}: {
  id?: string;
  title: string;
  icon?: ComponentType<{ className?: string }>;
  subtitle?: ReactNode;
  action?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(
        'min-w-0 scroll-mt-20 rounded-2xl border border-white/[0.07] bg-[#12121c] p-4 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset,0_12px_32px_-20px_rgba(0,0,0,0.9)]',
        className,
      )}
    >
      <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          {Icon ? (
            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#2a1f4d] text-violet-300 ring-1 ring-inset ring-violet-400/20">
              <Icon className="h-4 w-4" />
            </span>
          ) : null}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id={headingId} className="text-[13px] font-semibold tracking-tight text-white">
                {title}
              </h2>
              {badge}
            </div>
            {subtitle ? <p className="mt-0.5 text-[11px] leading-snug text-white/45">{subtitle}</p> : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function CtaLink({ href, children, tone = 'default' }: { href: string; children: ReactNode; tone?: 'default' | 'danger' | 'primary' }) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex min-h-[32px] items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors',
        tone === 'danger'
          ? 'border-red-400/30 bg-red-500/15 text-red-200 hover:bg-red-500/25'
          : tone === 'primary'
            ? 'border-violet-400/30 bg-violet-600/80 text-white hover:bg-violet-600'
            : 'border-white/[0.09] bg-white/[0.03] text-white/80 hover:bg-white/[0.08] hover:text-white',
        FOCUS,
      )}
    >
      {children}
      <ArrowRight className="h-3 w-3" aria-hidden />
    </Link>
  );
}

/** Variación vs período anterior equivalente: solo si es calculable (anterior > 0). Sin interpretar causa. */
export function Delta({ current, previous, invert = false, label }: { current: number | null; previous: number | null; invert?: boolean; label?: string }) {
  if (current == null || previous == null || previous <= 0) {
    const why = current == null || previous == null ? 'Sin período comparable: la variación no es calculable.' : 'El período anterior fue 0: la variación % no es calculable.';
    return (
      <span className="text-[10px] text-white/35" title={why}>
        —<span className="sr-only">. {why}</span>
      </span>
    );
  }
  const pct = Math.round(((current - previous) / previous) * 1000) / 10;
  if (pct === 0) {
    return (
      <span className="text-[10px] text-white/40" title={label ? `Igual que ${label} (${previous.toLocaleString('es-MX')})` : undefined}>
        Sin cambio
      </span>
    );
  }
  const up = pct > 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn('inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums', good ? 'text-emerald-400' : 'text-red-400')}
      title={label ? `vs ${label}: ${previous.toLocaleString('es-MX')}` : `Anterior: ${previous.toLocaleString('es-MX')}`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {Math.abs(pct).toLocaleString('es-MX')}%
    </span>
  );
}

export function Metric({
  label,
  value,
  provenance,
  hint,
  footer,
  tone,
}: {
  label: string;
  value: ReactNode;
  provenance: Provenance;
  hint?: string;
  footer?: ReactNode;
  tone?: 'warn' | 'bad' | 'good';
}) {
  return (
    <div className="min-w-0 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <p className="text-[10.5px] font-medium leading-snug text-white/55" title={hint ?? label}>
          {label}
        </p>
        <ProvenanceBadge kind={provenance} />
      </div>
      <p
        className={cn(
          'mt-1.5 text-[20px] font-semibold tabular-nums leading-tight tracking-tight',
          tone === 'bad' ? 'text-red-300' : tone === 'warn' ? 'text-amber-200' : tone === 'good' ? 'text-emerald-200' : 'text-white',
        )}
      >
        {provenance === 'UNAVAILABLE' && value === '—' ? <Unavailable what={hint ?? 'Sin datos'} /> : value}
      </p>
      {footer ? <div className="mt-1">{footer}</div> : null}
    </div>
  );
}

export function Unavailable({ what }: { what: string }) {
  return (
    <span className="cursor-help text-sm font-medium text-white/40" title={what}>
      No disponible
      <span className="sr-only">: {what}</span>
    </span>
  );
}

export function Bar({ value, max, tone = 'violet' }: { value: number; max: number; tone?: 'violet' | 'green' | 'amber' | 'red' | 'gray' }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const color =
    tone === 'green'
      ? 'bg-emerald-400'
      : tone === 'amber'
        ? 'bg-amber-400'
        : tone === 'red'
          ? 'bg-red-500'
          : tone === 'gray'
            ? 'bg-white/30'
            : 'bg-gradient-to-r from-violet-600 to-violet-400';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]" aria-hidden>
      <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-xl bg-white/[0.05]" />
      ))}
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-400/20 bg-red-500/[0.06] px-3 py-2.5">
      <p className="flex min-w-[10rem] flex-1 items-start gap-2 text-xs leading-snug text-red-200/90">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {message}
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className={cn('inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-white/75 hover:bg-white/[0.06]', FOCUS)}
        >
          <RefreshCw className="h-3 w-3" aria-hidden />
          Reintentar
        </button>
      ) : null}
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-white/[0.08] px-3 py-4 text-center text-xs text-white/45">{children}</p>;
}

/** Envuelve contenido dependiente de una fuente con estados loading / error / stale. El detalle técnico del error vive en Diagnóstico. */
export function SourceGate<T>({
  source,
  children,
  onRetry,
  rows,
  label,
}: {
  source: SourceState<T>;
  children: (data: T) => ReactNode;
  onRetry?: () => void;
  rows?: number;
  label: string;
}) {
  if (source.data == null) {
    if (source.status === 'error') return <ErrorNote message={`No se pudo cargar ${label}. Detalle en Diagnóstico técnico.`} onRetry={onRetry} />;
    return <SkeletonRows rows={rows} />;
  }
  return (
    <>
      {source.status === 'error' ? (
        <div className="mb-2">
          <ErrorNote message={`Mostrando datos anteriores de ${label}: la última actualización falló.`} onRetry={onRetry} />
        </div>
      ) : null}
      {children(source.data)}
    </>
  );
}
