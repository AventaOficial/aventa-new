'use client';

import { useMemo } from 'react';
import {
  computeModerationTrust,
  type ModerationTrustInput,
  type ModerationTrustLevel,
} from '@/lib/moderation/confidenceBadge';
import type { ModerationHubMode } from '@/lib/moderation/hubConfig';
import { cn } from '@/app/components/panel/utils';

const STYLE: Record<
  ModerationTrustLevel,
  { chip: string; dot: string }
> = {
  high: {
    chip:
      'bg-emerald-500/15 text-emerald-800 ring-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-200',
    dot: 'bg-emerald-500',
  },
  medium: {
    chip:
      'bg-amber-500/15 text-amber-900 ring-amber-500/25 dark:bg-amber-500/20 dark:text-amber-100',
    dot: 'bg-amber-500',
  },
  low: {
    chip: 'bg-red-500/15 text-red-900 ring-red-500/25 dark:bg-red-500/20 dark:text-red-100',
    dot: 'bg-red-500',
  },
};

type Props = {
  offer: ModerationTrustInput;
  mode?: ModerationHubMode;
  size?: 'sm' | 'md';
  className?: string;
};

export default function ModerationConfidenceChip({
  offer,
  size = 'sm',
  className,
}: Props) {
  const trust = useMemo(() => computeModerationTrust(offer), [offer]);
  const styles = STYLE[trust.level];
  const tooltip = trust.reasons.join(' · ');

  return (
    <span
      title={tooltip}
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-semibold ring-1 ring-inset backdrop-blur-sm',
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]',
        styles.chip,
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', styles.dot)} aria-hidden />
      {trust.label}
    </span>
  );
}
