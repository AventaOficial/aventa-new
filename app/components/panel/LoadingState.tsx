'use client';

import { Loader2 } from 'lucide-react';
import { cn } from './utils';

export default function LoadingState({
  message = 'Cargando…',
  variant = 'dark',
  className,
}: {
  message?: string;
  variant?: 'dark' | 'light';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2 py-16 text-sm',
        variant === 'dark' ? 'text-white/40' : 'text-gray-500',
        className
      )}
    >
      <Loader2 className="h-4 w-4 animate-spin" />
      {message}
    </div>
  );
}
