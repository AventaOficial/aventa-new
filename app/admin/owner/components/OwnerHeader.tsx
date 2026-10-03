'use client';

import Link from 'next/link';
import { Menu, Settings, X, Zap } from 'lucide-react';
import CommandPalette from '@/app/components/panel/CommandPalette';
import { cn } from '@/app/components/panel/utils';

function AventaMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden>
      <path d="M 118 432 L 256 88" fill="none" stroke="currentColor" strokeWidth="56" strokeLinecap="round" />
      <path d="M 394 432 L 256 88" fill="none" stroke="currentColor" strokeWidth="56" strokeLinecap="round" />
      <path d="M 256 300 L 196 372 h 120 Z" fill="#8b5cf6" />
    </svg>
  );
}

export default function OwnerHeader({
  displayName,
  avatarUrl,
  onMenuClick,
  menuOpen,
}: {
  displayName?: string | null;
  avatarUrl?: string | null;
  onMenuClick?: () => void;
  menuOpen?: boolean;
}) {
  const initials = displayName
    ? displayName
        .split(' ')
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'AV';

  const iconBtn =
    'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-white/55 transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60';

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-white/[0.06] bg-[#07070b]/85 px-4 backdrop-blur-xl lg:px-6">
      {onMenuClick ? (
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-lg p-2 text-white/50 hover:bg-white/[0.06] hover:text-white/80 lg:hidden"
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      ) : null}

      <Link href="/admin/owner" className="flex shrink-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60">
        <AventaMark className="h-7 w-7 text-white" />
        <span className="hidden text-lg font-semibold tracking-tight text-white sm:inline">Aventa</span>
        <span className="hidden rounded-lg border border-violet-400/30 bg-violet-500/20 px-2 py-0.5 text-[11px] font-semibold text-violet-100 md:inline">
          CEO Dashboard
        </span>
      </Link>

      <div className="flex min-w-0 flex-1 justify-center px-2">
        <CommandPalette variant="dark" />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Link href="/admin/owner#prioridades" className={iconBtn} aria-label="Prioridades del CEO" title="Prioridades del CEO">
          <Zap className="h-4 w-4" />
        </Link>
        <Link href="/admin/contexto" className={cn(iconBtn, 'hidden sm:inline-flex')} aria-label="Configuración" title="Configuración">
          <Settings className="h-4 w-4" />
        </Link>
        <Link
          href="/settings"
          className="flex items-center gap-2 rounded-xl px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
          aria-label="Perfil y ajustes de cuenta"
        >
          <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-white/[0.1] bg-violet-500/20 text-[11px] font-bold text-violet-200">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </span>
          <span className="hidden min-w-0 text-left xl:block">
            <span className="block max-w-[140px] truncate text-xs font-semibold text-white/85">{displayName ?? 'Owner'}</span>
            <span className="block text-[10px] text-white/40">CEO de Aventa</span>
          </span>
        </Link>
      </div>
    </header>
  );
}
