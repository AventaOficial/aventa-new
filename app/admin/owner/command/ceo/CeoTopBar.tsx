'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { OWNER_RANGE_KEYS, OWNER_RANGE_LABELS, type OwnerRangeKey } from '@/lib/owner/ownerRange';
import { OWNER_DASHBOARD_TZ } from '@/lib/owner/mxTime';
import type { OwnerCommandPayload } from '@/lib/owner/buildOwnerCommand';
import { cn } from '@/app/components/panel/utils';
import { STALE_AFTER_MS } from '../useCommandCenter';
import { FOCUS_RING } from './kit';

function todayLabel(now: number): string {
  const parts = new Intl.DateTimeFormat('es-MX', { timeZone: OWNER_DASHBOARD_TZ, day: 'numeric', month: 'short', year: 'numeric' }).formatToParts(
    new Date(now),
  );
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? '';
  const month = get('month').replace('.', '');
  return `Hoy, ${get('day')} de ${month.charAt(0).toUpperCase()}${month.slice(1)} ${get('year')}`;
}

function formatInstant(iso: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: OWNER_DASHBOARD_TZ,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

function updatedText(lastUpdated: number | null, now: number): string {
  if (lastUpdated == null) return 'Sin datos aún';
  const min = Math.max(0, Math.round((now - lastUpdated) / 60_000));
  if (min < 1) return 'Actualizado hace segundos';
  if (min < 60) return `Actualizado hace ${min} min`;
  return `Actualizado hace ${Math.round(min / 60)} h`;
}

export default function CeoTopBar({
  range,
  onRangeChange,
  rangePending,
  lastUpdated,
  refreshing,
  onRefresh,
  now,
  period,
}: {
  range: OwnerRangeKey;
  onRangeChange: (r: OwnerRangeKey) => void;
  rangePending: boolean;
  lastUpdated: number | null;
  refreshing: boolean;
  onRefresh: () => void;
  now: number;
  period: OwnerCommandPayload['range'] | null;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const stale = lastUpdated != null && now - lastUpdated > STALE_AFTER_MS;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end sm:gap-2.5">
      <div ref={boxRef} className="relative">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="ceo-period-info"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'inline-flex h-9 items-center gap-2 rounded-xl border border-white/[0.08] bg-[#12121c] px-3 text-[12px] font-medium text-white/85 hover:bg-white/[0.05] sm:gap-2.5 sm:px-3.5',
            FOCUS_RING,
          )}
        >
          <CalendarDays className="h-4 w-4 text-white/70" aria-hidden />
          <span>{todayLabel(now)}</span>
          <ChevronDown className={cn('h-3.5 w-3.5 text-white/55 transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
        {open ? (
          <div
            id="ceo-period-info"
            role="dialog"
            aria-label="Período consultado"
            className="absolute left-0 top-full z-20 mt-2 w-72 rounded-xl border border-white/[0.1] bg-[#161622] p-3 text-[11px] text-white/70 shadow-2xl"
          >
            <p className="font-semibold text-white">Período: {OWNER_RANGE_LABELS[range]}</p>
            {period ? (
              <>
                <p className="mt-1">
                  {formatInstant(period.start)} → {formatInstant(period.end)}
                </p>
                <p className="mt-1 text-white/45">Comparación: {period.prevLabel}.</p>
              </>
            ) : (
              <p className="mt-1 text-white/45">Cargando período…</p>
            )}
            <p className="mt-2 text-white/40">Fechas en hora de México ({OWNER_DASHBOARD_TZ}).</p>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        title="Actualizar ahora"
        aria-live="polite"
        className={cn(
          'inline-flex h-9 min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap rounded-xl border border-white/[0.08] bg-[#12121c] px-3 text-[11px] font-medium hover:bg-white/[0.05] disabled:cursor-progress sm:flex-none sm:px-3.5',
          stale ? 'text-amber-300' : 'text-white/75',
          FOCUS_RING,
        )}
      >
        <span
          className={cn(
            'h-2 w-2 shrink-0 rounded-full',
            stale ? 'bg-amber-400' : refreshing ? 'animate-pulse bg-violet-400' : lastUpdated == null ? 'bg-white/30' : 'bg-emerald-400',
          )}
          aria-hidden
        />
        {refreshing ? 'Actualizando…' : updatedText(lastUpdated, now)}
        {stale && !refreshing ? ' · desactualizado' : ''}
      </button>

      <div
        role="radiogroup"
        aria-label="Período del panel"
        className="inline-flex h-11 w-full items-center rounded-xl border border-white/[0.08] bg-[#12121c] p-1 sm:h-9 sm:w-auto"
        onKeyDown={(e) => {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          e.preventDefault();
          const idx = OWNER_RANGE_KEYS.indexOf(range);
          const next = OWNER_RANGE_KEYS[(idx + (e.key === 'ArrowRight' ? 1 : -1) + OWNER_RANGE_KEYS.length) % OWNER_RANGE_KEYS.length];
          onRangeChange(next);
          e.currentTarget.querySelector<HTMLButtonElement>(`[data-range="${next}"]`)?.focus();
        }}
      >
        {OWNER_RANGE_KEYS.map((key) => {
          const active = key === range;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              data-range={key}
              tabIndex={active ? 0 : -1}
              aria-checked={active}
              onClick={() => onRangeChange(key)}
              className={cn(
                'h-9 flex-1 whitespace-nowrap rounded-lg px-3.5 text-[12px] font-medium transition-colors sm:h-7 sm:flex-none',
                active ? 'bg-violet-600 text-white shadow-[0_6px_18px_-8px_rgba(139,92,246,0.9)]' : 'text-white/65 hover:text-white',
                FOCUS_RING,
              )}
            >
              {OWNER_RANGE_LABELS[key]}
            </button>
          );
        })}
      </div>
      {rangePending ? (
        <span className="sr-only" aria-live="polite">
          Cargando {OWNER_RANGE_LABELS[range]}
        </span>
      ) : null}
    </div>
  );
}
