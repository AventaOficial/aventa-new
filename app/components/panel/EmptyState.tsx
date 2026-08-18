'use client';

import type { ReactNode } from 'react';
import { cn } from './utils';

export default function EmptyState({
  title,
  description,
  icon,
  variant = 'dark',
  className,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  variant?: 'dark' | 'light';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-10 text-center',
        variant === 'dark' ? 'text-white/40' : 'text-gray-500',
        className
      )}
    >
      {icon ? <div className="mb-3 opacity-50">{icon}</div> : null}
      <p className={cn('text-sm font-medium', variant === 'dark' ? 'text-white/60' : 'text-gray-700 dark:text-gray-300')}>
        {title}
      </p>
      {description ? <p className="mt-1 text-xs max-w-xs">{description}</p> : null}
    </div>
  );
}
