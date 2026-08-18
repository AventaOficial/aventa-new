'use client';

import { cn } from './utils';

export type ActivityItem = {
  id: string;
  type: string;
  message: string;
  time: string;
  tone?: 'default' | 'success' | 'warning' | 'info';
};

const TONE_DOT = {
  default: 'bg-white/30',
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  info: 'bg-blue-400',
};

export default function ActivityFeed({
  items,
  variant = 'dark',
  className,
}: {
  items: ActivityItem[];
  variant?: 'dark' | 'light';
  className?: string;
}) {
  return (
    <ul className={cn('space-y-0', className)}>
      {items.map((item, i) => (
        <li
          key={item.id}
          className={cn(
            'flex items-start gap-3 py-2.5',
            i < items.length - 1 && (variant === 'dark' ? 'border-b border-white/[0.04]' : 'border-b border-black/[0.04]')
          )}
        >
          <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', TONE_DOT[item.tone ?? 'default'])} />
          <div className="flex-1 min-w-0">
            <p className={cn('text-xs', variant === 'dark' ? 'text-white/70' : 'text-gray-700 dark:text-gray-300')}>
              {item.message}
            </p>
            <p className={cn('mt-0.5 text-[10px]', variant === 'dark' ? 'text-white/30' : 'text-gray-400')}>
              {item.time}
            </p>
          </div>
          <span className={cn('text-[10px] shrink-0', variant === 'dark' ? 'text-white/25' : 'text-gray-400')}>
            {item.type}
          </span>
        </li>
      ))}
    </ul>
  );
}
