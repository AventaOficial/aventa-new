'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from './utils';
import StatusBadge from './StatusBadge';

type AlertSeverity = 'critical' | 'attention' | 'info';

export default function AlertCard({
  severity,
  title,
  impact,
  time,
  owner,
  href,
  ctaLabel = 'Revisar',
}: {
  severity: AlertSeverity;
  title: string;
  impact?: string;
  time?: string;
  owner?: string;
  href?: string;
  ctaLabel?: string;
}) {
  const tone = severity === 'critical' ? 'critical' : severity === 'attention' ? 'attention' : 'info';

  const inner = (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl border p-3.5 transition-all duration-200',
        severity === 'critical'
          ? 'border-red-500/20 bg-red-500/[0.06]'
          : severity === 'attention'
            ? 'border-amber-500/20 bg-amber-500/[0.06]'
            : 'border-white/[0.08] bg-white/[0.03]'
      )}
    >
      <StatusBadge tone={tone} pulse={severity === 'critical'}>
        {severity === 'critical' ? 'Crítico' : severity === 'attention' ? 'Atención' : 'Info'}
      </StatusBadge>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white/90">{title}</p>
        {impact ? <p className="mt-0.5 text-xs text-white/45">{impact}</p> : null}
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-white/35">
          {time ? <span>{time}</span> : null}
          {owner ? <span>{owner}</span> : null}
        </div>
      </div>
      {href ? (
        <ArrowRight className="h-4 w-4 shrink-0 text-white/30 mt-0.5" />
      ) : null}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block aventa-lift focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 rounded-xl">
        {inner}
      </Link>
    );
  }
  return inner;
}
