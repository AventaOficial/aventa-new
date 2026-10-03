'use client';

import Link from 'next/link';
import { Bell, Menu, PanelLeft, Settings, TrendingUp, X } from 'lucide-react';
import CommandPalette from '@/app/components/panel/CommandPalette';
import { cn } from '@/app/components/panel/utils';

function AventaMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden>
      <defs>
        <linearGradient id="aventa-mark-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#c4b5fd" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <path d="M 118 432 L 256 88" fill="none" stroke="url(#aventa-mark-grad)" strokeWidth="64" strokeLinecap="round" />
      <path d="M 394 432 L 256 88" fill="none" stroke="url(#aventa-mark-grad)" strokeWidth="64" strokeLinecap="round" />
      <path d="M 256 300 L 196 372 h 120 Z" fill="#a78bfa" />
    </svg>
  );
}

export default function OwnerHeader({
  displayName,
  avatarUrl,
  onMenuClick,
  menuOpen,
  onPanelClick,
  panelLabel = 'Mostrar u ocultar navegación',
}: {
  displayName?: string | null;
  avatarUrl?: string | null;
  onMenuClick?: () => void;
  menuOpen?: boolean;
  onPanelClick?: () => void;
  panelLabel?: string;
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
    'h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-white/70 transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60';

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-white/[0.05] bg-[#0b0b14]/90 px-4 backdrop-blur-xl lg:px-8">
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
        <AventaMark className="h-8 w-8" />
        <span className="hidden text-[22px] font-semibold tracking-tight text-white sm:inline">Aventa</span>
        <span className="ml-1.5 hidden rounded-lg bg-violet-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-[0_6px_18px_-8px_rgba(139,92,246,0.9)] md:inline">
          CEO Dashboard
        </span>
      </Link>

      <div className="flex min-w-0 flex-1 justify-center px-2 xl:justify-start xl:pl-24">
        <CommandPalette variant="dark" />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Link href="/admin/owner/crecimiento" className={cn(iconBtn, 'hidden sm:inline-flex')} aria-label="Crecimiento y tendencias" title="Crecimiento y tendencias">
          <TrendingUp className="h-4 w-4" />
        </Link>
        {onPanelClick ? (
          <button type="button" onClick={onPanelClick} className={cn(iconBtn, 'hidden lg:inline-flex')} aria-label={panelLabel} title={panelLabel}>
            <PanelLeft className="h-4 w-4" />
          </button>
        ) : null}
        <Link href="/admin/owner#prioridades" className={cn(iconBtn, 'inline-flex')} aria-label="Alertas: prioridades del CEO" title="Alertas: prioridades del CEO">
          <Bell className="h-4 w-4" />
        </Link>
        <Link href="/admin/contexto" className={cn(iconBtn, 'hidden sm:inline-flex')} aria-label="Configuración" title="Configuración">
          <Settings className="h-4 w-4" />
        </Link>
        <Link
          href="/settings"
          className="ml-1 flex items-center gap-2.5 rounded-xl px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
          aria-label="Perfil y ajustes de cuenta"
        >
          <span className="relative flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.1] bg-violet-500/20 text-[12px] font-bold text-violet-200">
            <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                initials
              )}
            </span>
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0b0b14] bg-emerald-400" title="Tu sesión está activa" aria-hidden />
          </span>
          <span className="hidden min-w-0 text-left xl:block">
            <span className="block max-w-[140px] truncate text-[13px] font-semibold text-white">{displayName ?? 'Owner'}</span>
            <span className="block text-[11px] text-white/50">CEO de Aventa</span>
          </span>
        </Link>
      </div>
    </header>
  );
}
