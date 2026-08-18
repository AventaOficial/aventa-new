'use client';

import { cn } from './utils';

export type HealthDimension = {
  id: string;
  label: string;
  score: number;
};

export default function HealthIndicator({
  score,
  dimensions,
  size = 'md',
  className,
}: {
  score: number;
  dimensions?: HealthDimension[];
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const dims = { sm: 64, md: 96, lg: 120 }[size];
  const stroke = 6;
  const radius = (dims - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const color =
    score >= 85 ? 'var(--status-ok)' : score >= 65 ? 'var(--status-attention)' : 'var(--status-critical)';

  return (
    <div className={cn('flex items-center gap-5', className)}>
      <div className="relative shrink-0" style={{ width: dims, height: dims }}>
        <svg width={dims} height={dims} className="-rotate-90">
          <circle
            cx={dims / 2}
            cy={dims / 2}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={stroke}
          />
          <circle
            cx={dims / 2}
            cy={dims / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums text-white">{score}</span>
          <span className="text-[9px] uppercase tracking-wider text-white/35">Health</span>
        </div>
      </div>
      {dimensions && dimensions.length > 0 ? (
        <ul className="flex-1 space-y-1.5">
          {dimensions.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-white/50">{d.label}</span>
              <span
                className={cn(
                  'font-medium tabular-nums',
                  d.score >= 85 ? 'text-emerald-400' : d.score >= 65 ? 'text-amber-400' : 'text-red-400'
                )}
              >
                {d.score}%
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
