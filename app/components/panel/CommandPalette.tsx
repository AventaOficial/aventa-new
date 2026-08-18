'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, X } from 'lucide-react';
import { OWNER_COMMAND_ITEMS } from '@/lib/owner/navigation';
import { cn } from './utils';

export default function CommandPalette({
  variant = 'dark',
}: {
  variant?: 'dark' | 'light';
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const toggle = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggle();
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  const filtered = OWNER_COMMAND_ITEMS.filter(
    (item) =>
      !query ||
      item.label.toLowerCase().includes(query.toLowerCase()) ||
      item.group.toLowerCase().includes(query.toLowerCase())
  );

  const isDark = variant === 'dark';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex flex-1 max-w-md items-center gap-2 rounded-xl border px-3 py-2 text-xs transition-all duration-200',
          isDark
            ? 'border-white/[0.08] bg-white/[0.03] text-white/40 hover:bg-white/[0.05] hover:text-white/60'
            : 'border-black/[0.06] bg-white/60 text-gray-400'
        )}
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 text-left truncate">Buscar en AVENTA…</span>
        <kbd className="hidden sm:inline rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-white/30">
          ⌘K
        </kbd>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden />
          <div className="relative w-full max-w-lg rounded-2xl border border-white/[0.1] bg-[#121216]/95 backdrop-blur-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center gap-2 border-b border-white/[0.08] px-4 py-3">
              <Search className="h-4 w-4 text-white/40" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar rutas, métricas, configuración…"
                className="flex-1 bg-transparent text-sm text-white/90 placeholder:text-white/30 outline-none"
              />
              <button type="button" onClick={() => setOpen(false)} className="text-white/30 hover:text-white/60">
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="max-h-72 overflow-y-auto py-2">
              {filtered.length === 0 ? (
                <li className="px-4 py-6 text-center text-xs text-white/40">Sin resultados</li>
              ) : (
                filtered.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-between px-4 py-2.5 text-sm text-white/70 hover:bg-white/[0.06] hover:text-white"
                    >
                      <span>{item.label}</span>
                      <span className="text-[10px] uppercase tracking-wide text-white/25">{item.group}</span>
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
