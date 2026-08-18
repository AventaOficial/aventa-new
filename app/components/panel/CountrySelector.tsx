'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, Globe } from 'lucide-react';
import { listConfiguredMarkets } from '@/lib/markets';
import { cn } from './utils';

export type MarketScope = 'global' | string;

const STORAGE_KEY = 'aventa-market-scope';

export function useMarketScope() {
  const [scope, setScopeState] = useState<MarketScope>('global');

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setScopeState(stored as MarketScope);
  }, []);

  const setScope = (s: MarketScope) => {
    setScopeState(s);
    localStorage.setItem(STORAGE_KEY, s);
  };

  return { scope, setScope };
}

export default function CountrySelector({
  variant = 'dark',
  className,
}: {
  variant?: 'dark' | 'light';
  className?: string;
}) {
  const { scope, setScope } = useMarketScope();
  const [open, setOpen] = useState(false);
  const markets = listConfiguredMarkets();

  const label =
    scope === 'global'
      ? 'Global'
      : markets.find((m) => m.id === scope)?.nameEs ?? scope.toUpperCase();

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-all duration-200',
          variant === 'dark'
            ? 'border-white/[0.08] bg-white/[0.04] text-white/70 hover:bg-white/[0.07]'
            : 'border-black/[0.06] bg-white/80 text-gray-700 hover:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/70'
        )}
      >
        <Globe className="h-3.5 w-3.5" />
        <span>{label}</span>
        <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div
            className={cn(
              'absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded-xl border py-1 shadow-xl',
              variant === 'dark'
                ? 'border-white/[0.1] bg-[#141418]/95 backdrop-blur-xl'
                : 'border-black/[0.08] bg-white/95 backdrop-blur-xl dark:border-white/[0.1] dark:bg-[#141418]/95'
            )}
          >
            <button
              type="button"
              onClick={() => {
                setScope('global');
                setOpen(false);
              }}
              className={cn(
                'flex w-full px-3 py-2 text-left text-xs hover:bg-white/[0.06]',
                scope === 'global' ? 'text-violet-400 font-semibold' : 'text-white/70'
              )}
            >
              🌎 Global
            </button>
            <div className="my-1 border-t border-white/[0.06]" />
            {markets.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setScope(m.id);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full px-3 py-2 text-left text-xs hover:bg-white/[0.06]',
                  scope === m.id ? 'text-violet-400 font-semibold' : 'text-white/70'
                )}
              >
                {m.nameEs}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
