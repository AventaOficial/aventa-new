'use client';

import { TrendingDown, TrendingUp } from 'lucide-react';
import Sparkline from './Sparkline';
import { cn, formatPct } from './utils';

export default function KpiCard({
  label,
  value,
  delta,
  deltaLabel,
  sparkline,
  variant = 'dark',
  compact = true,
  className,
}: {
  label: string;
  value: string;
  delta?: number | null;
  deltaLabel?: string | null;
  sparkline?: number[];
  variant?: 'dark' | 'light';
  compact?: boolean;
  className?: string;
}) {
  const isDark = variant === 'dark';
  const positive = delta != null && delta > 0;
  const negative = delta != null && delta < 0;

  return (
    <div
      className={cn(
        'rounded-xl border transition-all duration-200 aventa-lift',
        compact ? 'p-3' : 'p-4',
        isDark
          ? 'bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.05]'
          : 'bg-white/80 border-black/[0.06] hover:bg-white dark:bg-white/[0.04] dark:border-white/[0.08]',
        className
      )}
    >
      <p
        className={cn(
          'text-[10px] font-semibold uppercase tracking-[0.12em]',
          isDark ? 'text-white/45' : 'text-gray-500 dark:text-gray-400'
        )}
      >
        {label}
      </p>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <p
          className={cn(
            'font-semibold tracking-tight tabular-nums',
            compact ? 'text-lg' : 'text-2xl',
            isDark ? 'text-white' : 'text-gray-900 dark:text-gray-100'
          )}
        >
          {value}
        </p>
        {sparkline && sparkline.length > 1 ? (
          <Sparkline data={sparkline} variant={variant} className="shrink-0" />
        ) : null}
      </div>
      {(deltaLabel || delta != null) && (
        <p
          className={cn(
            'mt-1 text-[11px] font-medium flex items-center gap-0.5',
            positive
              ? 'text-emerald-400'
              : negative
                ? 'text-red-400'
                : isDark
                  ? 'text-white/40'
                  : 'text-gray-500'
          )}
        >
          {positive ? <TrendingUp className="h-3 w-3" /> : negative ? <TrendingDown className="h-3 w-3" /> : null}
          {deltaLabel ?? formatPct(delta)}
        </p>
      )}
    </div>
  );
}
