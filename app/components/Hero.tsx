'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Search } from 'lucide-react';
import { useTheme } from '@/app/providers/ThemeProvider';

function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 0.6 13.35 9.2 22 10.8 13.35 12.4 12 21.4 10.65 12.4 2 10.8 10.65 9.2Z" />
    </svg>
  );
}

function HeroScene({ compact }: { compact?: boolean }) {
  return (
    <div className="relative h-full w-full overflow-visible" aria-hidden>
      <Image
        src="/brand/aventa-hero.png"
        alt=""
        fill
        priority
        unoptimized
        sizes={compact ? '260px' : '(max-width: 1024px) 320px, 420px'}
        className="pointer-events-none bg-transparent object-contain object-bottom select-none [filter:drop-shadow(0_18px_22px_rgba(20,16,28,0.12))] dark:[filter:drop-shadow(0_18px_24px_rgba(0,0,0,0.5))]"
      />
      <Sparkle className="pointer-events-none absolute left-[6%] top-[8%] z-[2] h-2.5 w-2.5 text-violet-500/75 dark:text-violet-400/80" />
      <Sparkle className="pointer-events-none absolute right-[10%] top-[14%] z-[2] h-2 w-2 text-violet-400/70" />
    </div>
  );
}

interface HeroProps {
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
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
    <header className="relative w-full pt-[env(safe-area-inset-top)] px-4 max-[400px]:px-3 md:px-8 lg:px-10 pb-3 md:pb-4">
      <div className="hero-liquid-glass relative mx-auto max-w-[1400px] overflow-hidden rounded-[28px] max-[400px]:rounded-[22px]">
        <div className="md:hidden">
          <div className="px-5 max-[400px]:px-4 pt-5 max-[400px]:pt-4">
            <h1 className="text-[1.7rem] max-[400px]:text-[1.45rem] font-semibold tracking-[-0.04em] leading-[1.15] text-[#1d1d1f] dark:text-[#fafafa]">
              Descubre ofertas que
              <br />
              <span className="text-violet-600 dark:text-violet-400">valen la pena</span>
            </h1>
            <p className="mt-2 max-w-[34ch] text-[14px] max-[400px]:text-[13px] leading-snug text-[#6e6e73] dark:text-[#a3a3a3]">
              La comunidad publica, vota y encuentra las mejores ofertas de México.
            </p>
          </div>
          <div className="relative mx-auto mt-0.5 h-[176px] max-[400px]:h-[156px] w-full max-w-[300px]">
            <HeroScene compact />
          </div>
          <div className="px-4 max-[400px]:px-3 pt-1 pb-3 max-[400px]:pb-2">
            <SearchField compact searchQuery={searchQuery} onChange={setSearchQuery} placeholder="iPhone, Nike, Costco…" />
          </div>
        </div>

        <div className="relative hidden md:block">
          <div className="relative min-h-[216px] lg:min-h-[248px] xl:min-h-[280px] px-8 lg:px-10">
            <div className="pointer-events-none absolute right-4 bottom-0 h-[216px] w-[270px] lg:right-8 lg:h-[248px] lg:w-[310px] xl:right-10 xl:h-[280px] xl:w-[350px]">
              <HeroScene />
            </div>
            <div className="relative z-10 flex min-h-[216px] lg:min-h-[248px] xl:min-h-[280px] max-w-[34rem] flex-col justify-center py-6 lg:py-7 pr-[250px] lg:pr-[300px] xl:pr-[340px]">
              <h1 className="text-[1.85rem] lg:text-[2.15rem] xl:text-[2.35rem] font-semibold tracking-[-0.045em] leading-[1.12] text-[#1d1d1f] dark:text-[#fafafa]">
                Descubre ofertas que
                <br />
                <span className="text-violet-600 dark:text-violet-400">valen la pena</span>
              </h1>
              <p className="mt-2.5 max-w-[42ch] text-[14px] lg:text-[15px] leading-snug text-[#6e6e73] dark:text-[#a3a3a3]">
                La comunidad publica, vota y encuentra las mejores ofertas de México.
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
