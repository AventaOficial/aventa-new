'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/app/components/panel/utils';
import type { DecisionSummary, OverallState } from '../decision';
import { FOCUS_RING } from './kit';

const DOT: Record<OverallState, string> = {
  healthy: 'bg-emerald-400',
  attention: 'bg-amber-400',
  critical: 'bg-rose-500',
  unknown: 'bg-white/30',
};

const TONE: Record<OverallState, string> = {
  healthy: 'text-emerald-200',
  attention: 'text-amber-200',
  critical: 'text-rose-200',
  unknown: 'text-white/60',
};

function countsLabel(critical: number, high: number): string | null {
  const parts: string[] = [];
  if (critical > 0) parts.push(`${critical} crítica${critical === 1 ? '' : 's'}`);
  if (high > 0) parts.push(`${high} alta${high === 1 ? '' : 's'}`);
  return parts.length ? parts.join(' · ') : null;
}

export default function DecisionStrip({ summary, loading }: { summary: DecisionSummary; loading: boolean }) {
  const counts = countsLabel(summary.critical, summary.high);

  return (
    <section
      aria-label="Decisión del momento"
      data-ceo-decision={summary.state}
      className="mr-auto flex min-w-0 max-w-full flex-1 flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-white/[0.08] bg-[#12121c] px-3 py-2 text-[12px] sm:h-9 sm:basis-64 sm:flex-nowrap sm:py-0"
    >
      <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap font-semibold">
        <span className={cn('h-2 w-2 shrink-0 rounded-full', loading ? 'animate-pulse bg-violet-400' : DOT[summary.state])} aria-hidden />
        <span className={loading ? 'text-white/60' : TONE[summary.state]} aria-live="polite">
          {loading ? 'Revisando Aventa…' : summary.headline}
        </span>
      </span>
      {!loading && counts ? <span className="shrink-0 whitespace-nowrap tabular-nums text-white/55">{counts}</span> : null}
      {!loading && summary.next ? (
        <Link
          href={summary.next.href}
          className={cn('inline-flex min-w-0 items-center gap-1.5 font-medium text-violet-200 hover:text-white', FOCUS_RING)}
        >
          <span className="text-white/45">Siguiente:</span>
          <span className="truncate">{summary.next.action}</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
        </Link>
      ) : null}
    </section>
  );
}
