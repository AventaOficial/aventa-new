'use client';

import { CalendarDays, RefreshCw } from 'lucide-react';
import { OWNER_RANGE_KEYS, OWNER_RANGE_LABELS, type OwnerRangeKey } from '@/lib/owner/ownerRange';
import { OWNER_DASHBOARD_TZ } from '@/lib/owner/mxTime';
import { cn } from '@/app/components/panel/utils';
import { HealthPill, relativeTime } from './ui';
import type { HealthLevel } from './types';
import { STALE_AFTER_MS } from './useCommandCenter';

export default function CommandHeader({
  range,
  onRangeChange,
  rangePending,
  systemLevel,
  systemLabel,
  lastUpdated,
  refreshing,
  onRefresh,
  now,
}: {
  range: OwnerRangeKey;
  onRangeChange: (r: OwnerRangeKey) => void;
  rangePending: boolean;
  systemLevel: HealthLevel;
  systemLabel: string;
  lastUpdated: number | null;
  refreshing: boolean;
  onRefresh: () => void;
  now: number;
}) {
  const stale = lastUpdated != null && now - lastUpdated > STALE_AFTER_MS;
  const today = new Intl.DateTimeFormat('es-MX', {
    timeZone: OWNER_DASHBOARD_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(now));

  return (
    <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-violet-300/80">Aventa · CEO Command Center</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-white md:text-2xl">
          ¿Qué está pasando en Aventa y qué debo hacer?
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/45">
          <HealthPill level={systemLevel} label={systemLabel} />
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            {today}
          </span>
          <span aria-live="polite" className={cn('inline-flex items-center gap-1.5', stale && 'text-amber-300')}>
            <span className={cn('h-1.5 w-1.5 rounded-full', stale ? 'bg-amber-400' : refreshing ? 'bg-violet-400 animate-pulse' : 'bg-emerald-400')} aria-hidden />
            {refreshing ? 'Actualizando…' : lastUpdated ? `Actualizado ${relativeTime(new Date(lastUpdated).toISOString(), now)}` : 'Sin datos aún'}
            {stale ? ' · datos stale' : ''}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div
          role="radiogroup"
          aria-label="Período"
          className="inline-flex rounded-xl border border-white/[0.08] bg-white/[0.03] p-1"
          onKeyDown={(e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            e.preventDefault();
            const idx = OWNER_RANGE_KEYS.indexOf(range);
            const next = OWNER_RANGE_KEYS[(idx + (e.key === 'ArrowRight' ? 1 : -1) + OWNER_RANGE_KEYS.length) % OWNER_RANGE_KEYS.length];
            onRangeChange(next);
            const btn = e.currentTarget.querySelector<HTMLButtonElement>(`[data-range="${next}"]`);
            btn?.focus();
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
                  'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60',
                  active ? 'bg-violet-500/90 text-white shadow-[0_4px_14px_-6px_rgba(139,92,246,0.8)]' : 'text-white/55 hover:text-white/85',
                )}
              >
                {OWNER_RANGE_LABELS[key]}
              </button>
            );
          })}
        </div>
        {rangePending ? <span className="text-[11px] text-violet-300/80" aria-live="polite">Cargando {OWNER_RANGE_LABELS[range]}…</span> : null}
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs font-medium text-white/65 hover:bg-white/[0.07] hover:text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} aria-hidden />
          Actualizar
        </button>
      </div>
    </div>
  );
}
