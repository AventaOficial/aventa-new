'use client';

import type { ComponentType, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp, ChevronDown, RefreshCw } from 'lucide-react';
import { cn } from '@/app/components/panel/utils';
import { OWNER_RANGE_KEYS, OWNER_RANGE_LABELS, type OwnerRangeKey } from '@/lib/owner/ownerRange';

export const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70';

export function Card({
  id,
  labelledBy,
  className,
  children,
  href,
}: {
  id?: string;
  labelledBy?: string;
  className?: string;
  children: ReactNode;
  /** Al hacer clic en el bloque (no en un control interno) abre esta vista. */
  href?: string;
}) {
  const router = useRouter();
  const go = () => {
    if (href) router.push(href);
  };
  const onClick = (e: MouseEvent<HTMLElement>) => {
    if (!href) return;
    const el = e.target as HTMLElement;
    if (el.closest('a, button, select, input, textarea, label')) return;
    go();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!href || e.key !== 'Enter' || e.target !== e.currentTarget) return;
    go();
  };
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      onClick={href ? onClick : undefined}
      onKeyDown={href ? onKeyDown : undefined}
      tabIndex={href ? 0 : undefined}
      className={cn(
        '@container flex min-w-0 flex-col rounded-2xl border border-white/[0.07] bg-[#12121c] p-3 lg:p-2.5 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset,0_12px_32px_-20px_rgba(0,0,0,0.9)]',
        href && 'cursor-pointer hover:border-violet-400/25',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  id,
  title,
  suffix,
  icon: Icon,
  iconStyle = 'box',
  action,
  className,
  level = 3,
}: {
  id: string;
  title: ReactNode;
  suffix?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  iconStyle?: 'box' | 'plain';
  action?: ReactNode;
  className?: string;
  level?: 2 | 3;
}) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <header className={cn('flex items-center justify-between gap-2', className)}>
      <div className="flex min-w-0 items-center gap-2">
        {Icon ? (
          iconStyle === 'box' ? (
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-[#2a1f4d] text-violet-300 ring-1 ring-inset ring-violet-400/20">
              <Icon className="h-4 w-4" />
            </span>
          ) : (
            <Icon className="h-5 w-5 shrink-0 text-violet-400" />
          )
        ) : null}
        <Heading id={id} className="min-w-0 text-[13px] font-semibold leading-snug tracking-tight text-white">
          {title}
          {suffix ? <span className="ml-1 font-normal text-white/45">{suffix}</span> : null}
        </Heading>
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">{action}</div> : null}
    </header>
  );
}

const VIEW_BTN =
  'inline-flex min-h-[24px] items-center gap-1 whitespace-nowrap rounded-lg border border-white/[0.09] bg-white/[0.03] px-2 py-0.5 text-[10.5px] font-medium text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white';

export function ViewLink({ href, children, label }: { href: string; children: ReactNode; label?: string }) {
  return (
    <Link href={href} aria-label={label} className={cn(VIEW_BTN, FOCUS_RING)}>
      {children}
      <ArrowRight className="h-3 w-3" aria-hidden />
    </Link>
  );
}

export function ViewButton({
  onClick,
  children,
  expanded,
  controls,
}: {
  onClick: () => void;
  children: ReactNode;
  expanded?: boolean;
  controls?: string;
}) {
  return (
    <button type="button" onClick={onClick} aria-expanded={expanded} aria-controls={controls} className={cn(VIEW_BTN, FOCUS_RING)}>
      {children}
      <ArrowRight className={cn('h-3 w-3 transition-transform', expanded && 'rotate-90')} aria-hidden />
    </button>
  );
}

export type ChipTone = 'green' | 'red' | 'amber' | 'violet' | 'gray' | 'sky';

const CHIP_TONE: Record<ChipTone, { box: string; dot: string }> = {
  green: { box: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300', dot: 'bg-emerald-400' },
  red: { box: 'border-red-400/25 bg-red-500/10 text-red-300', dot: 'bg-red-400' },
  amber: { box: 'border-amber-400/25 bg-amber-500/10 text-amber-300', dot: 'bg-amber-400' },
  violet: { box: 'border-violet-400/25 bg-violet-500/15 text-violet-200', dot: 'bg-violet-400' },
  sky: { box: 'border-sky-400/25 bg-sky-500/10 text-sky-300', dot: 'bg-sky-400' },
  gray: { box: 'border-white/10 bg-white/[0.04] text-white/55', dot: 'bg-white/35' },
};

export function Chip({ tone, children, hint, dot = true }: { tone: ChipTone; children: ReactNode; hint?: string; dot?: boolean }) {
  return (
    <span
      title={hint}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold',
        CHIP_TONE[tone].box,
      )}
    >
      {dot ? <span className={cn('h-1.5 w-1.5 rounded-full', CHIP_TONE[tone].dot)} aria-hidden /> : null}
      {children}
      {hint ? <span className="sr-only">. {hint}</span> : null}
    </span>
  );
}

/** Chip "Hoy ▾" de la referencia: selector nativo que cambia el período global. */
export function RangeChip({ range, onChange, label }: { range: OwnerRangeKey; onChange: (r: OwnerRangeKey) => void; label: string }) {
  return (
    <span className="relative inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-white/[0.09] bg-white/[0.03] py-0.5 pl-2 pr-1.5 text-[10.5px] font-medium text-white/80 focus-within:ring-2 focus-within:ring-violet-400/70 hover:bg-white/[0.08]">
      <span aria-hidden>{OWNER_RANGE_LABELS[range]}</span>
      <ChevronDown className="h-3 w-3 text-white/60" aria-hidden />
      <select
        aria-label={label}
        value={range}
        onChange={(e) => onChange(e.target.value as OwnerRangeKey)}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 focus:outline-none"
      >
        {OWNER_RANGE_KEYS.map((k) => (
          <option key={k} value={k} className="bg-[#12121c] text-white">
            {OWNER_RANGE_LABELS[k]}
          </option>
        ))}
      </select>
    </span>
  );
}

export type BarTone = 'violet' | 'green' | 'amber' | 'red' | 'gray';

const BAR_TONE: Record<BarTone, string> = {
  violet: 'bg-gradient-to-r from-violet-600 to-violet-400',
  green: 'bg-emerald-400',
  amber: 'bg-amber-400',
  red: 'bg-red-500',
  gray: 'bg-white/25',
};

/** Barra fina redondeada. `pct` null = sin base: se dibuja solo el riel. */
export function ThinBar({ pct, tone = 'violet', className }: { pct: number | null; tone?: BarTone; className?: string }) {
  const w = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]', className)} aria-hidden>
      {w > 0 ? <div className={cn('h-full rounded-full', BAR_TONE[tone])} style={{ width: `${w}%` }} /> : null}
    </div>
  );
}

/** Variación % vs período anterior. Solo se muestra si es calculable. */
export function DeltaPct({
  current,
  previous,
  invert = false,
  vsLabel,
  size = 'sm',
}: {
  current: number | null;
  previous: number | null;
  invert?: boolean;
  vsLabel?: string;
  size?: 'sm' | 'md';
}) {
  const text = size === 'md' ? 'text-[12px]' : 'text-[10px]';
  if (current == null || previous == null || previous <= 0) {
    const why =
      current == null || previous == null
        ? 'Sin dato del período anterior: la variación no es calculable.'
        : 'El período anterior fue 0: la variación % no es calculable.';
    return (
      <span className={cn(text, 'text-white/35')} title={why}>
        —{vsLabel ? ` ${vsLabel}` : ''}
        <span className="sr-only">. {why}</span>
      </span>
    );
  }
  const pct = Math.round(((current - previous) / previous) * 1000) / 10;
  const up = pct > 0;
  const flat = pct === 0;
  if (flat) {
    return (
      <span className={cn(text, 'text-white/40')} title={`Igual que el período anterior (${previous.toLocaleString('es-MX')})`}>
        Sin cambio{vsLabel ? ` ${vsLabel}` : ''}
      </span>
    );
  }
  const good = invert ? !up : up;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 font-semibold tabular-nums',
        text,
        good ? 'text-emerald-400' : 'text-red-400',
      )}
      title={`Anterior: ${previous.toLocaleString('es-MX')}`}
    >
      <Icon className={size === 'md' ? 'h-3.5 w-3.5' : 'h-3 w-3'} aria-hidden />
      {Math.abs(pct).toLocaleString('es-MX')}%
      {vsLabel ? <span className="ml-1 font-normal text-white/55">{vsLabel}</span> : null}
    </span>
  );
}

/** Valor ausente: "—" o "No disponible" con tooltip que explica por qué. */
export function NA({ why, long = false, className }: { why: string; long?: boolean; className?: string }) {
  return (
    <span title={why} className={cn('cursor-help text-white/40', className)}>
      {long ? 'No disponible' : '—'}
      <span className="sr-only">. No disponible: {why}</span>
    </span>
  );
}

export function Skel({ className }: { className?: string }) {
  return <span className={cn('block animate-pulse rounded-lg bg-white/[0.05]', className)} aria-hidden />;
}

export function CardLoading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="mt-4 flex flex-1 flex-col gap-2" aria-busy="true" aria-label="Cargando">
      <Skel className="h-8 w-1/2" />
      {Array.from({ length: rows }, (_, i) => (
        <Skel key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}

export function CardError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="mt-4 flex flex-1 flex-col items-start justify-center gap-2 rounded-xl border border-red-400/20 bg-red-500/[0.06] p-3">
      <p className="flex items-start gap-2 text-[11px] leading-snug text-red-200/90">
        <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
        {message}
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className={cn(
            'inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] text-white/75 hover:bg-white/[0.06]',
            FOCUS_RING,
          )}
        >
          <RefreshCw className="h-3 w-3" aria-hidden />
          Reintentar
        </button>
      ) : null}
    </div>
  );
}

export function EmptyFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-xl border border-dashed border-white/[0.08] px-3 py-4 text-center text-[11px] leading-snug text-white/40',
        className,
      )}
    >
      {children}
    </div>
  );
}
