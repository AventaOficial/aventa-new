'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { useTheme } from '@/app/providers/ThemeProvider';

const TAGLINE = 'Cada peso ahorrado es un peso ganado.';

interface HeroProps {
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
}

export default function Hero({ searchQuery: controlledQuery = '', onSearchChange }: HeroProps) {
  useTheme();
  const [internalQuery, setInternalQuery] = useState('');
  const searchQuery = onSearchChange ? controlledQuery : internalQuery;
  const setSearchQuery = onSearchChange ? (v: string) => onSearchChange(v) : setInternalQuery;

  return (
    <header className="w-full pt-[env(safe-area-inset-top)]">
      {/* Mobile: logo como onboarding — espacio extra a la derecha para que "Crear cuenta" no tape el tagline */}
      <div className="md:hidden flex flex-col">
        <div className="flex items-start pl-5 pr-32 max-[380px]:pr-28 pt-5 max-[400px]:pt-3 min-w-0">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl max-[400px]:text-xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-[#1d1d1f] via-violet-700 to-[#1d1d1f] dark:from-white dark:via-violet-300 dark:to-white bg-clip-text text-transparent">
                AVENTA
              </span>
            </h1>
            <p className="text-sm max-[400px]:text-xs text-[#6e6e73] dark:text-[#a3a3a3] mt-0.5 leading-tight break-words">
              {TAGLINE}
            </p>
          </div>
        </div>
        {/* Buscador — rounded, premium */}
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

      {/* Desktop: hero amplio, identidad AVENTA */}
      <div className="hidden md:block relative w-full overflow-hidden bg-gradient-to-br from-[#1d1d1f] via-[#252528] to-[#1d1d1f] dark:from-[#0d0d0f] dark:via-[#151518] dark:to-[#0d0d0f] px-8 lg:px-12 pt-[calc(2rem+env(safe-area-inset-top))] pb-12 rounded-b-2xl mb-8 border-b border-gray-800/50">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-600/15 via-transparent to-pink-500/10" aria-hidden />
        <div className="relative container mx-auto max-w-4xl">
          <h1 className="text-center text-5xl lg:text-6xl font-bold text-white tracking-tight">
            AVENTA
          </h1>
          <p className="text-center text-base lg:text-lg text-gray-400 mt-2 mb-8">
            {TAGLINE}
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
