'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Search } from 'lucide-react';
import { useTheme } from '@/app/providers/ThemeProvider';
import AventaIcon from './AventaIcon';

const TAGLINE = 'Cada peso ahorrado, es un peso ganado';

export const SEARCH_CHIPS = ['iPhone', 'PS5', 'Nike', 'Costco', 'Amazon', 'Samsung', 'Liverpool', 'Walmart'] as const;

interface HeroProps {
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
}

export function SearchChips({
  searchQuery,
  onPick,
}: {
  searchQuery: string;
  onPick: (value: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide md:flex-wrap md:overflow-visible">
      {SEARCH_CHIPS.map((chip) => {
        const active = searchQuery.trim().toLowerCase() === chip.toLowerCase();
        return (
          <button
            key={chip}
            type="button"
            onClick={() => onPick(active ? '' : chip)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all shrink-0 ${
              active
                ? 'bg-[#1d1d1f] dark:bg-[#fafafa] text-white dark:text-[#1d1d1f]'
                : 'bg-[#e8e8ed] dark:bg-[#2c2c2e] text-[#6e6e73] dark:text-[#a3a3a3] hover:bg-[#d2d2d7] dark:hover:bg-[#3a3a3c]'
            }`}
          >
            {chip}
          </button>
        );
      })}
    </div>
  );
}

export function SearchField({
  compact,
  searchQuery,
  onChange,
  placeholder = 'Buscar ofertas, productos o tiendas…',
}: {
  compact?: boolean;
  searchQuery: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div
      className={`flex items-center w-full rounded-full bg-white dark:bg-[#1a1a1a] border border-[#e5e5e7] dark:border-[#262626] px-4 transition-all duration-200 focus-within:border-violet-500/60 focus-within:ring-2 focus-within:ring-violet-500/20 ${
        compact ? 'min-h-[48px] max-[400px]:min-h-[44px] max-[400px]:px-3' : 'min-h-[48px] px-5'
      }`}
    >
      <Search className="h-5 w-5 text-[#6e6e73] dark:text-[#a3a3a3] mr-3 flex-shrink-0" />
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-[#1d1d1f] dark:text-[#fafafa] placeholder-[#a1a1a6] dark:placeholder-[#737373] outline-none text-[15px] w-full min-w-0"
        aria-label="Buscar ofertas"
      />
    </div>
  );
}

export default function Hero({ searchQuery: controlledQuery = '', onSearchChange }: HeroProps) {
  useTheme();
  const [internalQuery, setInternalQuery] = useState('');
  const searchQuery = onSearchChange ? controlledQuery : internalQuery;
  const setSearchQuery = onSearchChange ? (v: string) => onSearchChange(v) : setInternalQuery;

  return (
    <header className="w-full pt-[env(safe-area-inset-top)]">
      <div className="md:hidden flex flex-col">
        <div className="flex items-start pl-5 pr-4 max-[400px]:pr-3 pt-5 max-[400px]:pt-3 min-w-0 gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl max-[400px]:text-xl font-semibold tracking-[-0.03em] flex items-center gap-2">
              <AventaIcon size={28} className="text-[#1d1d1f] dark:text-white shrink-0" />
              <span className="text-[#1d1d1f] dark:text-white">AVENTA</span>
            </h1>
            <p className="text-[15px] max-[400px]:text-[13px] text-[#6e6e73] dark:text-[#a3a3a3] mt-1.5 leading-snug break-words font-normal pr-16">
              {TAGLINE}
            </p>
          </div>
          <Image
            src="/brand/aventa-bag.png"
            alt=""
            width={80}
            height={80}
            className="mt-9 w-[72px] h-[72px] max-[400px]:w-16 max-[400px]:h-16 object-contain shrink-0 pointer-events-none"
            priority
            unoptimized
          />
        </div>
        <div className="px-4 max-[400px]:px-3 pt-3 max-[400px]:pt-2 pb-3 max-[400px]:pb-2 space-y-2.5">
          <SearchField compact searchQuery={searchQuery} onChange={setSearchQuery} placeholder="iPhone, Nike, Costco…" />
          <SearchChips searchQuery={searchQuery} onPick={setSearchQuery} />
        </div>
      </div>

      <div className="hidden md:block">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-8 px-8 py-6 lg:px-10">
          <div className="min-w-0 max-w-xl">
            <h1 className="text-[2rem] lg:text-[2.35rem] font-semibold tracking-[-0.04em] leading-[1.15] text-[#1d1d1f] dark:text-[#fafafa]">
              Descubre ofertas que{' '}
              <span className="text-violet-600 dark:text-violet-400">valen la pena</span>
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-[#6e6e73] dark:text-[#a3a3a3]">
              La comunidad publica, vota y encuentra las mejores ofertas de México.
            </p>
          </div>
          <Image
            src="/brand/aventa-bag.png"
            alt=""
            width={280}
            height={280}
            className="hidden lg:block h-[200px] w-[200px] xl:h-[240px] xl:w-[240px] object-contain shrink-0 pointer-events-none"
            priority
            unoptimized
          />
        </div>
      </div>
    </header>
  );
}
