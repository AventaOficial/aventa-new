'use client';

import { cn } from './utils';

type StatusTone = 'ok' | 'attention' | 'critical' | 'info' | 'neutral';

const TONE_STYLES: Record<StatusTone, string> = {
  ok: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  attention: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  critical: 'bg-red-500/15 text-red-400 border-red-500/25',
  info: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
  neutral: 'bg-white/5 text-white/50 border-white/10',
};

export default function StatusBadge({
  children,
  tone = 'neutral',
  pulse = false,
  className,
}: {
  children: React.ReactNode;
  tone?: StatusTone;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide',
        TONE_STYLES[tone],
        pulse && 'aventa-pulse-soft',
        className
      )}
    >
      {children}
    </span>
  );
}
