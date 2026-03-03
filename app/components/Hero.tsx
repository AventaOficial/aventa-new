'use client';

import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { useTheme } from '@/app/providers/ThemeProvider';
import AventaIcon from './AventaIcon';

const TAGLINE = 'Cada peso ahorrado es un peso ganado.';
const FRESHNESS_LINE = 'Ofertas nuevas cada día, elegidas por la comunidad.';

const ROTATE_INTERVAL_MS = 60_000; // cada minuto
const SHOW_FRESHNESS_MS = 12_000;  // se muestra 12 segundos
const FIRST_SHOW_DELAY_MS = 4_000; // primer guiño a los 4 s

interface HeroProps {
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
}

export default function Hero({ searchQuery: controlledQuery = '', onSearchChange }: HeroProps) {
  useTheme();
  const [internalQuery, setInternalQuery] = useState('');
  const [showFreshnessLine, setShowFreshnessLine] = useState(false);
  const searchQuery = onSearchChange ? controlledQuery : internalQuery;
  const setSearchQuery = onSearchChange ? (v: string) => onSearchChange(v) : setInternalQuery;

  useEffect(() => {
    const show = () => {
      setShowFreshnessLine(true);
      const hide = setTimeout(() => setShowFreshnessLine(false), SHOW_FRESHNESS_MS);
      return hide;
    };
    const first = setTimeout(show, FIRST_SHOW_DELAY_MS);
    const interval = setInterval(show, ROTATE_INTERVAL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, []);

  return (
    <header className="w-full pt-[env(safe-area-inset-top)]">
      <div className="md:hidden flex flex-col">
        <div className="flex items-start pl-5 pr-40 max-[420px]:pr-36 max-[400px]:pr-32 max-[380px]:pr-28 max-[360px]:pr-24 pt-5 max-[400px]:pt-3 min-w-0">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl max-[400px]:text-xl font-bold tracking-tight flex items-center gap-2">
              <AventaIcon size={28} className="text-[#1d1d1f] dark:text-white shrink-0" />
              <span className="bg-gradient-to-r from-[#1d1d1f] via-violet-700 to-[#1d1d1f] dark:from-white dark:via-violet-300 dark:to-white bg-clip-text text-transparent">
                AVENTA
              </span>
            </h1>
            <p className="text-sm max-[400px]:text-xs text-[#6e6e73] dark:text-[#a3a3a3] mt-0.5 leading-tight break-words">
              {TAGLINE}
            </p>
            <p
              className="text-xs max-[400px]:text-[11px] text-[#8e8e93] dark:text-[#737378] mt-0.5 leading-tight min-h-[1.25em] transition-opacity duration-500"
              aria-hidden
            >
              <span className={showFreshnessLine ? 'opacity-100' : 'opacity-0'}>{FRESHNESS_LINE}</span>
            </p>
          </div>
        </div>
        <div className="px-4 max-[400px]:px-3 pt-3 max-[400px]:pt-2 pb-4 max-[400px]:pb-3">
          <div className="flex items-center w-full min-h-[48px] max-[400px]:min-h-[44px] rounded-2xl bg-[#f5f5f7] dark:bg-[#1a1a1a] border border-[#e5e5e7] dark:border-[#262626] px-4 max-[400px]:px-3 transition-all duration-200 focus-within:border-violet-500/60 focus-within:ring-2 focus-within:ring-violet-500/20">
            <Search className="h-5 w-5 text-[#6e6e73] dark:text-[#a3a3a3] mr-3 flex-shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Busca productos, marcas, categorías..."
              className="flex-1 bg-transparent text-[#1d1d1f] dark:text-[#fafafa] placeholder-[#a1a1a6] dark:placeholder-[#737373] outline-none text-[15px] w-full min-w-0"
              aria-label="Buscar ofertas"
            />
          </div>
        </div>
      </div>

      <div className="hidden md:block relative w-full overflow-hidden bg-gradient-to-br from-[#1d1d1f] via-[#252528] to-[#1d1d1f] dark:from-[#0d0d0f] dark:via-[#151518] dark:to-[#0d0d0f] px-8 lg:px-12 pt-[calc(2rem+env(safe-area-inset-top))] pb-12 rounded-b-2xl mb-8 border-b border-gray-800/50">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-600/15 via-transparent to-pink-500/10" aria-hidden />
        <div className="relative container mx-auto max-w-4xl">
          <h1 className="text-center text-5xl lg:text-6xl font-bold text-white tracking-tight flex items-center justify-center gap-3">
            <AventaIcon size={48} className="lg:w-14 lg:h-14 text-white shrink-0" />
            AVENTA
          </h1>
          <p className="text-center text-base lg:text-lg text-gray-400 mt-2">
            {TAGLINE}
          </p>
          <p
            className="text-center text-sm lg:text-base text-gray-500 mt-1 mb-8 min-h-[1.5em] transition-opacity duration-500"
            aria-hidden
          >
            <span className={showFreshnessLine ? 'opacity-100' : 'opacity-0'}>{FRESHNESS_LINE}</span>
          </p>
          <div className="flex items-center w-full max-w-3xl lg:max-w-4xl mx-auto rounded-xl border border-gray-600/60 bg-white/5 backdrop-blur-sm px-5 py-3 focus-within:border-violet-500/60 focus-within:ring-1 focus-within:ring-violet-500/30 transition-all">
            <Search className="h-5 w-5 text-gray-400 mr-3 flex-shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Busca productos, marcas, categorías..."
              className="flex-1 bg-transparent text-gray-100 placeholder:text-gray-500 outline-none text-base w-full min-w-0"
              aria-label="Buscar ofertas"
            />
          </div>
        </div>
      </div>
    </header>
  );
}
