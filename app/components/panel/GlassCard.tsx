'use client';

import type { ReactNode } from 'react';
import { cn } from './utils';

type GlassVariant = 'dark' | 'light';

export default function GlassCard({
  children,
  className,
  variant = 'dark',
  hover = true,
  padding = 'md',
  onClick,
}: {
  children: ReactNode;
  className?: string;
  variant?: GlassVariant;
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  onClick?: () => void;
}) {
  const pad =
    padding === 'none' ? '' : padding === 'sm' ? 'p-3' : padding === 'lg' ? 'p-6' : 'p-4';

  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'rounded-2xl text-left w-full',
        variant === 'dark' ? 'glass-dark text-[var(--owner-text)]' : 'glass-light',
        hover && 'aventa-lift',
        pad,
        className
      )}
    >
      {children}
    </Tag>
  );
}
