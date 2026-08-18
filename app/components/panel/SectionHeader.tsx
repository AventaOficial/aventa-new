'use client';

import type { ReactNode } from 'react';
import { cn } from './utils';

export default function SectionHeader({
  title,
  subtitle,
  action,
  variant = 'dark',
  className,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  variant?: 'dark' | 'light';
  className?: string;
}) {
  const isDark = variant === 'dark';
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div>
        <h2
          className={cn(
            'text-sm font-semibold tracking-tight',
            isDark ? 'text-white/90' : 'text-gray-900 dark:text-gray-100'
          )}
        >
          {title}
        </h2>
        {subtitle ? (
          <p className={cn('mt-0.5 text-xs', isDark ? 'text-white/40' : 'text-gray-500')}>{subtitle}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
