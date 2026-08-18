'use client';

import Link from 'next/link';
import { Bell, Menu, X } from 'lucide-react';
import CommandPalette from '@/app/components/panel/CommandPalette';
import CountrySelector from '@/app/components/panel/CountrySelector';
import { cn } from '@/app/components/panel/utils';

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

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-white/[0.06] bg-[#060608]/80 backdrop-blur-xl px-4 lg:px-6">
      {onMenuClick ? (
        <button
          type="button"
          onClick={onMenuClick}
          className="lg:hidden rounded-lg p-2 text-white/50 hover:bg-white/[0.06] hover:text-white/80"
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      ) : null}

      <div className="hidden lg:flex items-center gap-3 shrink-0">
        <Link href="/admin/owner" className="group">
          <p className="text-sm font-semibold tracking-tight text-white/90 group-hover:text-white transition-colors">
            AVENTA
          </p>
          <p className="text-[10px] text-white/35 -mt-0.5">Founder OS</p>
        </Link>
      </div>

      <div className="flex flex-1 justify-center px-2">
        <CommandPalette variant="dark" />
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <CountrySelector variant="dark" className="hidden sm:block" />
        <button
          type="button"
          className="relative rounded-xl border border-white/[0.08] bg-white/[0.04] p-2 text-white/50 hover:bg-white/[0.07] hover:text-white/70 transition-all"
          aria-label="Notificaciones"
        >
          <Bell className="h-4 w-4" />
        </button>
        <Link
          href="/settings"
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.1] bg-violet-500/20 text-[11px] font-bold text-violet-200 overflow-hidden'
          )}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initials
          )}
        </Link>
      </div>
    </header>
  );
}
